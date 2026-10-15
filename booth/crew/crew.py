"""The broadcast crew: Director, Analyst, Verifier, Graphics and Commentator agents.

Each agent is a Microsoft Agent Framework `Agent`. Every agent has a deterministic
fallback so the broadcast never stalls: if a model is missing, slow, or fails
verification twice, the fallback tier takes the segment.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from booth.intel.moments import Moment
from booth.intel.state import MatchState

from . import offline
from .graphics import build_overlay
from .llm import run_structured
from .verify import Evidence, VerifyResult, verify

log = logging.getLogger(__name__)

Emit = Callable[[dict], Awaitable[None]]
BASE_KEYS = {"clock", "minute", "score_home", "score_away"}
Slot = Literal["full_screen", "stat_card", "lower_third", "player_card"]


class DirectorOut(BaseModel):
    moment_id: int | None = Field(description="id of the moment to put on air, or null to hold")
    slot: Slot | None = Field(default=None, description="graphic slot to use")
    reason: str = Field(description="one short sentence explaining the call")


class AnalystOut(BaseModel):
    insight: str = Field(description="1-2 sentences explaining what happened and why it matters")


class JudgeOut(BaseModel):
    supported: bool
    issue: str = ""


class GraphicsOut(BaseModel):
    title: str = Field(description="2-3 word ALL CAPS headline")
    subtitle: str = Field(description="short subtitle, max 8 words, no numbers")
    fact_keys: list[str] = Field(description="2-5 fact keys to display, most important first")


class CommentaryLine(BaseModel):
    lang: str
    text: str


class CommentaryOut(BaseModel):
    lines: list[CommentaryLine]


RULES = (
    "Use ONLY numbers that appear in the evidence or in tool results, written as digits "
    "exactly as given (you may round). Never invent statistics, minutes, or player names. "
    "Everything is a synthetic, fictional match."
)

DIRECTOR_PROMPT = (
    "You are the Director in a live football broadcast control room. Each turn you get a "
    "queue of candidate moments detected from the live data and what has aired recently. "
    "Pick at most one moment to air now and the graphic slot for it. Prefer fresh, "
    "high-impact moments; never air something the audience has already moved past; avoid "
    "repeating the same story twice in a row. Slots: full_screen (goals, half/full time), "
    "stat_card (trends: momentum, pressing), lower_third (cards, chances, subs), "
    "player_card (player spotlight)."
)
ANALYST_PROMPT = (
    "You are the Analyst. Explain the moment for TV viewers in 1-2 punchy sentences: what "
    "happened and WHY it matters, grounded in the evidence. Call tools if extra context "
    "would sharpen the point (e.g. a player's stats or the last-10-minutes trend). " + RULES
)
JUDGE_PROMPT = (
    "You are the Verifier. Decide whether every claim in the analyst's insight is "
    "supported by the evidence and tool results provided. Causal claims must follow from "
    "the numbers. Reply supported=false with the issue if anything is unsupported."
)
GRAPHICS_PROMPT = (
    "You are the Graphics operator. Choose a short title, a subtitle without numbers, and "
    "the 2-5 most telling fact keys (from the evidence keys) for the on-screen graphic. "
    "Code fills in values, so only return keys."
)
COMMENTATOR_PROMPT = (
    "You are the live Commentator. Write ONE short, energetic broadcast line (max 22 words) "
    "per requested language, natural in each language, built on the analyst's insight. "
    + RULES
)


class Crew:
    def __init__(self, state: MatchState, names: dict[str, str], colors: dict[str, str],
                 roster: list[str], langs: list[str], emit: Emit, client: Any | None = None,
                 timeout: float | None = None):
        self.state = state
        self.names = names
        self.colors = colors
        self.roster = roster
        self.langs = langs or ["en"]
        self.emit = emit
        self.client = client
        self.timeout = timeout or float(os.getenv("BOOTH_LLM_TIMEOUT", "8"))
        self.queue: list[Moment] = []
        self.aired: list[dict] = []
        self.last_air_min = -99.0
        self._tool_ev = Evidence()
        self._stop = False
        self._last_hold = ""
        self.agents: dict[str, Any] = {}
        if client is not None:
            self._build_agents()

    # --- agents ---------------------------------------------------------
    def _build_agents(self) -> None:
        from agent_framework import Agent

        self.agents = {
            "director": Agent(self.client, DIRECTOR_PROMPT, name="Director"),
            "analyst": Agent(self.client, ANALYST_PROMPT, name="Analyst",
                             tools=[self.tool_team_stats, self.tool_recent_trend,
                                    self.tool_player_stats]),
            "verifier": Agent(self.client, JUDGE_PROMPT, name="Verifier"),
            "graphics": Agent(self.client, GRAPHICS_PROMPT, name="Graphics"),
            "commentator": Agent(self.client, COMMENTATOR_PROMPT, name="Commentator"),
        }

    # Analyst tools (results become admissible evidence for the verifier).
    def tool_team_stats(self) -> str:
        """Full-match team stats for both sides: goals, shots, xG, possession, passing, PPDA."""
        stats = self.state.team_stats()
        self._tool_ev.add("team_stats", stats)
        return json.dumps({self.names[k]: v for k, v in stats.items()})

    def tool_recent_trend(
        self, minutes: Annotated[int, Field(description="window length: 5, 10 or 15")] = 10
    ) -> str:
        """Both teams' xG, shots, final-third entries, possession and PPDA over the last N minutes."""
        minutes = minutes if minutes in (5, 10, 15) else 10
        w = self.state.window_stats(minutes)
        self._tool_ev.add(f"trend_{minutes}", w)
        self._tool_ev.add("trend_window", minutes)
        return json.dumps({"window_minutes": minutes} | {self.names[k]: v for k, v in w.items()})

    def tool_player_stats(self, name: Annotated[str, Field(description="player full name")]) -> str:
        """Match stats for one player: shots, xG, goals, key passes, dribbles, tackles, passing."""
        for pid, p in self.state.players.items():
            if p.name.lower() == name.lower() or p.name.split(" ")[-1].lower() == name.lower():
                ps = self.state.player_stats(pid)
                self._tool_ev.add(f"player_{pid}", ps)
                return json.dumps(ps)
        return json.dumps({"error": f"no player named {name}"})

    async def _run(self, agent: str, prompt: str, schema: type[BaseModel]):
        return await run_structured(self.agents[agent], prompt, schema, self.timeout)

    # --- console --------------------------------------------------------
    async def log(self, agent: str, status: str, text: str, t0: float, moment: Moment | None,
                  mode: str, **extra) -> None:
        await self.emit({
            "type": "console", "agent": agent, "status": status, "text": text,
            "ms": int((time.perf_counter() - t0) * 1000), "mode": mode,
            "moment_id": moment.id if moment else None, "clock": self.state.scoreboard()["clock"],
            **extra,
        })

    # --- pipeline -------------------------------------------------------
    def submit(self, m: Moment) -> None:
        self.queue.append(m)

    def stop(self) -> None:
        self._stop = True

    async def run_forever(self) -> None:
        while not self._stop:
            if not self.queue:
                await asyncio.sleep(0.05)
                continue
            try:
                await self.produce_next()
            except Exception:  # keep the show on air
                log.exception("crew segment failed")
                await asyncio.sleep(0.2)

    async def produce_next(self) -> None:
        now = self.state.minute()
        m, slot = await self.direct(now)
        await self.emit({"type": "queue", "ids": [q.id for q in self.queue if q is not m]})
        if m is None:
            return
        self.queue = [q for q in self.queue if q.id != m.id]
        insight, ver = await self.analyse(m)
        overlay = await self.graphics(m, slot)
        lines = await self.commentate(m, insight)
        self.last_air_min = self.state.minute()
        seg = {"type": "segment", "moment": m.to_dict(), "slot": slot, "overlay": overlay,
               "insight": insight, "commentary": lines,
               "verification": {"ok": ver.ok, "checked": ver.checked, "violations": ver.violations},
               "aired_clock": self.state.scoreboard()["clock"]}
        self.aired.append({"id": m.id, "kind": m.kind, "headline": m.headline, "clock": m.clock})
        await self.emit(seg)

    async def direct(self, now: float) -> tuple[Moment | None, str]:
        t0 = time.perf_counter()
        # Drop stale moments outright (goals and full-time stay longer).
        stale = [q for q in self.queue if now - q.minute > (6 if q.priority >= 0.9 else 3)]
        for q in stale:
            await self.log("Director", "drop", f"Dropped stale moment: {q.headline} ({q.clock})",
                           t0, q, "rules")
        self.queue = [q for q in self.queue if q not in stale]
        if not self.queue:
            return None, ""
        if "director" in self.agents and len(self.queue) > 1:
            cands = [{"id": q.id, "kind": q.kind, "team": self.names[q.team], "clock": q.clock,
                      "priority": q.priority, "headline": q.headline} for q in self.queue]
            prompt = json.dumps({"now": self.state.scoreboard()["clock"], "candidates": cands,
                                 "recently_aired": self.aired[-4:]})
            try:
                out: DirectorOut = await self._run("director", prompt, DirectorOut)
                pick = next((q for q in self.queue if q.id == out.moment_id), None)
                if out.moment_id is None:
                    await self.log("Director", "hold", out.reason, t0, None, "llm")
                    # Holding clears low-value items so we don't loop on them.
                    self.queue = [q for q in self.queue if q.priority >= 0.5]
                    return None, ""
                if pick:
                    slot = out.slot or offline.slot_for(pick.kind)
                    await self.log("Director", "air", f"AIR {pick.headline} as {slot}: {out.reason}",
                                   t0, pick, "llm", queue=len(self.queue))
                    return pick, slot
            except Exception as ex:
                await self.log("Director", "fallback", f"Model unavailable ({type(ex).__name__}); "
                               "using rules", t0, None, "rules")
        m, slot, reason = offline.director_pick(self.queue, now, self.last_air_min)
        if m is None:
            if reason != self._last_hold:
                await self.log("Director", "hold", reason, t0, None, "rules")
            self._last_hold = reason
            self.queue = [q for q in self.queue if q.priority >= 0.5]
            return None, ""
        self._last_hold = ""
        await self.log("Director", "air", f"AIR {m.headline} as {slot}: {reason}", t0, m, "rules",
                       queue=len(self.queue))
        return m, slot

    def _evidence(self, m: Moment) -> Evidence:
        ev = Evidence.from_facts(m.fact_dict())
        ev.add("team", self.names[m.team])
        ev.add("opponent", self.names["away" if m.team == "home" else "home"])
        for k, v in self._tool_ev.numbers.items():
            ev.numbers[k] = v
        for k, v in self._tool_ev.strings.items():
            ev.strings[k] = v
        return ev

    async def analyse(self, m: Moment) -> tuple[str, VerifyResult]:
        self._tool_ev = Evidence()
        t0 = time.perf_counter()
        if "analyst" in self.agents:
            prompt = json.dumps({
                "moment": m.kind, "headline": m.headline, "team": self.names[m.team],
                "opponent": self.names["away" if m.team == "home" else "home"],
                "evidence": [f.to_dict() for f in m.facts],
            })
            feedback = ""
            for attempt in (1, 2):
                try:
                    out: AnalystOut = await self._run("analyst", prompt + feedback, AnalystOut)
                except Exception as ex:
                    await self.log("Analyst", "fallback", f"Model unavailable ({type(ex).__name__})",
                                   t0, m, "llm")
                    break
                ev = self._evidence(m)
                ver = verify(out.insight, ev, self.roster)
                await self.log("Analyst", "draft", out.insight, t0, m, "llm", attempt=attempt)
                t1 = time.perf_counter()
                if not ver.ok:
                    await self.log("Verifier", "rejected", ver.summary(), t1, m, "code")
                    feedback = ("\n\nYour previous draft was rejected by the verifier: "
                                f"{ver.summary()}. Rewrite using only evidence numbers.")
                    continue
                judged = await self.judge(m, out.insight, ev)
                if judged is False:
                    feedback = "\n\nThe verifier found an unsupported claim. Stick to the evidence."
                    continue
                await self.log("Verifier", "approved", ver.summary(), t1, m,
                               "code+llm" if judged else "code", checked=ver.checked)
                return out.insight, ver
        t1 = time.perf_counter()
        text = offline.analyst_insight(m, self.names)
        ver = verify(text, self._evidence(m), self.roster)
        await self.log("Analyst", "draft", text, t1, m, "template")
        await self.log("Verifier", "approved" if ver.ok else "rejected", ver.summary(), t1, m,
                       "code", checked=ver.checked)
        return text, ver

    async def judge(self, m: Moment, insight: str, ev: Evidence) -> bool | None:
        if "verifier" not in self.agents:
            return None
        t0 = time.perf_counter()
        prompt = json.dumps({"insight": insight, "evidence": ev.numbers | ev.strings})
        try:
            out: JudgeOut = await self._run("verifier", prompt, JudgeOut)
        except Exception:
            return None
        if not out.supported:
            await self.log("Verifier", "rejected", out.issue or "unsupported claim", t0, m, "llm")
            return False
        return True

    async def graphics(self, m: Moment, slot: str) -> dict:
        t0 = time.perf_counter()
        if "graphics" in self.agents:
            prompt = json.dumps({"moment": m.kind, "slot": slot, "headline": m.headline,
                                 "fact_keys": {f.key: f.label for f in m.facts
                                               if f.key not in BASE_KEYS}})
            try:
                out: GraphicsOut = await self._run("graphics", prompt, GraphicsOut)
                sub = out.subtitle if verify(out.subtitle, self._evidence(m), self.roster).ok \
                    else None
                ov = build_overlay(m, slot, self.names, self.colors, out.title[:28], sub,
                                   out.fact_keys)
                await self.log("Graphics", "ok", f"{slot}: {ov['title']} | " +
                               ", ".join(r['label'] for r in ov.get('rows', [])), t0, m, "llm")
                return ov
            except Exception as ex:
                await self.log("Graphics", "fallback", f"Model unavailable ({type(ex).__name__})",
                               t0, m, "llm")
        ov = build_overlay(m, slot, self.names, self.colors)
        await self.log("Graphics", "ok", f"{slot}: {ov['title']}", t0, m, "template")
        return ov

    async def commentate(self, m: Moment, insight: str) -> dict[str, str]:
        t0 = time.perf_counter()
        lines: dict[str, str] = {}
        if "commentator" in self.agents:
            prompt = json.dumps({"languages": self.langs, "moment": m.kind,
                                 "insight": insight, "evidence": [f.to_dict() for f in m.facts]})
            try:
                out: CommentaryOut = await self._run("commentator", prompt, CommentaryOut)
                ev = self._evidence(m)
                for ln in out.lines:
                    if ln.lang in self.langs and verify(ln.text, ev, self.roster).ok:
                        lines[ln.lang] = ln.text
                rejected = [lg for lg in self.langs if lg not in lines]
                await self.log("Commentator", "ok", lines.get(self.langs[0], ""), t0, m, "llm",
                               langs=list(lines), rejected=rejected)
            except Exception as ex:
                await self.log("Commentator", "fallback", f"Model unavailable ({type(ex).__name__})",
                               t0, m, "llm")
        for lg in self.langs:
            if lg not in lines:
                lines[lg] = offline.commentary(m, self.names, lg)
        if not self.agents:
            await self.log("Commentator", "ok", lines[self.langs[0]], t0, m, "template")
        return lines
