from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type

# Valid image signatures (magic bytes)
PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPEG_SIG = b"\xff\xd8\xff"
WEBP_SIG = b"RIFF"
GIF_SIG = b"GIF87a"
GIF89_SIG = b"GIF89a"
HTML_SIGS = (b"<!DOCTYPE", b"<!doctype", b"<html", b"<HTML", b"<?xml")


def _is_valid_image(data: bytes) -> bool:
    """Reject HTML/XML error pages mistakenly saved as images."""
    if not data or len(data) < 12:
        return False
    start = data[:12]
    if any(start.startswith(sig) for sig in HTML_SIGS):
        return False
    if start.startswith(PNG_SIG) or start.startswith(JPEG_SIG):
        return True
    if start.startswith(WEBP_SIG) and len(data) >= 12 and data[8:12] == b"WEBP":
        return True
    if start.startswith(GIF_SIG) or start.startswith(GIF89_SIG):
        return True
    return False
from backend.core.cache import image_cache
from backend.providers.base import ImageProvider
from backend.providers.image import (
    ReplicateImageProvider,
    FalImageProvider,
    TogetherImageProvider,
    RunwareImageProvider,
    PollinationsImageProvider,
    OpenAIImageProvider,
)

logger = logging.getLogger(__name__)

FALLBACK_CHAIN = ["together", "replicate", "pollinations", "openai_image", "fal", "runware"]


def get_image_provider(provider_name: str | None = None) -> ImageProvider:
    settings = get_settings()
    name = provider_name or settings.default_image_provider
    providers: dict[str, ImageProvider] = {}
    if settings.replicate_api_key:
        providers["replicate"] = ReplicateImageProvider(settings.replicate_api_key)
    if settings.fal_api_key:
        providers["fal"] = FalImageProvider(settings.fal_api_key)
    if settings.together_api_key:
        providers["together"] = TogetherImageProvider(settings.together_api_key)
    if settings.runware_api_key:
        providers["runware"] = RunwareImageProvider(settings.runware_api_key)
    providers["pollinations"] = PollinationsImageProvider()
    if settings.openai_api_key:
        providers["openai_image"] = OpenAIImageProvider(
            settings.openai_api_key, settings.openai_base_url
        )
    if name in providers:
        return providers[name]
    for fallback in FALLBACK_CHAIN:
        if fallback in providers:
            return providers[fallback]
    return PollinationsImageProvider()


async def generate_image(
    prompt: str,
    provider: str | None = None,
    width: int = 1080,
    height: int = 1920,
    style: str = "realistic",
    save: bool = True,
    **kwargs: Any,
) -> str:
    """Generate an image and return the file path."""
    cached = image_cache.get(prompt, provider or "default", width=width, height=height)
    if cached and _is_valid_image(cached) and save:
        storage = get_storage()
        name = f"{uuid.uuid4().hex}.png"
        key = build_key("images", name)
        await storage.save_bytes(key, cached, guess_content_type(name))
        return key

    img_provider = get_image_provider(provider)
    data = await _generate_with_fallback(img_provider, prompt, width, height, style, provider, **kwargs)

    image_cache.put(prompt, provider or "default", data, width=width, height=height)

    if save:
        storage = get_storage()
        name = f"{uuid.uuid4().hex}.png"
        key = build_key("images", name)
        await storage.save_bytes(key, data, guess_content_type(name))
        return key
    return ""


def _validate_and_return(data: bytes, provider_name: str) -> bytes:
    if not _is_valid_image(data):
        raise RuntimeError(
            f"{provider_name} returned invalid data (likely HTML error page). "
            "Check API key or try another provider."
        )
    return data


async def _generate_with_fallback(
    primary: ImageProvider,
    prompt: str,
    width: int,
    height: int,
    style: str,
    primary_name: str | None,
    **kwargs: Any,
) -> bytes:
    try:
        data = await primary.generate(prompt, width, height, style, **kwargs)
        return _validate_and_return(data, primary.name)
    except Exception as exc:
        logger.warning("Primary provider %s failed: %s", primary.name, exc)

    tried_names = {primary.name}
    for fallback_name in FALLBACK_CHAIN:
        if fallback_name == primary_name:
            continue
        fallback = get_image_provider(fallback_name)
        if fallback.name in tried_names:
            continue
        tried_names.add(fallback.name)
        try:
            logger.info("Trying fallback: %s", fallback.name)
            data = await fallback.generate(prompt, width, height, style, **kwargs)
            return _validate_and_return(data, fallback.name)
        except Exception as exc:
            logger.warning("Fallback %s failed: %s", fallback.name, exc)

    raise RuntimeError("All image providers failed")
