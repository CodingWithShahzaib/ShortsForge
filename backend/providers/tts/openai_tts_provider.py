from __future__ import annotations
from typing import Any
import openai
from backend.providers.base import TTSProvider


class OpenAITTSProvider(TTSProvider):
    VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]

    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    @property
    def name(self) -> str:
        return "openai_tts"

    async def synthesize(
        self,
        text: str,
        voice: str = "alloy",
        speed: float = 1.0,
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "tts-1")
        resp = await self._client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            speed=speed,
            response_format="mp3",
        )
        return resp.content

    async def list_voices(self) -> list[dict[str, str]]:
        return [{"id": v, "name": v.title()} for v in self.VOICES]
