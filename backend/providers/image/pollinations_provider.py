from __future__ import annotations
from typing import Any
from urllib.parse import quote
import httpx
from backend.providers.base import ImageProvider


class PollinationsImageProvider(ImageProvider):
    """Free tier image generation via Pollinations.ai (no API key needed)."""

    @property
    def name(self) -> str:
        return "pollinations"

    @property
    def available_models(self) -> list[str]:
        return ["flux"]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        encoded_prompt = quote(prompt)
        # Official image host (pollinations.ai/p/ often serves HTML, not image bytes)
        url = (
            f"https://image.pollinations.ai/prompt/{encoded_prompt}"
            f"?width={width}&height={height}&model=flux&nologo=true&enhance=true"
        )
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
