"""Moment detection: turns the event stream into candidate broadcast moments.

Each moment carries an evidence pack: the only facts the crew may cite about it.
"""

from __future__ import annotations

import itertools
from dataclasses import asdict, dataclass, field

from booth.sim.engine import Event

from .state import MatchState, other

_ids = itertools.count(1)


@dataclass
class Fact:
    key: str
    label: str
    value: float | int | str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Moment:
    kind: str
    team: str
    clock: str
    minute: float
    priority: float
    headline: str
    facts: list[Fact] = field(default_factory=list)
    player_id: str | None = None
    player: str | None = None
    event_id: int | None = None
    id: int = field(default_factory=lambda: next(_ids))

    def fact_dict(self) -> dict[str, float | int | str]:
        return {f.key: f.value for f in self.facts}

    def to_dict(self) -> dict:
        d = asdict(self)
        d["facts"] = [f.to_dict() for f in self.facts]
        return d


class MomentDetector:
    def __init__(self, state: MatchState, team_names: dict[str, str]):
        self.s = state
        self.names = team_names
        self.last_minute_check = -1
        self.last_momentum_team: str | None = None
        self.last_momentum_min = -99.0
        self.press_reported: set[tuple[str, str]] = set()
        self.first_half_ppda: dict[str, float | None] = {}
        self.spotlight_last: dict[str, float] = {}
        self.spotlight_global = -99.0

    def base_facts(self) -> list[Fact]:
        sc = self.s.scoreboard()
        return [
            Fact("clock", "Match clock", sc["clock"]),
            Fact("minute", "Minute", int(self.s.minute())),
            Fact("score_home", f"{self.names['home']} goals", sc["home"]),
            Fact("score_away", f"{self.names['away']} goals", sc["away"]),
        ]

    def feed(self, e: Event) -> list[Moment]:
        s = self.s
        out: list[Moment] = []
        n = self.names
        m = s.minute()

        if e.type == "goal":
            chain = [c for c in s.chain if c.team == e.team]
            passes = sum(1 for c in chain if c.type == "pass" and c.outcome == "complete")
            assist = next((c for c in reversed(chain[:-1])
                           if c.type in ("pass", "cross") and c.outcome == "complete"), None)
            ps = s.player_stats(e.player_id) or {}
            facts = self.base_facts() + [
                Fact("scorer", "Scorer", e.player or ""),
                Fact("shot_xg", "Chance quality (xG)", round(e.xg or 0, 2)),
                Fact("scorer_goals", f"{e.player} goals today", ps.get("goals", 1)),
                Fact("buildup_passes", "Passes in the build-up", passes),
                Fact("team_xg", f"{n[e.team]} total xG", round(s.teams[e.team].xg, 2)),
                Fact("opp_xg", f"{n[other(e.team)]} total xG", round(s.teams[other(e.team)].xg, 2)),
                Fact("header", "Headed", "yes" if e.detail.get("header") else "no"),
            ]
            if assist and assist.player:
                facts.append(Fact("assist", "Assist", assist.player))
            if e.detail.get("free_kick"):
                facts.append(Fact("free_kick", "Direct free kick", "yes"))
            out.append(Moment("goal", e.team, e.clock, m, 1.0,
                              f"GOAL {n[e.team]}: {e.player}", facts, e.player_id, e.player, e.id))

        elif e.type == "shot" and e.outcome != "goal" and (e.xg or 0) >= 0.22:
            facts = self.base_facts() + [
                Fact("shooter", "Shooter", e.player or ""),
                Fact("shot_xg", "Chance quality (xG)", round(e.xg or 0, 2)),
                Fact("outcome", "Outcome", e.outcome or ""),
                Fact("keeper", "Goalkeeper", e.detail.get("keeper", "")),
                Fact("team_xg", f"{n[e.team]} total xG", round(s.teams[e.team].xg, 2)),
            ]
            out.append(Moment("big_chance", e.team, e.clock, m, 0.7,
                              f"Big chance: {e.player}", facts, e.player_id, e.player, e.id))

        elif e.type == "red_card":
            facts = self.base_facts() + [
                Fact("player", "Sent off", e.player or ""),
                Fact("second_yellow", "Second yellow", "yes" if e.detail.get("second_yellow") else "no"),
                Fact("players_left", f"{n[e.team]} players on pitch", 11 - s.teams[e.team].red),
                Fact("possession_pct", f"{n[e.team]} possession so far", s.possession_pct(e.team)),
            ]
            out.append(Moment("red_card", e.team, e.clock, m, 0.95,
                              f"Red card: {e.player}", facts, e.player_id, e.player, e.id))

        elif e.type == "substitution":
            facts = self.base_facts() + [
                Fact("on", "Player on", e.detail.get("on", "")),
                Fact("off", "Player off", e.detail.get("off", "")),
            ]
            off_stats = s.player_stats(e.detail.get("off_id", ""))
            if off_stats:
                facts.append(Fact("off_touches", f"{e.detail.get('off')} touches", off_stats["touches"]))
            out.append(Moment("substitution", e.team, e.clock, m, 0.3,
                              f"Change for {n[e.team]}", facts, e.player_id, e.player, e.id))

        elif e.type == "period_end":
            ts = s.team_stats()
            kind = "half_time" if e.detail.get("period") == 1 else "full_time"
            facts = self.base_facts()
            for side in ("home", "away"):
                t = ts[side]
                facts += [
                    Fact(f"{side}_xg", f"{n[side]} xG", t["xg"]),
                    Fact(f"{side}_shots", f"{n[side]} shots", t["shots"]),
                    Fact(f"{side}_on_target", f"{n[side]} shots on target", t["on_target"]),
                    Fact(f"{side}_possession", f"{n[side]} possession %", t["possession_pct"]),
                    Fact(f"{side}_pass_pct", f"{n[side]} pass accuracy %", t["pass_pct"]),
                ]
            top = s.top_players(1)
            if top:
                facts.append(Fact("standout", "Standout player", top[0]["name"]))
            if kind == "half_time":
                self.first_half_ppda = {side: s.ppda(side) for side in ("home", "away")}
            leader = "home" if ts["home"]["goals"] >= ts["away"]["goals"] else "away"
            out.append(Moment(kind, leader, e.clock, m, 0.9,
                              "Half-time" if kind == "half_time" else "Full-time", facts))

        # Periodic, window-based checks once per match minute.
        mi = int(m)
        if mi != self.last_minute_check and mi >= 8:
            self.last_minute_check = mi
            out += self._momentum_check(m)
            out += self._press_check(m)
            out += self._spotlight_check(m)
        return out

    def _momentum_check(self, m: float) -> list[Moment]:
        w = self.s.window_stats(10)
        h, a = w["home"], w["away"]
        d = (h["xg"] - a["xg"]) * 4 + (h["final_third_entries"] - a["final_third_entries"]) * 0.15 \
            + (h["possession_pct"] - 50) / 25
        if abs(d) < 1.6:
            return []
        top = "home" if d > 0 else "away"
        if top == self.last_momentum_team and m - self.last_momentum_min < 15:
            return []
        if m - self.last_momentum_min < 7:
            return []
        self.last_momentum_team = top
        self.last_momentum_min = m
        n = self.names
        t, o = w[top], w[other(top)]
        facts = self.base_facts() + [
            Fact("window_min", "Window (minutes)", 10),
            Fact("xg_10", f"{n[top]} xG, last 10 min", t["xg"]),
            Fact("opp_xg_10", f"{n[other(top)]} xG, last 10 min", o["xg"]),
            Fact("shots_10", f"{n[top]} shots, last 10 min", t["shots"]),
            Fact("opp_shots_10", f"{n[other(top)]} shots, last 10 min", o["shots"]),
            Fact("fte_10", f"{n[top]} final-third entries, last 10 min", t["final_third_entries"]),
            Fact("opp_fte_10", f"{n[other(top)]} final-third entries, last 10 min",
                 o["final_third_entries"]),
            Fact("poss_10", f"{n[top]} possession %, last 10 min", t["possession_pct"]),
        ]
        return [Moment("momentum", top, self.s.last.clock, m, 0.65,
                       f"Momentum: {n[top]} on top", facts)]

    def _press_check(self, m: float) -> list[Moment]:
        if m < 55 or not self.first_half_ppda:
            return []
        w = self.s.window_stats(15)
        out = []
        n = self.names
        for side in ("home", "away"):
            base = self.first_half_ppda.get(side)
            now = w[side]["ppda"]
            if base is None or now is None:
                continue
            kind = None
            if now >= base * 1.7 and (side, "drop") not in self.press_reported:
                kind = "press_drop"
            elif now <= base * 0.55 and (side, "surge") not in self.press_reported:
                kind = "press_surge"
            if not kind:
                continue
            self.press_reported.add((side, "drop" if kind == "press_drop" else "surge"))
            facts = self.base_facts() + [
                Fact("ppda_first_half", f"{n[side]} PPDA, first half", base),
                Fact("ppda_last15", f"{n[side]} PPDA, last 15 min", now),
                Fact("window_min", "Window (minutes)", 15),
                Fact("high_actions_15", f"{n[side]} defensive actions in opposition half, last 15 min",
                     w[side]["def_actions_high"]),
                Fact("opp_xg_15", f"{n[other(side)]} xG, last 15 min", w[other(side)]["xg"]),
                Fact("ppda_note", "PPDA meaning",
                     "opponent passes allowed per defensive action; higher means less pressing"),
            ]
            head = f"{n[side]} pressing has dropped off" if kind == "press_drop" \
                else f"{n[side]} pressing surge"
            out.append(Moment(kind, side, self.s.last.clock, m, 0.6, head, facts))
        return out

    def _spotlight_check(self, m: float) -> list[Moment]:
        if m - self.spotlight_global < 12:
            return []
        recent = [e for e in self.s.window if m - self.s._abs_min(e) <= 15]
        score: dict[str, float] = {}
        for i, e in enumerate(recent):
            if not e.player_id:
                continue
            v = 0.0
            if e.type == "shot":
                v = 1 + (e.xg or 0) * 3
            elif e.type == "dribble" and e.outcome == "complete":
                v = 0.8
            elif e.type in ("tackle", "interception"):
                v = 0.5
            elif e.type == "save":
                v = 1.0
            elif e.type in ("pass", "cross") and e.outcome == "complete" and i + 1 < len(recent) \
                    and recent[i + 1].type == "shot" and recent[i + 1].team == e.team:
                v = 1.2
            score[e.player_id] = score.get(e.player_id, 0) + v
        if not score:
            return []
        pid, val = max(score.items(), key=lambda kv: kv[1])
        if val < 4.0 or m - self.spotlight_last.get(pid, -99) < 25:
            return []
        self.spotlight_last[pid] = m
        self.spotlight_global = m
        ps = self.s.player_stats(pid)
        p = self.s.players[pid]
        facts = self.base_facts() + [
            Fact("player", "Player", ps["name"]),
            Fact("shots", "Shots today", ps["shots"]),
            Fact("xg", "xG today", ps["xg"]),
            Fact("key_passes", "Key passes today", ps["key_passes"]),
            Fact("dribbles_won", "Dribbles won today", ps["dribbles_won"]),
            Fact("tackles_won", "Tackles won today", ps["tackles_won"]),
            Fact("interceptions", "Interceptions today", ps["interceptions"]),
            Fact("saves", "Saves today", ps["saves"]),
            Fact("pass_pct", "Pass accuracy % today", ps["pass_pct"]),
            Fact("touches", "Touches today", ps["touches"]),
        ]
        return [Moment("spotlight", p.team, self.s.last.clock, m, 0.45,
                       f"Spotlight: {ps['name']}", facts, pid, ps["name"])]
