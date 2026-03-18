from __future__ import annotations

from pydantic import BaseModel


class AppSettings(BaseModel):
    default_llm_provider: str | None = None
    default_llm_model: str | None = None
    default_image_provider: str | None = None
    default_tts_provider: str | None = None
    default_tts_voice: str | None = None
    default_video_provider: str | None = None
    default_video_model: str | None = None
    default_resolution: str | None = None
    default_transition: str | None = None
    default_image_style: str | None = None
    default_word_count: int | None = None
    default_scene_count: int | None = None
    openai_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    replicate_api_key: str | None = None
    fal_api_key: str | None = None
    together_api_key: str | None = None
    runware_api_key: str | None = None
    ffmpeg_path: str | None = None
    redis_url: str | None = None


class ProviderStatus(BaseModel):
    name: str
    configured: bool
    models: list[str] = []
