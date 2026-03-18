from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Any

import httpx

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type
from backend.core.websocket_manager import ws_manager
from backend.providers.video import SoraProvider

logger = logging.getLogger(__name__)


def get_sora_provider() -> SoraProvider:
    settings = get_settings()
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key is required for Sora")
    return SoraProvider(api_key=settings.openai_api_key)


def _resize_image_to_match(path: Path, size: str) -> Path:
    """Resize image to match Sora's requested size (e.g. 1280x720). Required by API."""
    try:
        width, height = map(int, size.split("x"))
    except (ValueError, AttributeError):
        return path
    from PIL import Image
    img = Image.open(path).convert("RGB")
    if img.size == (width, height):
        return path
    resized = img.resize((width, height), Image.Resampling.LANCZOS)
    settings = get_settings()
    out_path = Path(settings.temp_dir) / f"sora_ref_{uuid.uuid4().hex}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out_path, "PNG")
    return out_path


async def _resolve_input_reference(
    input_image_url: str | None,
    input_image_file_id: str | None,
    size: str = "1280x720",
) -> Path | None:
    """Resolve input_reference to a file path the OpenAI SDK can upload.
    Resizes image to match requested size (Sora API requirement)."""
    if input_image_file_id:
        # file_id: would need Files API; not supported in current flow
        return None
    if not input_image_url:
        return None
    path: Path | None = None
    # Check if URL points to our local media
    media_match = re.search(r"/media/images/([^/?#]+)$", input_image_url)
    if media_match:
        settings = get_settings()
        filename = media_match.group(1)
        local_path = Path(settings.images_dir) / filename
        if local_path.exists():
            path = local_path
    if path is None:
        # External URL: download to temp file
        try:
            settings = get_settings()
            temp_path = Path(settings.temp_dir) / f"sora_ref_{uuid.uuid4().hex}.png"
            temp_path.parent.mkdir(parents=True, exist_ok=True)
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(input_image_url)
                r.raise_for_status()
                temp_path.write_bytes(r.content)
            path = temp_path
        except Exception as e:
            logger.warning("Could not fetch image from URL for input_reference: %s", e)
            return None
    return _resize_image_to_match(path, size)


async def create_video(
    prompt: str,
    model: str = "sora-2",
    size: str = "1280x720",
    seconds: str = "8",
    input_image_url: str | None = None,
    input_image_file_id: str | None = None,
    remix_id: str | None = None,
) -> dict[str, Any]:
    sora = get_sora_provider()
    input_ref = await _resolve_input_reference(
        input_image_url, input_image_file_id, size=size
    )

    return await sora.create_video(
        prompt=prompt,
        model=model,
        size=size,
        seconds=seconds,
        input_reference=input_ref,
        remix_id=remix_id,
    )


async def edit_video(video_id: str, prompt: str, model: str = "sora-2") -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.edit_video(video_id, prompt, model)


async def extend_video(
    video_id: str, prompt: str, model: str = "sora-2", seconds: str = "8"
) -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.extend_video(video_id, prompt, model, seconds)


async def remix_video(
    video_id: str,
    prompt: str | None = None,
    model: str = "sora-2",
    size: str | None = None,
    seconds: str | None = None,
) -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.remix_video(video_id, prompt, model, size, seconds)


async def create_character(video_id: str) -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.create_character(video_id)


async def get_character(character_id: str) -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.get_character(character_id)


async def get_video_status(video_id: str) -> dict[str, Any]:
    sora = get_sora_provider()
    return await sora.get_video(video_id)


async def _list_stored_videos(limit: int = 20) -> list[dict[str, Any]]:
    storage = get_storage()
    keys = await storage.list_keys("videos/sora/")
    keys = sorted(keys, reverse=True)[:limit]
    videos: list[dict[str, Any]] = []
    for key in keys:
        try:
            url = await storage.get_url(key)
        except Exception:
            url = None
        videos.append(
            {
                "id": None,
                "status": "completed",
                "model": "sora",
                "progress": 100,
                "video_path": key,
                "video_url": url,
            }
        )
    return videos


async def list_videos(limit: int = 20) -> list[dict[str, Any]]:
    sora = get_sora_provider()
    provider_videos = await sora.list_videos(limit)
    in_progress = [
        v
        for v in provider_videos
        if str(v.get("status", "")).lower() not in {"completed", "succeeded"}
    ]
    stored_videos = await _list_stored_videos(limit)
    return in_progress + stored_videos


async def delete_video(video_id: str) -> None:
    sora = get_sora_provider()
    await sora.delete_video(video_id)


async def poll_and_download(
    video_id: str,
    job_id: str | None = None,
    output_dir: str | None = None,
) -> dict[str, Any]:
    """Poll Sora video until complete, relaying progress via WebSocket, then download."""
    sora = get_sora_provider()
    settings = get_settings()
    out_dir = Path(output_dir or str(settings.temp_dir))
    out_dir.mkdir(parents=True, exist_ok=True)

    async def _on_progress(vid: str, status: str, progress: int):
        if job_id:
            await ws_manager.send_progress(job_id, "sora", progress, status, f"Sora: {status}")

    video = await sora.poll_until_complete(video_id, interval=5.0, timeout=600.0, on_progress=_on_progress)

    storage = get_storage()
    video_name = f"sora_{uuid.uuid4().hex}.mp4"
    video_path = str(out_dir / video_name)
    await sora.download_video(video_id, video_path)
    video_key = build_key("videos", f"sora/{video_name}")
    await storage.save_file(video_key, video_path, guess_content_type(video_name))

    thumb_name = f"sora_{uuid.uuid4().hex}_thumb.webp"
    thumb_path = str(out_dir / thumb_name)
    try:
        await sora.download_thumbnail(video_id, thumb_path)
        thumb_key = build_key("images", f"sora/{thumb_name}")
        await storage.save_file(thumb_key, thumb_path, guess_content_type(thumb_name))
    except Exception:
        thumb_key = None

    return {
        "video_key": video_key,
        "video_local_path": video_path,
        "video_url": await storage.get_url(video_key),
        "thumbnail_key": thumb_key,
        "thumbnail_url": await storage.get_url(thumb_key) if thumb_key else None,
        "video_data": video,
    }
