"""FastAPI app: streams a synthetic match plus the crew's broadcast over a WebSocket."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from booth.crew.crew import Crew
from booth.crew.llm import describe_mode, make_client
from booth.crew.recap import make_recap
from booth.intel.moments import MomentDetector
from booth.intel.state import MatchState
from booth.sim.engine import CLUBS, SCENARIOS, simulate

log = logging.getLogger("booth")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="Gaffer Booth")
WEB = Path(__file__).resolve().parent.parent / "web" / "dist"
_client = None
_client_ready = False


def client():
    global _client, _client_ready
    if not _client_ready:
        _client = make_client()
        _client_ready = True
    return _client


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mode": describe_mode()}


@app.get("/api/scenarios")
def scenarios() -> list[dict]:
    return [{"id": s.id, "title": s.title, "blurb": s.blurb,
             "home": CLUBS[s.home]["name"], "away": CLUBS[s.away]["name"]}
            for s in SCENARIOS.values()]


@app.get("/api/recap")
async def recap(scenario: str = "classic", seed: int | None = None, lang: str = "en") -> dict:
    if scenario not in SCENARIOS:
        scenario = "classic"
    match = await asyncio.to_thread(simulate, scenario, seed)
    return await make_recap(match, client(), [lang])


@app.websocket("/ws/broadcast")
async def broadcast(ws: WebSocket) -> None:
    await ws.accept()
    q = ws.query_params
    scenario = q.get("scenario", "classic")
    if scenario not in SCENARIOS:
        scenario = "classic"
    seed = int(q["seed"]) if q.get("seed", "").isdigit() else None
    speed = max(1.0, min(120.0, float(q.get("speed", "20"))))
    start_min = max(0, min(90, int(q.get("start", "0"))))
    langs = [lg for lg in q.get("langs", "en,es").split(",") if lg][:4] or ["en"]

    match = await asyncio.to_thread(simulate, scenario, seed)
    names = {"home": match.home.name, "away": match.away.name}
    colors = {"home": match.home.color, "away": match.away.color}
    roster = [p.name for t in (match.home, match.away) for p in t.players + t.bench]
    state = MatchState(names=names)
    detector = MomentDetector(state, names)
    send_lock = asyncio.Lock()
    control = {"paused": False, "speed": speed}

    async def emit(msg: dict) -> None:
        async with send_lock:
            await ws.send_json(msg)

    crew = Crew(state, names, colors, roster, langs, emit, client())
    await emit({"type": "init", "scenario": SCENARIOS[scenario].title, "scenario_id": scenario,
                "seed": match.seed, "mode": describe_mode(), "langs": langs,
                "lineups": match.lineups()})

    async def receiver() -> None:
        while True:
            msg = await ws.receive_json()
            cmd = msg.get("cmd")
            if cmd == "pause":
                control["paused"] = True
            elif cmd == "resume":
                control["paused"] = False
            elif cmd == "speed":
                control["speed"] = max(1.0, min(120.0, float(msg.get("value", speed))))

    crew_task = asyncio.create_task(crew.run_forever())
    recv_task = asyncio.create_task(receiver())
    try:
        prev = None
        last_stats_t = -999
        for e in match.events:
            live = state._abs_min(e) >= start_min
            if live and prev is not None and e.period == prev.period:
                dt = max(0, e.t - prev.t)
                await asyncio.sleep(min(dt, 90) / control["speed"])
            while control["paused"]:
                await asyncio.sleep(0.1)
            state.apply(e)
            moments = detector.feed(e)
            prev = e
            if not live:
                continue
            await emit({"type": "event", "event": e.to_dict(), "score": state.scoreboard()})
            for m in moments:
                await emit({"type": "moment", "moment": m.to_dict()})
                crew.submit(m)
            if e.t - last_stats_t >= 30 or e.type in ("goal", "period_end", "red_card"):
                last_stats_t = e.t
                await emit({"type": "stats", "stats": state.team_stats(),
                            "momentum": state.momentum_series[-120:],
                            "top_players": state.top_players(5)})
        # Let the crew finish the full-time segment.
        for _ in range(200):
            if not crew.queue:
                break
            await asyncio.sleep(0.1)
        await asyncio.sleep(1.0)
        await emit({"type": "end", "score": state.scoreboard(), "stats": state.team_stats()})
    except WebSocketDisconnect:
        pass
    finally:
        crew.stop()
        for t in (crew_task, recv_task):
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t


if WEB.exists():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = WEB / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(WEB / "index.html")
else:
    @app.get("/")
    def root():
        return JSONResponse({"msg": "frontend not built; run `npm run build` in web/"})
