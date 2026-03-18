from __future__ import annotations
from typing import Any
import io
import edge_tts
from backend.providers.base import TTSProvider


class EdgeTTSProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "edge"

    async def synthesize(
        self,
        text: str,
        voice: str = "en-US-ChristopherNeural",
        speed: float = 1.0,
        **kwargs: Any,
    ) -> bytes:
        rate = f"{int((speed - 1) * 100):+d}%"
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    async def list_voices(self) -> list[dict[str, str]]:
        voices = await edge_tts.list_voices()
        return [
            {"id": v["ShortName"], "name": v["FriendlyName"], "locale": v["Locale"], "gender": v["Gender"]}
            for v in voices
            if v["Locale"].startswith("en")
        ]
