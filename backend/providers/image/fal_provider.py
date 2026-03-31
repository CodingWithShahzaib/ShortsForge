from __future__ import annotations
from typing import Any
import httpx
from backend.providers.base import ImageProvider


class FalImageProvider(ImageProvider):
    def __init__(self, api_key: str):
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "fal"

    @property
    def available_models(self) -> list[str]:
        return ["fal-ai/flux/schnell", "fal-ai/flux/dev"]

    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        model = kwargs.get("model", "fal-ai/flux/schnell")
        negative_prompt = kwargs.get("negative_prompt")
        seed = kwargs.get("seed")
        payload: dict[str, Any] = {
            "prompt": prompt,
            "image_size": {"width": width, "height": height},
            "num_images": 1,
        }
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        if seed is not None:
            payload["seed"] = seed
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"https://queue.fal.run/{model}",
                headers={
                    "Authorization": f"Key {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

            status_url = data.get("status_url") or data.get("request_id")
            if status_url and not status_url.startswith("http"):
                status_url = f"https://queue.fal.run/{model}/requests/{status_url}/status"

            if data.get("images"):
                img_url = data["images"][0]["url"]
            else:
                import asyncio
                for _ in range(60):
                    await asyncio.sleep(2)
                    poll = await client.get(
                        status_url,
                        headers={"Authorization": f"Key {self._api_key}"},
                    )
                    poll.raise_for_status()
                    poll_data = poll.json()
                    if poll_data.get("status") == "COMPLETED":
                        result_url = f"https://queue.fal.run/{model}/requests/{data.get('request_id')}"
                        result = await client.get(
                            result_url,
                            headers={"Authorization": f"Key {self._api_key}"},
                        )
                        result.raise_for_status()
                        result_data = result.json()
                        img_url = result_data["images"][0]["url"]
                        break
                else:
                    raise TimeoutError("FAL generation timed out")

            img_resp = await client.get(img_url)
            img_resp.raise_for_status()
            return img_resp.content
