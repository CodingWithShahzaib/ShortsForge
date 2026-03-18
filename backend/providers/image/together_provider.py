from __future__ import annotations
from typing import Any
import base64
import httpx
from backend.providers.base import ImageProvider


class TogetherImageProvider(ImageProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "together"

    @property
    def available_models(self) -> list[str]:
        return ["black-forest-labs/FLUX.1-schnell-Free", "black-forest-labs/FLUX.1-schnell"]

    # FLUX.1-schnell supported resolutions
    _FLUX_SIZES = [(1024, 1024), (768, 1344), (1344, 768), (896, 1152), (1152, 896), (832, 1216), (1216, 832)]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "black-forest-labs/FLUX.1-schnell-Free")
        # Use nearest supported FLUX size to avoid 400 errors
        size = (width, height)
        if size not in self._FLUX_SIZES:
            aspect = height / width if width else 1
            size = min(
                self._FLUX_SIZES,
                key=lambda s: abs((s[1] / s[0]) - aspect) if s[0] else 999,
            )
            width, height = size
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                "https://api.together.xyz/v1/images/generations",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": model,
                    "prompt": prompt,
                    "width": width,
                    "height": height,
                    "n": 1,
                    "response_format": "base64",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            b64 = data["data"][0]["b64_json"]
            return base64.b64decode(b64)
