from fastapi.testclient import TestClient

from booth.server import app


def test_scenarios_endpoint():
    c = TestClient(app)
    ids = {s["id"] for s in c.get("/api/scenarios").json()}
    assert {"classic", "comeback", "red_card", "press_collapse"} <= ids


def test_broadcast_streams_to_full_time():
    c = TestClient(app)
    kinds: set[str] = set()
    with c.websocket_connect("/ws/broadcast?scenario=classic&speed=120&start=85&langs=en") as ws:
        while True:
            m = ws.receive_json()
            kinds.add(m["type"])
            if m["type"] == "end":
                break
    assert {"init", "event", "stats", "console", "segment", "end"} <= kinds
