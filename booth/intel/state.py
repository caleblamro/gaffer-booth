"""Live match state: every number the crew is allowed to say is computed here, in code.

Agents never do arithmetic. They read evidence packs built from this state, and the
verifier checks their output against the same facts.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from booth.sim.engine import Event

IN_POSSESSION = {"pass", "carry", "dribble", "shot", "cross", "kickoff", "free_kick", "corner"}
DEFENSIVE = {"tackle", "interception", "clearance", "foul"}


def other(side: str) -> str:
    return "away" if side == "home" else "home"


@dataclass
class PlayerLine:
    id: str
    name: str
    team: str
    passes: int = 0
    passes_completed: int = 0
    shots: int = 0
    on_target: int = 0
    xg: float = 0.0
    goals: int = 0
    dribbles_won: int = 0
    tackles_won: int = 0
    interceptions: int = 0
    saves: int = 0
    key_passes: int = 0
    touches: int = 0


@dataclass
class TeamLine:
    goals: int = 0
    shots: int = 0
    on_target: int = 0
    xg: float = 0.0
    passes: int = 0
    passes_completed: int = 0
    possession_s: float = 0.0
    corners: int = 0
    fouls: int = 0
    yellow: int = 0
    red: int = 0
    final_third_entries: int = 0
    def_actions_high: int = 0  # defensive actions in the opponent's half (pressing)
    opp_passes_own_half: int = 0  # for PPDA


@dataclass
class MatchState:
    teams: dict[str, TeamLine] = field(default_factory=lambda: {"home": TeamLine(), "away": TeamLine()})
    players: dict[str, PlayerLine] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)  # team id -> display name
    last: Event | None = None
    possession_team: str | None = None
    chain: list[Event] = field(default_factory=list)  # current possession chain
    window: deque = field(default_factory=lambda: deque())  # recent events for rolling stats
    momentum: float = 0.0  # >0 home on top, <0 away on top; EWMA of threat
    momentum_series: list[tuple[float, float]] = field(default_factory=list)
    _momentum_last_min: int = -1
    events_seen: int = 0

    # --- ingestion ------------------------------------------------------
    def apply(self, e: Event) -> None:
        self.events_seen += 1
        tl = self.teams[e.team]
        pl = None
        if e.player_id:
            pl = self.players.setdefault(e.player_id, PlayerLine(e.player_id, e.player or "", e.team))
            pl.touches += 1 if e.type in IN_POSSESSION else 0

        # Possession clock: time since last event goes to whoever had the ball.
        if self.last is not None and self.possession_team and e.period == self.last.period:
            dt = max(0, e.t - self.last.t)
            if dt < 60:  # ignore long stoppages
                self.teams[self.possession_team].possession_s += dt

        if e.type in IN_POSSESSION:
            if self.possession_team != e.team:
                self.chain = []
            self.possession_team = e.team
            self.chain.append(e)
        elif e.type in ("interception", "tackle", "save", "clearance"):
            self.possession_team = e.team
            self.chain = [e]

        t = e.type
        if t == "pass":
            tl.passes += 1
            pl.passes += 1
            if e.outcome == "complete":
                tl.passes_completed += 1
                pl.passes_completed += 1
                if self._attacking_x(e.team, e.x) < 70 <= self._attacking_x(e.team, e.end_x):
                    tl.final_third_entries += 1
            if self._attacking_x(e.team, e.x) < 52.5:
                self.teams[other(e.team)].opp_passes_own_half += 1
        elif t == "carry":
            if self._attacking_x(e.team, e.x) < 70 <= self._attacking_x(e.team, e.end_x):
                tl.final_third_entries += 1
        elif t == "dribble" and e.outcome == "complete":
            pl.dribbles_won += 1
        elif t == "shot":
            tl.shots += 1
            pl.shots += 1
            tl.xg += e.xg or 0
            pl.xg += e.xg or 0
            if e.outcome in ("goal", "saved"):
                tl.on_target += 1
                pl.on_target += 1
            # The completed pass before a shot is a key pass.
            prev = self.chain[-2] if len(self.chain) >= 2 else None
            if prev is not None and prev.type in ("pass", "cross") and prev.outcome == "complete" \
                    and prev.player_id and prev.player_id in self.players:
                self.players[prev.player_id].key_passes += 1
        elif t == "goal":
            tl.goals += 1
            pl.goals += 1
        elif t == "corner":
            tl.corners += 1
        elif t == "foul":
            tl.fouls += 1
        elif t == "yellow_card":
            tl.yellow += 1
        elif t == "red_card":
            tl.red += 1
        elif t == "save":
            pl.saves += 1
        elif t == "tackle":
            pl.tackles_won += 1
        elif t == "interception":
            pl.interceptions += 1

        if t in DEFENSIVE and e.x is not None and self._attacking_x(e.team, e.x) > 52.5:
            tl.def_actions_high += 1

        self.window.append(e)
        while self.window and self._abs_min(e) - self._abs_min(self.window[0]) > 15:
            self.window.popleft()
        self._update_momentum(e)
        self.last = e

    # --- derived --------------------------------------------------------
    @staticmethod
    def _attacking_x(team: str, x: float | None) -> float:
        if x is None:
            return 0.0
        return x if team == "home" else 105 - x

    @staticmethod
    def _abs_min(e: Event) -> float:
        if e.period == 1:
            return min(e.t, 45 * 60 + 59) / 60
        return e.t / 60 + 0.99  # keep 2nd half strictly after 1st-half stoppage

    def minute(self) -> float:
        return self._abs_min(self.last) if self.last else 0.0

    def possession_pct(self, side: str) -> int:
        tot = self.teams["home"].possession_s + self.teams["away"].possession_s
        if tot == 0:
            return 50
        return round(100 * self.teams[side].possession_s / tot)

    def pass_pct(self, side: str) -> int:
        t = self.teams[side]
        return round(100 * t.passes_completed / t.passes) if t.passes else 0

    def ppda(self, side: str) -> float | None:
        """Opponent passes in their own half per defensive action high up. Lower = more pressing."""
        t = self.teams[side]
        if t.def_actions_high == 0:
            return None
        return round(t.opp_passes_own_half / t.def_actions_high, 1)

    def window_stats(self, minutes: float) -> dict[str, dict]:
        now = self.minute()
        out = {s: {"xg": 0.0, "shots": 0, "final_third_entries": 0, "possession_s": 0.0,
                   "passes": 0, "def_actions_high": 0, "opp_passes_own_half": 0}
               for s in ("home", "away")}
        prev = None
        for e in self.window:
            if now - self._abs_min(e) > minutes:
                prev = e
                continue
            o = out[e.team]
            if e.type == "shot":
                o["shots"] += 1
                o["xg"] += e.xg or 0
            if e.type == "pass":
                o["passes"] += 1
                if self._attacking_x(e.team, e.x) < 52.5:
                    out[other(e.team)]["opp_passes_own_half"] += 1
            if e.type in ("pass", "carry") and (e.outcome in (None, "complete")) and \
                    self._attacking_x(e.team, e.x) < 70 <= self._attacking_x(e.team, e.end_x):
                o["final_third_entries"] += 1
            if e.type in DEFENSIVE and self._attacking_x(e.team, e.x) > 52.5:
                o["def_actions_high"] += 1
            if prev is not None and prev.period == e.period and e.t - prev.t < 60:
                owner = prev.team if prev.type in IN_POSSESSION else e.team
                out[owner]["possession_s"] += e.t - prev.t
            prev = e
        tot = out["home"]["possession_s"] + out["away"]["possession_s"] or 1
        for s in out:
            out[s]["xg"] = round(out[s]["xg"], 2)
            out[s]["possession_pct"] = round(100 * out[s]["possession_s"] / tot)
            d = out[s]["def_actions_high"]
            out[s]["ppda"] = round(out[s]["opp_passes_own_half"] / d, 1) if d else None
        return out

    def _update_momentum(self, e: Event) -> None:
        threat = 0.0
        sign = 1 if e.team == "home" else -1
        if e.type == "shot":
            threat = 1.5 + 6 * (e.xg or 0)
        elif e.type in ("pass", "carry") and e.outcome in (None, "complete"):
            ax = self._attacking_x(e.team, e.end_x)
            threat = 0.12 if ax > 70 else 0.0
            threat += 0.25 if ax > 88 else 0.0
        elif e.type == "corner":
            threat = 0.6
        self.momentum = self.momentum * 0.985 + sign * threat
        m = int(self.minute())
        if m != self._momentum_last_min:
            self._momentum_last_min = m
            self.momentum_series.append((round(self.minute(), 1), round(self.momentum, 2)))

    def scoreboard(self) -> dict:
        return {
            "home": self.teams["home"].goals,
            "away": self.teams["away"].goals,
            "clock": self.last.clock if self.last else "00:00",
            "period": self.last.period if self.last else 1,
        }

    def team_stats(self) -> dict:
        def one(s: str) -> dict:
            t = self.teams[s]
            return {
                "goals": t.goals, "shots": t.shots, "on_target": t.on_target,
                "xg": round(t.xg, 2), "possession_pct": self.possession_pct(s),
                "pass_pct": self.pass_pct(s), "passes": t.passes, "corners": t.corners,
                "fouls": t.fouls, "yellow": t.yellow, "red": t.red,
                "final_third_entries": t.final_third_entries, "ppda": self.ppda(s),
            }
        return {"home": one("home"), "away": one("away")}

    def player_stats(self, player_id: str) -> dict | None:
        p = self.players.get(player_id)
        if not p:
            return None
        return {
            "name": p.name, "team": p.team, "passes": p.passes,
            "pass_pct": round(100 * p.passes_completed / p.passes) if p.passes else 0,
            "shots": p.shots, "on_target": p.on_target, "xg": round(p.xg, 2), "goals": p.goals,
            "dribbles_won": p.dribbles_won, "tackles_won": p.tackles_won,
            "interceptions": p.interceptions, "saves": p.saves, "key_passes": p.key_passes,
            "touches": p.touches,
        }

    def top_players(self, n: int = 5) -> list[dict]:
        def score(p: PlayerLine) -> float:
            return p.goals * 3 + p.xg * 2 + p.key_passes * 0.8 + p.dribbles_won * 0.5 \
                + (p.tackles_won + p.interceptions) * 0.3 + p.saves * 0.7
        ranked = sorted(self.players.values(), key=score, reverse=True)[:n]
        return [self.player_stats(p.id) | {"id": p.id} for p in ranked]
