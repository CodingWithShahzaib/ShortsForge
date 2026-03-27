from __future__ import annotations

import logging
from typing import AsyncIterator

from backend.config import get_settings
from backend.providers.base import LLMProvider, TranscriptionProvider
from backend.providers.llm import (
    OpenAILLMProvider,
    OpenAITranscriptionProvider,
    GroqLLMProvider,
    GroqTranscriptionProvider,
    OpenRouterLLMProvider,
)

logger = logging.getLogger(__name__)


def get_llm_provider(provider_name: str | None = None) -> LLMProvider:
    settings = get_settings()
    name = provider_name or settings.default_llm_provider
    if name == "groq":
        return GroqLLMProvider(api_key=settings.groq_api_key)
    if name == "openrouter":
        return OpenRouterLLMProvider(api_key=settings.openrouter_api_key)
    return OpenAILLMProvider(api_key=settings.openai_api_key, base_url=settings.openai_base_url)


def get_transcription_provider(provider_name: str | None = None) -> TranscriptionProvider:
    settings = get_settings()
    name = provider_name or "openai"
    if name == "groq":
        return GroqTranscriptionProvider(api_key=settings.groq_api_key)
    return OpenAITranscriptionProvider(
        api_key=settings.openai_api_key, base_url=settings.openai_base_url
    )


async def chat_completion(
    messages: list[dict[str, str]],
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> str:
    settings = get_settings()
    llm = get_llm_provider(provider)
    model = model or settings.default_llm_model or ("gpt-4o-mini" if isinstance(llm, OpenAILLMProvider) else None)
    kwargs = {"messages": messages, "max_tokens": max_tokens}
    if model:
        kwargs["model"] = model
    if _supports_temperature(model):
        kwargs["temperature"] = temperature
    return await llm.chat_completion(**kwargs)


async def chat_completion_stream(
    messages: list[dict[str, str]],
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> AsyncIterator[str]:
    settings = get_settings()
    llm = get_llm_provider(provider)
    model = model or settings.default_llm_model or ("gpt-4o-mini" if isinstance(llm, OpenAILLMProvider) else None)
    kwargs = {"messages": messages, "max_tokens": max_tokens}
    if model:
        kwargs["model"] = model
    if _supports_temperature(model):
        kwargs["temperature"] = temperature
    async for token in llm.chat_completion_stream(**kwargs):
        yield token


def _supports_temperature(model: str | None) -> bool:
    if not model:
        return True
    normalized = model.lower()
    return not (normalized.startswith("o1") or normalized.startswith("o3"))


async def transcribe_audio(
    audio_path: str,
    provider: str | None = None,
    language: str = "en",
    word_timestamps: bool = True,
) -> dict:
    transcriber = get_transcription_provider(provider)
    return await transcriber.transcribe(audio_path, language, word_timestamps)
