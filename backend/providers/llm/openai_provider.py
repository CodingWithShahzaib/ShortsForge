from __future__ import annotations

from typing import AsyncIterator

import openai

from backend.providers.base import LLMProvider, TranscriptionProvider


class OpenAILLMProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        if not api_key.strip():
            raise ValueError("OPENAI_API_KEY is not configured in the backend .env file.")
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        web_search: bool = False,
    ) -> str:
        request: dict[str, object] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if _supports_temperature(model):
            request["temperature"] = temperature
        if web_search or _is_search_preview_model(model):
            request["web_search_options"] = {}
        resp = await self._client.chat.completions.create(
            **request,
        )
        return _flatten_content(resp.choices[0].message.content)

    async def chat_completion_stream(
        self,
        messages: list[dict[str, str]],
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        request: dict[str, object] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if _supports_temperature(model):
            request["temperature"] = temperature
        if _is_search_preview_model(model):
            request["web_search_options"] = {}
        stream = await self._client.chat.completions.create(
            **request,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            content = _flatten_content(delta.content)
            if content:
                yield content


class OpenAITranscriptionProvider(TranscriptionProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        if not api_key.strip():
            raise ValueError("OPENAI_API_KEY is not configured in the backend .env file.")
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        word_timestamps: bool = True,
    ) -> dict:
        with open(audio_path, "rb") as f:
            resp = await self._client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["word"] if word_timestamps else ["segment"],
            )
        return resp.model_dump()


def _supports_temperature(model: str) -> bool:
    normalized = model.lower()
    return not (
        normalized.startswith(("o1", "o3", "o4", "gpt-5"))
        or "search-preview" in normalized
    )


def _is_search_preview_model(model: str) -> bool:
    normalized = model.lower()
    return normalized in {"gpt-4o-search-preview", "gpt-4o-mini-search-preview"}


def _flatten_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
        return "".join(parts)
    return ""
