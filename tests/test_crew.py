import asyncio

from fake_client import FakeChatClient

from booth.crew.crew import Crew
from booth.intel.moments import MomentDetector
from booth.intel.state import MatchState
from booth.sim.engine import simulate


def _setup(client, until="goal"):
    r = simulate("classic")
    names = {"home": r.home.name, "away": r.away.name}
    roster = [p.name for t in (r.home, r.away) for p in t.players + t.bench]
    state = MatchState()
    det = MomentDetector(state, names)
    out: list[dict] = []

    async def emit(m):
        out.append(m)

    crew = Crew(state, names, {"home": "#000", "away": "#fff"}, roster, ["en", "es"], emit, client)
    for e in r.events:
        state.apply(e)
        for m in det.feed(e):
            crew.submit(m)
        if e.type == until:
            break
    return crew, out


def test_offline_crew_airs_a_verified_goal():
    crew, out = _setup(None)
    asyncio.run(crew.produce_next())
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["moment"]["kind"] == "goal"
    assert seg["verification"]["ok"]
    assert set(seg["commentary"]) == {"en", "es"}
    assert seg["overlay"]["slot"] == "full_screen"


def test_verifier_rejects_hallucination_and_analyst_retries():
    fc = FakeChatClient(hallucinate_first=True)
    crew, out = _setup(fc)
    asyncio.run(crew.produce_next())
    statuses = [(m["agent"], m["status"]) for m in out if m["type"] == "console"]
    assert ("Verifier", "rejected") in statuses
    assert ("Verifier", "approved") in statuses
    seg = next(m for m in out if m["type"] == "segment")
    assert "99" not in seg["insight"]
    assert fc.calls.count("AnalystOut") == 2


def test_graphics_values_come_from_facts_not_the_model():
    crew, out = _setup(FakeChatClient(hallucinate_first=False))
    asyncio.run(crew.produce_next())
    seg = next(m for m in out if m["type"] == "segment")
    facts = {f["key"]: f["value"] for f in seg["moment"]["facts"]}
    for row in seg["overlay"]["rows"]:
        assert row["key"] in facts
