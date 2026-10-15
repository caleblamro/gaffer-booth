"""Scripted Agent Framework chat client for tests (no network)."""

from __future__ import annotations

import asyncio
import json
import re

from agent_framework import BaseChatClient, ChatResponse, Message


class FakeChatClient(BaseChatClient):
    def __init__(self, hallucinate_first: bool = True, reject_schema: bool = False,
                 delay: float = 0.0, judge_reject_first: bool = False):
        super().__init__()
        self.hallucinate_first = hallucinate_first
        self.reject_schema = reject_schema  # behave like a model without structured output
        self.delay = delay  # seconds each call takes, to exercise concurrency
        self.judge_reject_first = judge_reject_first
        self.calls: list[str] = []
        self.prompts: list[str] = []

    def _inner_get_response(self, *, messages, stream, options, **kwargs):
        schema = options.get("response_format")
        if schema and self.reject_schema:
            raise ValueError("response_format is not supported by this model")
        prompt = messages[-1].text
        if schema:
            name = schema.__name__
        else:
            titles = re.findall(r'"title": "(\w+Out)"', prompt)
            name = titles[-1] if titles else "text"
            prompt = prompt.split("\n\nReply with only a JSON object")[0]
        self.calls.append(name)
        self.prompts.append(prompt)
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
            if self.judge_reject_first and self.calls.count("JudgeOut") == 1:
                out = {"supported": False, "issue": "causal claim not supported"}
            else:
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
            if self.delay:
                await asyncio.sleep(self.delay)
            text = json.dumps(out) if schema else f"Here you go:\n```json\n{json.dumps(out)}\n```"
            return ChatResponse(messages=[Message(role="assistant", contents=[text])])
        return _resp()
