"""Deterministic synthetic football match simulator.

Produces a football-realistic event stream (passes, carries, dribbles, shots, fouls,
cards, corners, substitutions, goals) for two fictional clubs. Output is fully
determined by (scenario, seed). Coordinates are absolute on a 105x68 pitch with the
home side attacking towards x=105.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from dataclasses import asdict, dataclass, field

from .teams import CLUBS, Player, Team, build_team

PITCH_X = 105.0
PITCH_Y = 68.0
GOAL = (PITCH_X, PITCH_Y / 2)


@dataclass
class Event:
    id: int
    t: int  # match clock in seconds (45:00 restarts the clock for the 2nd half)
    period: int
    clock: str
    team: str
    type: str
    player_id: str | None = None
    player: str | None = None
    x: float | None = None
    y: float | None = None
    end_x: float | None = None
    end_y: float | None = None
    outcome: str | None = None
    xg: float | None = None
    detail: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None and v != {}}


def shot_xg(p: float, y: float, header: bool = False) -> float:
    """Simple distance/angle xG model in the attacking frame (goal at p=105, y=34)."""
    dx = PITCH_X - p
    dy = abs(y - PITCH_Y / 2)
    dist = math.hypot(dx, dy)
    # Angle subtended by the 7.32m goal mouth.
    a = math.atan2(7.32 * dx, dx * dx + dy * dy - (7.32 / 2) ** 2)
    if a < 0:
        a += math.pi
    z = -1.1 - 0.11 * dist + 1.6 * a - (0.9 if header else 0.0)
    return round(max(0.01, min(0.85, 1 / (1 + math.exp(-z)))), 3)


def fmt_clock(t: int, period: int) -> str:
    limit = 45 * 60 if period == 1 else 90 * 60
    if t > limit:
        extra = math.ceil((t - limit) / 60)
        return f"{limit // 60}+{extra}"
    return f"{t // 60:02d}:{t % 60:02d}"


# --- Scenarios --------------------------------------------------------------

@dataclass
class Scenario:
    id: str
    title: str
    blurb: str
    home: int  # index into CLUBS
    away: int
    mods: Callable[[str, int], dict] = lambda side, minute: {}
    scripted: list[dict] = field(default_factory=list)
    storyline: Callable[[MatchResult], bool] = lambda r: True


def _classic_story(r: MatchResult) -> bool:
    h, a = r.final_score
    return 2 <= h + a <= 4 and abs(h - a) <= 1 and r.score_at(46) != (h, a)


def _comeback_mods(side: str, minute: int) -> dict:
    if side == "away" and minute < 55:
        return {"attack": 1.3}
    if side == "home" and minute >= 60:
        return {"attack": 1.45, "press": 1.35}
    if side == "away" and minute >= 60:
        return {"press": 0.75}
    return {}


def _comeback_story(r: MatchResult) -> bool:
    h60, a60 = r.score_at(60)
    h, a = r.final_score
    return a60 - h60 >= 1 and h >= a and (h - h60) >= 2


def _red_mods(side: str, minute: int) -> dict:
    if side == "home" and minute >= 33:
        return {"midfield": 0.82, "press": 0.8, "defense": 0.85}
    return {}


def _red_story(r: MatchResult) -> bool:
    h, a = r.final_score
    h33, a33 = r.score_at(33)
    return h33 >= a33 and a > h


def _press_mods(side: str, minute: int) -> dict:
    if side == "away":
        if minute < 55:
            return {"press": 1.35}
        if minute >= 62:
            return {"press": 0.55}
    if side == "home" and minute >= 62:
        return {"attack": 1.25}
    return {}


def _press_story(r: MatchResult) -> bool:
    h60, a60 = r.score_at(60)
    h, a = r.final_score
    return a60 > h60 and (h - h60) >= 2 and h >= a and r.xg_between("home", 62, 95) > 1.2


SCENARIOS: dict[str, Scenario] = {
    s.id: s
    for s in [
        Scenario("classic", "Harbour City vs Kingsmoor Athletic",
                 "An open, end-to-end league match.", 0, 1, storyline=_classic_story),
        Scenario("comeback", "Harbour City vs Westbridge Rovers",
                 "Westbridge race ahead; Harbour City change shape at the hour mark.",
                 0, 3, mods=_comeback_mods, storyline=_comeback_story),
        Scenario("red_card", "Ravenshollow FC vs Kingsmoor Athletic",
                 "A first-half red card changes everything.", 2, 1, mods=_red_mods,
                 scripted=[{"minute": 33, "type": "red_card", "team": "home", "role": "CB"}],
                 storyline=_red_story),
        Scenario("press_collapse", "Westbridge Rovers vs Ravenshollow FC",
                 "Ravenshollow press high until their legs go.", 3, 2, mods=_press_mods,
                 storyline=_press_story),
    ]
}


# --- Result -----------------------------------------------------------------

@dataclass
class MatchResult:
    scenario: str
    seed: int
    home: Team
    away: Team
    events: list[Event]

    @property
    def final_score(self) -> tuple[int, int]:
        return self.score_at(200)

    def score_at(self, minute: int) -> tuple[int, int]:
        h = a = 0
        for e in self.events:
            if e.type == "goal" and _abs_minute(e) < minute:
                if e.team == "home":
                    h += 1
                else:
                    a += 1
        return h, a

    def xg_between(self, side: str, m0: int, m1: int) -> float:
        return sum(e.xg or 0 for e in self.events
                   if e.type == "shot" and e.team == side and m0 <= _abs_minute(e) < m1)

    def lineups(self) -> dict:
        def team_dict(t: Team) -> dict:
            return {
                "id": t.id, "name": t.name, "short": t.short, "color": t.color,
                "alt_color": t.alt_color,
                "players": [_pdict(p) for p in t.players],
                "bench": [_pdict(p) for p in t.bench],
            }
        return {"home": team_dict(self.home), "away": team_dict(self.away)}


def _pdict(p: Player) -> dict:
    return {"id": p.id, "name": p.name, "number": p.number, "role": p.role,
            "anchor": list(p.anchor)}


def _abs_minute(e: Event) -> float:
    """Minute on a monotonic scale (first-half stoppage counts as 45.x)."""
    if e.period == 1:
        return min(e.t, 45 * 60 + 59) / 60
    return e.t / 60


# --- Engine -----------------------------------------------------------------

class Engine:
    def __init__(self, scenario: Scenario, seed: int):
        self.sc = scenario
        self.rng = random.Random(seed)
        team_rng = random.Random(1000 + scenario.home * 31 + scenario.away)
        self.teams = {
            "home": build_team("home", CLUBS[scenario.home], team_rng),
            "away": build_team("away", CLUBS[scenario.away], team_rng),
        }
        self.events: list[Event] = []
        self.t = 0
        self.period = 1
        self.yellows: dict[str, int] = {}
        self.scripted = list(scenario.scripted)
        self.subs_done = {"home": 0, "away": 0}

    # helpers ---------------------------------------------------------------
    def opp(self, side: str) -> str:
        return "away" if side == "home" else "home"

    def minute(self) -> int:
        return self.t // 60

    def mod(self, side: str, key: str) -> float:
        return self.sc.mods(side, self.minute()).get(key, 1.0)

    def stamina(self, side: str) -> float:
        ps = self.teams[side].on_pitch()
        return sum(p.stamina for p in ps) / len(ps)

    def press(self, side: str) -> float:
        t = self.teams[side]
        men = len(t.on_pitch()) / 11
        return t.press * self.mod(side, "press") * (0.55 + 0.45 * self.stamina(side)) * men

    def to_abs(self, side: str, p: float, y: float) -> tuple[float, float]:
        if side == "home":
            return round(p, 1), round(y, 1)
        return round(PITCH_X - p, 1), round(PITCH_Y - y, 1)

    def emit(self, side: str, type_: str, player: Player | None = None,
             at: tuple[float, float] | None = None, end: tuple[float, float] | None = None,
             **kw) -> Event:
        x = y = ex = ey = None
        if at is not None:
            x, y = self.to_abs(side, *at)
        if end is not None:
            ex, ey = self.to_abs(side, *end)
        e = Event(id=len(self.events) + 1, t=self.t, period=self.period,
                  clock=fmt_clock(self.t, self.period), team=side, type=type_,
                  player_id=player.id if player else None,
                  player=player.name if player else None,
                  x=x, y=y, end_x=ex, end_y=ey, **kw)
        self.events.append(e)
        return e

    def pick_player(self, side: str, p: float, y: float, exclude: Player | None = None,
                    roles: tuple[str, ...] | None = None) -> Player:
        cands = [pl for pl in self.teams[side].on_pitch()
                 if pl is not exclude and (roles is None or pl.role in roles)]
        if not cands:
            cands = [pl for pl in self.teams[side].on_pitch() if pl is not exclude]
        # Weight by closeness of the player's anchor (shifted with play) to the ball.
        shift = (p - 52.5) * 0.45
        weights = []
        for pl in cands:
            ax, ay = pl.anchor
            d = math.hypot(ax + shift - p, ay - y)
            w = math.exp(-d / 14) * (0.6 + pl.rating)
            if pl.role == "GK" and p > 30:
                w *= 0.02
            weights.append(w)
        return self.rng.choices(cands, weights=weights)[0]

    def tick(self, lo: int, hi: int) -> None:
        self.t += self.rng.randint(lo, hi)
        drain = 0.00055 * (hi + lo) / 2
        for side in ("home", "away"):
            press = self.press(side)
            for pl in self.teams[side].on_pitch():
                pl.stamina = max(0.35, pl.stamina - drain * (0.6 + press) * (1.3 - pl.rating))

    # main loop -------------------------------------------------------------
    def run(self) -> MatchResult:
        stoppage1 = self.rng.randint(60, 240)
        stoppage2 = self.rng.randint(180, 420)
        self.emit("home", "period_start", detail={"period": 1})
        side = "home"
        self.kickoff(side)
        side = self.play_until(side, 45 * 60 + stoppage1)
        self.emit("home", "period_end", detail={"period": 1})
        self.period = 2
        self.t = 45 * 60
        self.emit("away", "period_start", detail={"period": 2})
        self.kickoff("away")
        self.play_until("away", 90 * 60 + stoppage2)
        self.emit("home", "period_end", detail={"period": 2})
        return MatchResult(self.sc.id, 0, self.teams["home"], self.teams["away"], self.events)

    def kickoff(self, side: str) -> None:
        st = self.pick_player(side, 52, 34, roles=("ST",))
        self.emit(side, "kickoff", st, at=(52.5, 34))
        self.tick(1, 2)

    def play_until(self, side: str, end_t: int) -> str:
        p, y = 52.5, 34.0
        carrier = self.pick_player(side, p, y, roles=("CM",))
        while self.t < end_t:
            self.maybe_scripted()
            self.maybe_subs()
            res = self.step(side, carrier, p, y)
            side, carrier, p, y = res
        return side

    def maybe_scripted(self) -> None:
        for s in list(self.scripted):
            if self.minute() >= s["minute"]:
                self.scripted.remove(s)
                if s["type"] == "red_card":
                    team = self.teams[s["team"]]
                    victim = next(p for p in team.on_pitch() if p.role == s["role"])
                    self.emit(s["team"], "foul", victim, at=(35, 30),
                              detail={"reason": "denied a clear goalscoring opportunity"})
                    self.emit(s["team"], "red_card", victim, at=(35, 30))
                    victim.on_pitch = False
                    self.tick(30, 50)

    def maybe_subs(self) -> None:
        for side in ("home", "away"):
            done = self.subs_done[side]
            windows = [60, 70, 78]
            if done < len(windows) and self.minute() >= windows[done] + self.rng.randint(0, 4) \
                    and self.period == 2:
                team = self.teams[side]
                if not team.bench:
                    continue
                tired = min((p for p in team.on_pitch() if p.role != "GK"),
                            key=lambda p: p.stamina + p.rating * 0.2)
                repl = next((b for b in team.bench if b.role == tired.role), team.bench[0])
                team.bench.remove(repl)
                tired.on_pitch = False
                repl.on_pitch = True
                repl.role = tired.role
                repl.anchor = tired.anchor
                team.players.append(repl)
                self.emit(side, "substitution", repl, detail={
                    "off_id": tired.id, "off": tired.name, "on_id": repl.id, "on": repl.name})
                self.subs_done[side] += 1
                self.tick(20, 40)

    def step(self, side: str, carrier: Player, p: float, y: float):
        rng = self.rng
        team, opp = self.teams[side], self.teams[self.opp(side)]
        att = team.attack * self.mod(side, "attack")
        mid = team.midfield * self.mod(side, "midfield")
        dfn = opp.defense * self.mod(opp.id, "defense")
        press = self.press(opp.id)
        central = abs(y - 34) < 20

        # Fouls happen while defending.
        if rng.random() < 0.012 + 0.02 * press:
            return self.foul(side, carrier, p, y)

        if p < 35:
            weights = {"pass": 0.8, "carry": 0.15, "long": 0.05}
        elif p < 72:
            weights = {"pass": 0.68, "carry": 0.14, "dribble": 0.08, "long": 0.05,
                       "shot": 0.012 if p > 62 and central else 0.0}
        else:
            shot_w = (0.02 + (p - 72) / 33 * 0.13) * (1.0 if central else 0.35) * (0.7 + att)
            weights = {"pass": 0.48, "carry": 0.08, "dribble": 0.12,
                       "cross": 0.12 if not central else 0.03, "shot": shot_w}
        action = rng.choices(list(weights), weights=list(weights.values()))[0]

        if action == "shot":
            return self.shot(side, carrier, p, y)
        if action == "cross":
            return self.cross(side, carrier, p, y)

        if action in ("carry", "dribble"):
            np_ = min(100, p + rng.uniform(3, 12))
            ny = max(2, min(66, y + rng.uniform(-8, 8)))
            if action == "dribble":
                win = 0.42 + carrier.rating * 0.4 - dfn * 0.25 - press * 0.08
                defender = self.pick_player(opp.id, PITCH_X - p, PITCH_Y - y,
                                            roles=("CB", "RB", "LB", "CM"))
                if rng.random() < win:
                    self.emit(side, "dribble", carrier, at=(p, y), end=(np_, ny),
                              outcome="complete", detail={"beat": defender.name})
                    self.tick(2, 4)
                    return side, carrier, np_, ny
                self.emit(side, "dribble", carrier, at=(p, y), outcome="lost")
                self.emit(opp.id, "tackle", defender, at=(PITCH_X - p, PITCH_Y - y),
                          outcome="won", detail={"on": carrier.name})
                self.tick(2, 4)
                return opp.id, defender, PITCH_X - p, PITCH_Y - y
            self.emit(side, "carry", carrier, at=(p, y), end=(np_, ny))
            self.tick(2, 5)
            return side, carrier, np_, ny

        # Passes.
        long = action == "long"
        adv = rng.uniform(15, 35) if long else rng.uniform(-6, 14)
        if p > 75:
            adv = rng.uniform(-10, 8)
        np_ = max(3, min(102, p + adv))
        ny = max(2, min(66, y + rng.uniform(-22, 22)))
        succ = 0.70 + carrier.passing * 0.25 + (mid - 0.6) * 0.3 - press * 0.12 \
            - (0.08 if p > 72 else 0) - (0.22 if long else 0)
        receiver = self.pick_player(side, np_, ny, exclude=carrier)
        if np_ > 80 and adv > 4 and rng.random() < 0.05:
            self.emit(side, "pass", carrier, at=(p, y), end=(np_, ny), outcome="offside",
                      detail={"receiver": receiver.name})
            self.emit(side, "offside", receiver, at=(np_, ny))
            self.tick(15, 30)
            gk = self.pick_player(opp.id, 20, 34, roles=("CB", "GK"))
            return opp.id, gk, PITCH_X - np_, PITCH_Y - ny
        if rng.random() < succ:
            self.emit(side, "pass", carrier, at=(p, y), end=(np_, ny), outcome="complete",
                      detail={"receiver": receiver.name, "receiver_id": receiver.id,
                              "long": long})
            self.tick(2, 4)
            return side, receiver, np_, ny
        mid_p = (p + np_) / 2
        mid_y = (y + ny) / 2
        interceptor = self.pick_player(opp.id, PITCH_X - mid_p, PITCH_Y - mid_y)
        self.emit(side, "pass", carrier, at=(p, y), end=(mid_p, mid_y), outcome="incomplete",
                  detail={"intended": receiver.name, "long": long})
        self.emit(opp.id, "interception", interceptor, at=(PITCH_X - mid_p, PITCH_Y - mid_y))
        self.tick(2, 4)
        return opp.id, interceptor, PITCH_X - mid_p, PITCH_Y - mid_y

    def foul(self, side: str, carrier: Player, p: float, y: float):
        rng = self.rng
        opp = self.opp(side)
        fouler = self.pick_player(opp, PITCH_X - p, PITCH_Y - y)
        self.emit(opp, "foul", fouler, at=(PITCH_X - p, PITCH_Y - y),
                  detail={"on": carrier.name, "on_id": carrier.id})
        if rng.random() < 0.14 + (0.08 if p > 70 else 0):
            n = self.yellows.get(fouler.id, 0) + 1
            self.yellows[fouler.id] = n
            self.emit(opp, "yellow_card", fouler, at=(PITCH_X - p, PITCH_Y - y))
            if n == 2:
                self.emit(opp, "red_card", fouler, at=(PITCH_X - p, PITCH_Y - y),
                          detail={"second_yellow": True})
                fouler.on_pitch = False
        self.tick(20, 45)
        if p > 78 and abs(y - 34) < 18 and rng.random() < 0.45:
            # Direct free kick.
            taker = max(self.teams[side].on_pitch(), key=lambda pl: pl.finishing)
            return self.shot(side, taker, p, y, free_kick=True)
        self.emit(side, "free_kick", carrier, at=(p, y))
        self.tick(2, 4)
        return side, carrier, p, y

    def shot(self, side: str, shooter: Player, p: float, y: float, header: bool = False,
             free_kick: bool = False):
        rng = self.rng
        opp = self.teams[self.opp(side)]
        xg = shot_xg(p, y, header)
        if free_kick:
            xg = round(min(xg, 0.07), 3)
        gk = next((pl for pl in opp.on_pitch() if pl.role == "GK"), opp.on_pitch()[0])
        mult = (0.62 + shooter.finishing * 0.45) * (1.12 - gk.rating * 0.25) \
            * (0.9 + self.teams[side].attack * self.mod(side, "attack") * 0.2)
        r = rng.random()
        goal_p = min(0.95, xg * mult)
        detail = {"header": header, "free_kick": free_kick, "keeper": gk.name}
        if r < goal_p:
            self.emit(side, "shot", shooter, at=(p, y), end=(105, 34 + rng.uniform(-3, 3)),
                      outcome="goal", xg=xg, detail=detail)
            self.emit(side, "goal", shooter, at=(p, y), xg=xg, detail=detail)
            self.tick(50, 80)
            self.kickoff(self.opp(side))
            st = self.pick_player(self.opp(side), 52, 34, roles=("CM",))
            return self.opp(side), st, 52.5, 34.0
        r2 = rng.random()
        if r2 < 0.22:
            outcome = "blocked"
        elif r2 < 0.55:
            outcome = "saved"
        else:
            outcome = "off_target"
        self.emit(side, "shot", shooter, at=(p, y), end=(105, 34 + rng.uniform(-6, 6)),
                  outcome=outcome, xg=xg, detail=detail)
        if outcome == "saved":
            self.emit(opp.id, "save", gk, at=(5, 34), detail={"xg_faced": xg})
        self.tick(3, 6)
        if outcome in ("saved", "blocked") and rng.random() < 0.3:
            return self.corner(side, p, y)
        if outcome == "off_target":
            self.tick(15, 30)
        return opp.id, gk, 6.0, 34.0

    def cross(self, side: str, carrier: Player, p: float, y: float):
        rng = self.rng
        target = self.pick_player(side, 98, 34, exclude=carrier, roles=("ST", "LW", "RW", "CM"))
        if rng.random() < 0.3:
            self.emit(side, "cross", carrier, at=(p, y), end=(96, 34), outcome="complete",
                      detail={"receiver": target.name})
            self.tick(1, 2)
            return self.shot(side, target, rng.uniform(92, 99), rng.uniform(28, 40), header=True)
        self.emit(side, "cross", carrier, at=(p, y), end=(96, 34), outcome="incomplete")
        opp = self.opp(side)
        clearer = self.pick_player(opp, 10, 34, roles=("CB",))
        self.emit(opp, "clearance", clearer, at=(9, 34))
        self.tick(2, 4)
        if rng.random() < 0.2:
            return self.corner(side, p, y)
        return opp, clearer, rng.uniform(20, 40), rng.uniform(15, 53)

    def corner(self, side: str, p: float, y: float):
        rng = self.rng
        cy = 1.0 if y < 34 else 67.0
        taker = self.pick_player(side, 100, cy, roles=("RW", "LW", "CM"))
        self.emit(side, "corner", taker, at=(104.5, cy))
        self.tick(20, 35)
        if rng.random() < 0.3:
            target = self.pick_player(side, 98, 34, exclude=taker, roles=("CB", "ST", "CM"))
            return self.shot(side, target, rng.uniform(94, 100), rng.uniform(28, 40), header=True)
        opp = self.opp(side)
        clearer = self.pick_player(opp, 8, 34, roles=("CB", "GK"))
        self.emit(opp, "clearance", clearer, at=(8, 34))
        self.tick(2, 4)
        return opp, clearer, rng.uniform(18, 35), rng.uniform(15, 53)


def simulate(scenario_id: str = "classic", seed: int | None = None) -> MatchResult:
    sc = SCENARIOS[scenario_id]
    s = storyline_seed(scenario_id) if seed is None else seed
    res = Engine(sc, s).run()
    res.seed = s
    return res


_story_cache: dict[str, int] = {}


def storyline_seed(scenario_id: str, start: int = 1, limit: int = 400) -> int:
    """First seed (deterministic) whose simulated match fits the scenario's storyline."""
    if scenario_id in _story_cache:
        return _story_cache[scenario_id]
    sc = SCENARIOS[scenario_id]
    for s in range(start, start + limit):
        if sc.storyline(Engine(sc, s).run()):
            _story_cache[scenario_id] = s
            return s
    _story_cache[scenario_id] = start
    return start
