import asyncio

import pytest
from pydantic import BaseModel

from booth.crew import llm

KEYS = ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENROUTER_API_KEY")


@pytest.fixture
def env(monkeypatch):
    for k in KEYS:
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


def test_openrouter_key_alone_picks_a_free_model(env):
    env.setenv("OPENROUTER_API_KEY", "k")
    assert llm._openai_settings() == ("k", llm.OPENROUTER_FREE_MODEL, llm.OPENROUTER_URL)


def test_openrouter_base_url_never_defaults_to_a_paid_model(env):
    env.setenv("OPENAI_API_KEY", "k")
    env.setenv("OPENAI_BASE_URL", llm.OPENROUTER_URL)
    assert llm._openai_settings()[1].endswith(":free")


def test_plain_openai_key_keeps_its_defaults(env):
    env.setenv("OPENAI_API_KEY", "k")
    assert llm._openai_settings() == ("k", "gpt-4.1-mini", None)


class Out(BaseModel):
    x: int


class RateLimited:
    async def run(self, prompt, options=None):
        raise RuntimeError("Error code: 429 - rate-limited upstream")


def test_rate_limit_does_not_switch_to_prompt_json(monkeypatch):
    monkeypatch.setattr(llm, "_prompt_json", False)
    with pytest.raises(RuntimeError):
        asyncio.run(llm.run_structured(RateLimited(), "p", Out, 1))
    assert llm._prompt_json is False
