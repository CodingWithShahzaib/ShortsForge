from __future__ import annotations
from typing import Any
import httpx
from backend.providers.base import TTSProvider


class ElevenLabsTTSProvider(TTSProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._base_url = "https://api.elevenlabs.io/v1"

    @property
    def name(self) -> str:
        return "elevenlabs"

    async def synthesize(
        self,
        text: str,
        voice: str = "21m00Tcm4TlvDq8ikWAM",
        speed: float = 1.0,
        **kwargs: Any,
    ) -> bytes:
        model_id = kwargs.get("model_id", "eleven_multilingual_v2")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self._base_url}/text-to-speech/{voice}",
                headers={
                    "xi-api-key": self._api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "speed": speed,
                    },
                },
            )
            resp.raise_for_status()
            return resp.content

    async def list_voices(self) -> list[dict[str, str]]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self._base_url}/voices",
                headers={"xi-api-key": self._api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            return [
                {"id": v["voice_id"], "name": v["name"]}
                for v in data.get("voices", [])
            ]
