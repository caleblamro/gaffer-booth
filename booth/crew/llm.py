"""Model client factory (Microsoft Agent Framework chat clients).

Priority:
1. Microsoft Foundry project (FOUNDRY_PROJECT_ENDPOINT + FOUNDRY_MODEL), Entra ID auth.
2. Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT), key or Entra ID.
3. OpenAI-compatible endpoint (OPENAI_API_KEY + OPENAI_MODEL [+ OPENAI_BASE_URL]).
4. None: the crew runs on its deterministic fallback tier.
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def describe_mode() -> str:
    if os.getenv("BOOTH_OFFLINE") == "1":
        return "offline"
    if os.getenv("FOUNDRY_PROJECT_ENDPOINT"):
        return f"foundry:{os.getenv('FOUNDRY_MODEL', '?')}"
    if os.getenv("AZURE_OPENAI_ENDPOINT"):
        return f"azure-openai:{os.getenv('AZURE_OPENAI_DEPLOYMENT', '?')}"
    if os.getenv("OPENAI_API_KEY"):
        return f"openai:{os.getenv('OPENAI_MODEL', 'gpt-4.1-mini')}"
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

            return OpenAIChatCompletionClient(model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                                              api_key=os.environ["OPENAI_API_KEY"],
                                              base_url=os.getenv("OPENAI_BASE_URL"))
    except Exception:  # pragma: no cover - depends on cloud config
        log.exception("could not create model client; falling back to offline crew")
    return None
