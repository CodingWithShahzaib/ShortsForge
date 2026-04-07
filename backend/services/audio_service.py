from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type
from backend.providers.base import TTSProvider
from backend.providers.tts import KokoroTTSProvider
from backend.services.script_service import clean_tts_text

logger = logging.getLogger(__name__)


def get_tts_provider(provider_name: str | None = None) -> TTSProvider:
    settings = get_settings()
    name = provider_name or settings.default_tts_provider
    if name != "kokoro":
        raise ValueError(f"Unsupported TTS provider: {name}")
    if not settings.kokoro_tts_url:
        raise ValueError("Kokoro TTS URL is not configured")
    return KokoroTTSProvider(settings.kokoro_tts_url)


async def synthesize_speech(
    text: str,
    provider: str | None = None,
    voice: str = "af_bella",
    speed: float = 1.0,
    save: bool = True,
    **kwargs: Any,
) -> str:
    """Generate TTS audio and return file path."""
    tts = get_tts_provider(provider)
    prepared_text = clean_tts_text(text)
    if prepared_text and prepared_text != (text or "").strip():
        logger.info("Applied TTS text cleanup before synthesis")
    audio_bytes = await tts.synthesize(prepared_text or text, voice, speed, **kwargs)

    # If the provider returned empty bytes (e.g., text was empty), generate a 0.5s silent WAV.
    # This prevents FFmpeg 'Invalid data found' crashes on 0-byte files.
    if not audio_bytes or len(audio_bytes) < 10:
        import io
        import wave
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(44100)
            wav.writeframes(b'\x00\x00' * 22050)
        audio_bytes = buf.getvalue()
        kwargs['response_format'] = 'wav'

    if save:
        storage = get_storage()
        response_format = str(kwargs.get("response_format") or "mp3").strip().lower() or "mp3"
        if response_format not in {"mp3", "wav", "opus", "flac", "m4a"}:
            response_format = "mp3"
        name = f"{uuid.uuid4().hex}.{response_format}"
        key = build_key("audio", name)
        await storage.save_bytes(key, audio_bytes, guess_content_type(name))
        return key
    return ""


async def list_voices(provider: str | None = None) -> list[dict[str, str]]:
    tts = get_tts_provider(provider)
    return await tts.list_voices()
