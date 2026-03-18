from __future__ import annotations
from typing import Any
import httpx
from backend.providers.base import ImageProvider


class RunwareImageProvider(ImageProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "runware"

    @property
    def available_models(self) -> list[str]:
        return ["civitai:618692@693048"]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "civitai:618692@693048")
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                "https://api.runware.ai/v1/inference",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=[{
                    "taskType": "imageInference",
                    "taskUUID": "gen-img-1",
                    "model": model,
                    "positivePrompt": prompt,
                    "width": width,
                    "height": height,
                    "numberResults": 1,
                    "outputFormat": "PNG",
                }],
            )
            resp.raise_for_status()
            data = resp.json()
            images = data.get("data", data) if isinstance(data, dict) else data
            if isinstance(images, list) and images:
                image_url = images[0].get("imageURL") or images[0].get("image_url")
            else:
                raise RuntimeError("Runware returned no images")
            img_resp = await client.get(image_url)
            img_resp.raise_for_status()
            return img_resp.content
