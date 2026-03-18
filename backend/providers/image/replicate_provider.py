from __future__ import annotations
from typing import Any
import httpx
from backend.providers.base import ImageProvider


class ReplicateImageProvider(ImageProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key
        self._base_url = "https://api.replicate.com/v1"

    @property
    def name(self) -> str:
        return "replicate"

    @property
    def available_models(self) -> list[str]:
        return ["black-forest-labs/flux-schnell", "black-forest-labs/flux-dev"]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "black-forest-labs/flux-schnell")
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self._base_url}/models/{model}/predictions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "input": {
                        "prompt": prompt,
                        "width": width,
                        "height": height,
                        "num_outputs": 1,
                    }
                },
            )
            resp.raise_for_status()
            prediction = resp.json()

            poll_url = prediction.get("urls", {}).get("get", f"{self._base_url}/predictions/{prediction['id']}")
            for _ in range(120):
                import asyncio
                await asyncio.sleep(2)
                poll_resp = await client.get(
                    poll_url,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                poll_resp.raise_for_status()
                data = poll_resp.json()
                if data["status"] == "succeeded":
                    output = data.get("output")
                    image_url = output[0] if isinstance(output, list) else output
                    img_resp = await client.get(image_url)
                    img_resp.raise_for_status()
                    return img_resp.content
                elif data["status"] == "failed":
                    raise RuntimeError(f"Replicate generation failed: {data.get('error')}")
            raise TimeoutError("Replicate prediction timed out")
