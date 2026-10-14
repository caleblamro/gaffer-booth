"""Scripted Agent Framework chat client for tests (no network)."""

from __future__ import annotations

import json

from agent_framework import BaseChatClient, ChatResponse, Message


class FakeChatClient(BaseChatClient):
    def __init__(self, hallucinate_first: bool = True):
        super().__init__()
        self.hallucinate_first = hallucinate_first
        self.calls: list[str] = []

    def _inner_get_response(self, *, messages, stream, options, **kwargs):
        schema = options.get("response_format")
        name = schema.__name__ if schema else "text"
        self.calls.append(name)
        prompt = messages[-1].text
        if name == "DirectorOut":
            cands = json.loads(prompt)["candidates"]
            best = max(cands, key=lambda c: c["priority"])
            out = {"moment_id": best["id"], "slot": None, "reason": "biggest story right now"}
        elif name == "AnalystOut":
            n = self.calls.count("AnalystOut")
            data = json.loads(prompt.split("\n\n")[0])
            ev = {f["key"]: f["value"] for f in data["evidence"]}
            if self.hallucinate_first and n % 2 == 1:
                out = {"insight": f"{data['team']} have had 99 shots in this spell."}
            else:
                out = {"insight": f"{data['team']} lead the story at minute {ev['minute']}."}
        elif name == "JudgeOut":
            out = {"supported": True, "issue": ""}
        elif name == "GraphicsOut":
            keys = list(json.loads(prompt)["fact_keys"])[:3]
            out = {"title": "BIG MOMENT", "subtitle": "Story of the match", "fact_keys": keys}
        elif name == "CommentaryOut":
            data = json.loads(prompt)
            out = {"lines": [{"lang": lg, "text": data["insight"]} for lg in data["languages"]]}
        else:
            out = {}

        async def _resp():
            return ChatResponse(messages=[Message(role="assistant", contents=[json.dumps(out)])])
        return _resp()
