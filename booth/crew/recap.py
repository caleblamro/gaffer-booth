"""Post-match recap: match report, player ratings and social posts, all verified.

Ratings are computed in code. The Recap writer agent turns the evidence into a short
report and social posts; the verifier checks them exactly as it does live segments.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from pydantic import BaseModel, Field

from booth.intel.moments import MomentDetector
from booth.intel.state import MatchState
from booth.sim.engine import MatchResult

from .offline import LANG_NAMES, poss
from .verify import Evidence, verify

RECAP_PROMPT = (
    "You are the Recap writer for a football studio. From the evidence, write a match report "
    "of at most 110 words that tells the story of the match (turning points, why the result "
    "happened), plus 3 short social posts (max 200 characters each, no hashtags spam, at most "
    "one emoji). Use ONLY numbers and names that appear in the evidence, as digits. "
    "Everything is a synthetic, fictional match."
)


class RecapOut(BaseModel):
    headline: str = Field(description="newspaper-style headline, max 9 words, no numbers")
    report: str
    social: list[str]


def player_ratings(state: MatchState, reds: set[str]) -> list[dict]:
    rows = []
    for pid, p in state.players.items():
        if p.touches < 8 and p.saves == 0:
            continue
        pass_pct = p.passes_completed / p.passes if p.passes else 0.75
        r = 6.0 + p.goals * 1.0 + p.xg * 0.6 + p.key_passes * 0.3 + p.dribbles_won * 0.1 \
            + (p.tackles_won + p.interceptions) * 0.035 + p.saves * 0.25 + (pass_pct - 0.78) * 3
        if pid in reds:
            r -= 1.5
        rows.append({"id": pid, "name": p.name, "team": p.team,
                     "rating": round(max(4.0, min(10.0, r)), 1),
                     "goals": p.goals, "xg": round(p.xg, 2), "key_passes": p.key_passes,
                     "touches": p.touches})
    return sorted(rows, key=lambda r: r["rating"], reverse=True)


def build_evidence(match: MatchResult) -> tuple[dict, MatchState, list[dict]]:
    names = {"home": match.home.name, "away": match.away.name}
    state = MatchState(names=names)
    det = MomentDetector(state, names)
    turning: list[dict] = []
    for e in match.events:
        state.apply(e)
        for m in det.feed(e):
            if m.kind in ("goal", "red_card", "momentum", "press_drop", "press_surge"):
                turning.append({"clock": m.clock, "what": m.headline})
    reds = {e.player_id for e in match.events if e.type == "red_card" and e.player_id}
    ratings = player_ratings(state, reds)
    ts = state.team_stats()
    goals = [{"clock": e.clock, "team": names[e.team], "scorer": e.player}
             for e in match.events if e.type == "goal"]
    mom = ratings[0] if ratings else None
    facts: dict[str, Any] = {
        "home": names["home"], "away": names["away"],
        "score_home": ts["home"]["goals"], "score_away": ts["away"]["goals"],
        "stats_home": ts["home"], "stats_away": ts["away"],
        "goals": goals, "turning_points": turning,
    }
    if mom:
        facts["player_of_the_match"] = {"name": mom["name"], "rating": mom["rating"],
                                        "goals": mom["goals"], "xg": mom["xg"]}
    return facts, state, ratings


def offline_recap(facts: dict) -> RecapOut:
    h, a = facts["home"], facts["away"]
    sh, sa = facts["score_home"], facts["score_away"]
    th, ta = facts["stats_home"], facts["stats_away"]
    if sh == sa:
        head = f"{h} and {a} share the points"
        lead = f"{h} and {a} drew {sh}-{sa}."
    else:
        win, lose = (h, a) if sh > sa else (a, h)
        head = f"{win} edge past {lose}" if abs(sh - sa) == 1 else f"{win} beat {lose}"
        lead = f"{win} beat {lose} {max(sh, sa)}-{min(sh, sa)}."
    scorers = ", ".join(f"{g['scorer']} ({g['clock']})" for g in facts["goals"]) or "no one"
    xg_line = f"On xG it finished {th['xg']} to {ta['xg']}, with {th['shots']} shots to {ta['shots']}."
    report = f"{lead} Goals: {scorers}. {xg_line}"
    pom = facts.get("player_of_the_match")
    if pom:
        report += f" {pom['name']} was the standout with a {pom['rating']} rating."
    social = [
        f"FT: {h} {sh}-{sa} {a}.",
        f"{poss(h)} xG: {th['xg']}. {poss(a)}: {ta['xg']}. Shots {th['shots']}-{ta['shots']}.",
    ]
    if pom:
        social.append(f"Player of the match: {pom['name']} ({pom['rating']}).")
    return RecapOut(headline=head, report=report, social=social)


async def make_recap(match: MatchResult, client: Any | None, langs: list[str] | None = None) -> dict:
    facts, state, ratings = build_evidence(match)
    roster = [p.name for t in (match.home, match.away) for p in t.players + t.bench]
    ev = Evidence.from_facts(facts)
    for r in ratings[:5]:
        ev.add(f"rating_{r['id']}", {"name": r["name"], "rating": r["rating"]})
    mode = "template"
    out: RecapOut | None = None
    if client is not None:
        from agent_framework import Agent

        writer = Agent(client, RECAP_PROMPT, name="Recap")
        prompt = json.dumps({"evidence": facts, "top_ratings": ratings[:5],
                             "language": LANG_NAMES.get((langs or ["en"])[0], "English")})
        for _ in range(2):
            try:
                resp = await asyncio.wait_for(writer.run(prompt, options={"response_format": RecapOut}),
                                              float(os.getenv("BOOTH_LLM_TIMEOUT", "8")) * 2)
                cand = resp.value or RecapOut.model_validate_json(resp.text)
            except Exception:
                break
            texts = [cand.report, *cand.social]
            if all(verify(t, ev, roster).ok for t in texts):
                out, mode = cand, "llm"
                break
            prompt += "\n\nA previous draft used numbers or names not in the evidence. Use only evidence."
    if out is None:
        out = offline_recap(facts)
    checks = [verify(t, ev, roster) for t in (out.report, *out.social)]
    return {
        "headline": out.headline,
        "report": out.report,
        "social": out.social,
        "ratings": ratings[:14],
        "score": {"home": facts["score_home"], "away": facts["score_away"]},
        "teams": {"home": facts["home"], "away": facts["away"]},
        "stats": state.team_stats(),
        "turning_points": facts["turning_points"],
        "mode": mode,
        "verification": {
            "ok": all(c.ok for c in checks),
            "checked": sum(len(c.checked) for c in checks),
            "violations": [v for c in checks for v in c.violations],
        },
    }
