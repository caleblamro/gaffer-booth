import asyncio
import time

from fake_client import FakeChatClient

from booth.crew.crew import Crew
from booth.crew.verify import verify
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


def test_crew_works_with_models_without_structured_output(monkeypatch):
    import booth.crew.llm as llm

    monkeypatch.setattr(llm, "_prompt_json", False)
    fc = FakeChatClient(hallucinate_first=False, reject_schema=True)
    crew, out = _setup(fc)
    asyncio.run(crew.produce_next())
    assert llm._prompt_json
    assert {"AnalystOut", "GraphicsOut", "CommentaryOut"} <= set(fc.calls)
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["verification"]["ok"]
    statuses = [(m["agent"], m["mode"]) for m in out if m["type"] == "console"]
    assert ("Analyst", "llm") in statuses


# --- latency: concurrency inside a segment --------------------------------------------


def _console(out):
    return [(m["agent"], m["status"]) for m in out if m["type"] == "console"]


def test_segment_runs_graphics_and_commentary_concurrently():
    fc = FakeChatClient(hallucinate_first=False, delay=0.25)
    crew, out = _setup(fc)
    t0 = time.perf_counter()
    asyncio.run(crew.produce_next())
    elapsed = time.perf_counter() - t0
    # In sequence: analyst + judge + graphics + commentator = 1.0 s. The goal skips the
    # Director model, Graphics overlaps the Analyst and the Commentator overlaps the judge.
    assert {"AnalystOut", "JudgeOut", "GraphicsOut", "CommentaryOut"} <= set(fc.calls)
    assert "DirectorOut" not in fc.calls
    assert elapsed < 0.8, elapsed
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["verification"]["ok"] and seg["overlay"]["title"] == "BIG MOMENT"
    # The commentary is only logged once the judge has approved the insight.
    st = _console(out)
    assert st.index(("Verifier", "approved")) < st.index(("Commentator", "ok"))


def test_judge_rejection_discards_the_early_commentary():
    fc = FakeChatClient(hallucinate_first=False, judge_reject_first=True, delay=0.05)
    crew, out = _setup(fc)
    asyncio.run(crew.produce_next())
    st = _console(out)
    assert ("Verifier", "rejected") in st
    assert ("Commentator", "discarded") in st
    assert st.count(("Commentator", "ok")) == 1
    assert fc.calls.count("AnalystOut") == 2
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["verification"]["ok"]


def test_stale_goal_airs_as_breaking_instead_of_being_dropped():
    crew, out = _setup(None)
    goal = next(q for q in crew.queue if q.kind == "goal")
    crew.queue = [goal]
    goal.minute = crew.state.minute() - 10
    asyncio.run(crew.produce_next())
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["moment"]["kind"] == "goal" and seg["breaking"]
    assert seg["verification"]["ok"]
    assert ("Director", "drop") not in _console(out)


def test_goal_breaks_in_while_the_crew_is_busy():
    fc = FakeChatClient(hallucinate_first=False, delay=0.2)
    crew, out = _setup(fc)
    goal = next(q for q in crew.queue if q.kind == "goal")
    crew.queue = []
    crew.breaking_after = 0  # any urgent moment waiting behind production breaks in

    async def go():
        await crew.talkback("why are Harbour City losing midfield?")
        runner = asyncio.create_task(crew.run_forever())
        await asyncio.sleep(0.1)
        assert crew.busy
        crew.submit(goal)
        for _ in range(100):
            if sum(m["type"] == "segment" for m in out) >= 2:
                break
            await asyncio.sleep(0.05)
        crew.stop()
        runner.cancel()

    asyncio.run(go())
    segs = [m for m in out if m["type"] == "segment"]
    assert [s["moment"]["kind"] for s in segs] == ["goal", "talkback"]
    assert segs[0]["breaking"] and segs[0]["verification"]["ok"]
    assert segs[1]["talkback"] and not segs[1]["breaking"] and segs[1]["verification"]["ok"]


# --- producer talkback ------------------------------------------------------------------


def _talk(crew, text):
    async def go():
        await crew.talkback(text)
        await crew.produce_next()

    asyncio.run(go())


def test_talkback_offline_answers_about_a_player():
    crew, out = _setup(None)
    crew.queue = []
    player = max(crew.state.players.values(), key=lambda p: p.touches).name
    _talk(crew, f"give me a stat on {player}")
    assert ("Producer", "request") in _console(out)
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["talkback"] and seg["request"] == f"give me a stat on {player}"
    assert seg["moment"]["player"] == player
    assert seg["slot"] == "player_card"
    assert seg["verification"]["ok"], seg["verification"]["violations"]
    assert player in seg["insight"]
    assert set(seg["commentary"]) == {"en", "es"}


def test_talkback_offline_answers_about_a_team():
    crew, out = _setup(None)
    crew.queue = []
    _talk(crew, "why are Harbour City losing midfield?")
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["talkback"] and seg["slot"] == "stat_card"
    assert seg["moment"]["team"] == "home"
    assert seg["verification"]["ok"], seg["verification"]["violations"]
    facts = {f["key"] for f in seg["moment"]["facts"]}
    assert seg["overlay"]["rows"] and all(r["key"] in facts for r in seg["overlay"]["rows"])


def test_talkback_request_text_is_never_evidence():
    crew, _ = _setup(None)
    m = asyncio.run(crew.talkback("did Harbour City have 99 shots?"))
    assert not verify("Harbour City had 99 shots.", crew._evidence(m), crew.roster).ok


def test_talkback_goes_through_the_analyst_and_verifier_with_a_model():
    fc = FakeChatClient(hallucinate_first=True)
    crew, out = _setup(fc)
    crew.queue = []
    _talk(crew, "why are Harbour City losing midfield?")
    assert any("producer_request" in p for p in fc.prompts)
    st = _console(out)
    assert ("Verifier", "rejected") in st and ("Verifier", "approved") in st
    seg = next(m for m in out if m["type"] == "segment")
    assert seg["talkback"] and seg["verification"]["ok"] and "99" not in seg["insight"]
