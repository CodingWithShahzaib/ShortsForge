from __future__ import annotations
from typing import Any
import base64
import openai
from backend.providers.base import ImageProvider


class OpenAIImageProvider(ImageProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    @property
    def name(self) -> str:
        return "openai_image"

    @property
    def available_models(self) -> list[str]:
        return ["gpt-image-1", "dall-e-3"]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "gpt-image-1")
        size = f"{width}x{height}"
        # gpt-image-* supports 1024x1024, 1024x1536, 1536x1024; dall-e-3 supports 1024x1024, 1024x1792, 1792x1024
        if model.startswith("gpt-image"):
            valid_sizes = {"1024x1024", "1024x1536", "1536x1024"}
        else:
            valid_sizes = {"1024x1024", "1024x1792", "1792x1024"}
        if size not in valid_sizes:
            if model.startswith("gpt-image"):
                size = "1024x1536" if height > width else "1536x1024" if width > height else "1024x1024"
            else:
                size = "1024x1792" if height > width else "1792x1024" if width > height else "1024x1024"

        kwargs_api: dict = {"model": model, "prompt": prompt, "n": 1, "size": size}
        # Only DALL-E supports response_format; gpt-image-* rejects it
        if model.startswith("dall-e"):
            kwargs_api["response_format"] = "b64_json"
        resp = await self._client.images.generate(**kwargs_api)
        item = resp.data[0]
        b64 = getattr(item, "b64_json", None)
        if b64:
            return base64.b64decode(b64)
        url = getattr(item, "url", None)
        if url:
            import httpx
            async with httpx.AsyncClient() as client:
                r = await client.get(url)
                r.raise_for_status()
                return r.content
        raise RuntimeError("OpenAI image response had no b64_json or url")
