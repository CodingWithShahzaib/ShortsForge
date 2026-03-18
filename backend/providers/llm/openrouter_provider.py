from __future__ import annotations
from typing import AsyncIterator
import openai
from backend.providers.base import LLMProvider


class OpenRouterLLMProvider(LLMProvider):
    MODELS = [
        "google/gemini-2.0-flash-exp:free",
        "meta-llama/llama-3.1-8b-instruct:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "deepseek/deepseek-chat:free",
    ]

    def __init__(self, api_key: str):
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
        )

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str = "google/gemini-2.0-flash-exp:free",
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
        model: str = "google/gemini-2.0-flash-exp:free",
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
