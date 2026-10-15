"""Model client factory (Microsoft Agent Framework chat clients).

Priority:
1. Microsoft Foundry project (FOUNDRY_PROJECT_ENDPOINT + FOUNDRY_MODEL), Entra ID auth.
2. Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT), key or Entra ID.
3. OpenAI-compatible endpoint (OPENAI_API_KEY + OPENAI_MODEL [+ OPENAI_BASE_URL]), e.g.
   OpenRouter or GitHub Models. OPENROUTER_API_KEY alone also works and picks a free model.
4. None: the crew runs on its deterministic fallback tier.

Settings can live in a `.env` file at the repo root; real environment variables win.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path

from pydantic import BaseModel

log = logging.getLogger(__name__)
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Load KEY=value lines from .env without overriding variables already set."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_env_file()

OPENROUTER_URL = "https://openrouter.ai/api/v1"
# Best free model in our tests: all five agents on the model, every language verified.
OPENROUTER_FREE_MODEL = "nvidia/nemotron-3.5-super-vl:free"


def _openai_settings() -> tuple[str, str, str | None] | None:
    """(api_key, model, base_url) for the OpenAI-compatible path, or None."""
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        return None
    base = os.getenv("OPENAI_BASE_URL") or (OPENROUTER_URL if not os.getenv("OPENAI_API_KEY")
                                            else None)
    # Never fall back to a paid model on OpenRouter.
    default = OPENROUTER_FREE_MODEL if base and "openrouter.ai" in base else "gpt-4.1-mini"
    return key, os.getenv("OPENAI_MODEL") or default, base


def describe_mode() -> str:
    if os.getenv("BOOTH_OFFLINE") == "1":
        return "offline"
    if os.getenv("FOUNDRY_PROJECT_ENDPOINT"):
        return f"foundry:{os.getenv('FOUNDRY_MODEL', '?')}"
    if os.getenv("AZURE_OPENAI_ENDPOINT"):
        return f"azure-openai:{os.getenv('AZURE_OPENAI_DEPLOYMENT', '?')}"
    if settings := _openai_settings():
        return f"openai:{settings[1]}"
    return "offline"


def make_client():
    mode = describe_mode()
    try:
        if mode.startswith("foundry"):
            from agent_framework.foundry import FoundryChatClient
            from azure.identity.aio import DefaultAzureCredential

            return FoundryChatClient(project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
                                     model=os.environ["FOUNDRY_MODEL"],
                                     credential=DefaultAzureCredential())
        if mode.startswith("azure-openai"):
            from agent_framework.openai import OpenAIChatCompletionClient

            kwargs = dict(model=os.environ["AZURE_OPENAI_DEPLOYMENT"],
                          azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                          api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"))
            if os.getenv("AZURE_OPENAI_API_KEY"):
                kwargs["api_key"] = os.environ["AZURE_OPENAI_API_KEY"]
            else:
                from azure.identity.aio import DefaultAzureCredential
                kwargs["credential"] = DefaultAzureCredential()
            return OpenAIChatCompletionClient(**kwargs)
        if mode.startswith("openai"):
            from agent_framework.openai import OpenAIChatCompletionClient

            key, model, base = _openai_settings()
            return OpenAIChatCompletionClient(model=model, api_key=key, base_url=base)
    except Exception:  # pragma: no cover - depends on cloud config
        log.exception("could not create model client; falling back to offline crew")
    return None


# Many free models reject `response_format`; after the first rejection, ask for JSON in the
# prompt instead for the rest of the process.
_prompt_json = os.getenv("BOOTH_JSON_MODE") == "prompt"


# Errors that say nothing about JSON support (rate limits, auth, outages).
_TRANSIENT = re.compile(r"Error code: (401|402|403|404|408|429|5\d\d)\b")


def _extract_json(text: str) -> str:
    m = re.search(r"\{.*\}", text, re.S)
    return m.group(0) if m else text


async def run_structured(agent, prompt: str, schema: type[BaseModel], timeout: float):
    """Run an agent and parse its reply into `schema`, with or without native JSON mode."""
    global _prompt_json
    if not _prompt_json:
        try:
            resp = await asyncio.wait_for(agent.run(prompt, options={"response_format": schema}),
                                          timeout)
            if resp.value is not None:
                return resp.value
            return schema.model_validate_json(_extract_json(resp.text))
        except TimeoutError:
            raise
        except Exception as exc:
            if _TRANSIENT.search(str(exc)):
                raise
            log.warning("structured output failed (%s); asking for JSON in the prompt instead", exc)
            _prompt_json = True
    ask = (f"{prompt}\n\nReply with only a JSON object, no prose, matching this JSON schema:\n"
           f"{json.dumps(schema.model_json_schema())}")
    resp = await asyncio.wait_for(agent.run(ask), timeout)
    return schema.model_validate_json(_extract_json(resp.text))
