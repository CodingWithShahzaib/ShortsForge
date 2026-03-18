from __future__ import annotations
from typing import AsyncIterator
import openai
from backend.providers.base import LLMProvider, TranscriptionProvider


class GroqLLMProvider(LLMProvider):
    def __init__(self, api_key: str):
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str = "llama-3.1-8b-instant",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        resp = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    async def chat_completion_stream(
        self,
        messages: list[dict[str, str]],
        model: str = "llama-3.1-8b-instant",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content


class GroqTranscriptionProvider(TranscriptionProvider):
    def __init__(self, api_key: str):
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

    async def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        word_timestamps: bool = True,
    ) -> dict:
        with open(audio_path, "rb") as f:
            resp = await self._client.audio.transcriptions.create(
                model="whisper-large-v3-turbo",
                file=f,
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["word"] if word_timestamps else ["segment"],
            )
        return resp.model_dump()
