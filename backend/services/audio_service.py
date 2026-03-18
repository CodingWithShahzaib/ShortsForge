from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type
from backend.providers.base import TTSProvider
from backend.providers.tts import EdgeTTSProvider, OpenAITTSProvider, ElevenLabsTTSProvider

logger = logging.getLogger(__name__)


def get_tts_provider(provider_name: str | None = None) -> TTSProvider:
    settings = get_settings()
    name = provider_name or settings.default_tts_provider
    if name == "openai_tts" and settings.openai_api_key:
        return OpenAITTSProvider(settings.openai_api_key, settings.openai_base_url)
    if name == "elevenlabs" and settings.elevenlabs_api_key:
        return ElevenLabsTTSProvider(settings.elevenlabs_api_key)
    return EdgeTTSProvider()


async def synthesize_speech(
    text: str,
    provider: str | None = None,
    voice: str = "en-US-ChristopherNeural",
    speed: float = 1.0,
    save: bool = True,
    **kwargs: Any,
) -> str:
    """Generate TTS audio and return file path."""
    tts = get_tts_provider(provider)
    audio_bytes = await tts.synthesize(text, voice, speed, **kwargs)

    if save:
        storage = get_storage()
        name = f"{uuid.uuid4().hex}.mp3"
        key = build_key("audio", name)
        await storage.save_bytes(key, audio_bytes, guess_content_type(name))
        return key
    return ""


async def list_voices(provider: str | None = None) -> list[dict[str, str]]:
    tts = get_tts_provider(provider)
    return await tts.list_voices()
