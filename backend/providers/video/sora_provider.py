from __future__ import annotations
from pathlib import Path
from typing import Any
import asyncio
import openai
import httpx


class SoraProvider:
    """Wrapper around the OpenAI Videos (Sora) API."""

    def __init__(self, api_key: str):
        self._client = openai.AsyncOpenAI(api_key=api_key)
        self._api_key = api_key

    async def create_video(
        self,
        prompt: str,
        model: str = "sora-2",
        size: str = "1280x720",
        seconds: str = "8",
        input_reference: Path | None = None,
        remix_id: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "seconds": seconds,
        }
        if input_reference:
            params["input_reference"] = input_reference
        if remix_id:
            params["remix_id"] = remix_id
        video = await self._client.videos.create(**params)
        return video.model_dump() if hasattr(video, "model_dump") else dict(video)

    async def edit_video(
        self,
        source_video_id: str,
        prompt: str,
        model: str = "sora-2",
    ) -> dict[str, Any]:
        video = await self._client.videos.edits.create(
            model=model,
            prompt=prompt,
            source_video_id=source_video_id,
        )
        return video.model_dump() if hasattr(video, "model_dump") else dict(video)

    async def extend_video(
        self,
        video_id: str,
        prompt: str,
        model: str = "sora-2",
        seconds: str = "8",
    ) -> dict[str, Any]:
        video = await self._client.videos.extensions.create(
            model=model,
            prompt=prompt,
            video_id=video_id,
            seconds=seconds,
        )
        return video.model_dump() if hasattr(video, "model_dump") else dict(video)

    async def remix_video(
        self,
        video_id: str,
        prompt: str | None = None,
        model: str = "sora-2",
        size: str | None = None,
        seconds: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"model": model}
        if prompt:
            params["prompt"] = prompt
        if size:
            params["size"] = size
        if seconds:
            params["seconds"] = seconds
        video = await self._client.videos.remix(video_id, **params)
        return video.model_dump() if hasattr(video, "model_dump") else dict(video)

    async def create_character(self, video_id: str) -> dict[str, Any]:
        character = await self._client.videos.characters.create(video_id=video_id)
        return character.model_dump() if hasattr(character, "model_dump") else dict(character)

    async def get_character(self, character_id: str) -> dict[str, Any]:
        character = await self._client.videos.characters.retrieve(character_id)
        return character.model_dump() if hasattr(character, "model_dump") else dict(character)

    async def get_video(self, video_id: str) -> dict[str, Any]:
        video = await self._client.videos.retrieve(video_id)
        return video.model_dump() if hasattr(video, "model_dump") else dict(video)

    async def list_videos(self, limit: int = 20) -> list[dict[str, Any]]:
        videos = await self._client.videos.list(limit=limit)
        return [v.model_dump() if hasattr(v, "model_dump") else dict(v) for v in videos.data]

    async def delete_video(self, video_id: str) -> None:
        await self._client.videos.delete(video_id)

    async def poll_until_complete(
        self,
        video_id: str,
        interval: float = 5.0,
        timeout: float = 600.0,
        on_progress: Any = None,
    ) -> dict[str, Any]:
        elapsed = 0.0
        while elapsed < timeout:
            video = await self.get_video(video_id)
            status = video.get("status", "")
            progress = video.get("progress", 0)
            if on_progress:
                await on_progress(video_id, status, progress)
            if status == "completed":
                return video
            if status == "failed":
                err = video.get("error") or {}
                if isinstance(err, dict) and err.get("code") == "moderation_blocked":
                    raise RuntimeError(
                        "Content blocked by moderation. Try a different prompt that avoids "
                        "sensitive topics (politics, violence, real people, etc.)."
                    )
                raise RuntimeError(f"Sora video failed: {err}")
            await asyncio.sleep(interval)
            elapsed += interval
        raise TimeoutError(f"Sora video {video_id} timed out after {timeout}s")

    async def download_video(self, video_id: str, output_path: str) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(
                f"https://api.openai.com/v1/videos/{video_id}/content",
                headers={"Authorization": f"Bearer {self._api_key}"},
                follow_redirects=True,
            )
            resp.raise_for_status()
            with open(output_path, "wb") as f:
                f.write(resp.content)
        return output_path

    async def download_thumbnail(self, video_id: str, output_path: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(
                f"https://api.openai.com/v1/videos/{video_id}/content?variant=thumbnail",
                headers={"Authorization": f"Bearer {self._api_key}"},
                follow_redirects=True,
            )
            resp.raise_for_status()
            with open(output_path, "wb") as f:
                f.write(resp.content)
        return output_path
