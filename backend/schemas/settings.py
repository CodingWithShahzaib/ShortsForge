from __future__ import annotations
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from backend.schemas.video_settings import KenBurnsMotion, SafeZonePlatform, SubtitlePosition, TransitionId


class AppSettings(BaseModel):
    default_llm_provider: Literal["openai", "groq", "openrouter"] | None = None
    default_llm_model: str | None = None
    default_image_provider: Literal["replicate", "fal", "together", "runware", "pollinations", "openai_image"] | None = None
    default_tts_provider: Literal["kokoro"] | None = None
    default_tts_voice: str | None = None
    default_tts_speed: float | None = Field(default=None, ge=0.5, le=2.0)
    default_tts_response_format: Literal["mp3", "wav", "opus", "flac", "m4a"] | None = None
    default_tts_normalize: bool | None = None
    default_resolution: Literal["1080x1920", "720x1280", "1920x1080", "1280x720", "1024x1024", "1024x1792", "1792x1024"] | None = None
    default_transition: TransitionId | None = None
    default_image_style: str | None = None
    default_word_count: int | None = Field(default=None, ge=150, le=800)
    default_scene_count: int | None = Field(default=None, ge=2, le=100)
    default_scene_narration_style: Literal["short", "balanced", "long"] | None = None
    default_subtitle_enabled: bool | None = None
    default_subtitle_source: Literal["llm", "transcription"] | None = None
    default_generate_subtitles: bool | None = None
    default_transcription_provider: Literal["openai", "groq"] | None = None
    default_transcription_language: str | None = Field(
        default=None,
        pattern=r"^[a-z]{2}(-[A-Z]{2})?$",
    )
    default_inter_scene_pause_ms: int | None = Field(default=None, ge=0, le=1200)
    default_transition_overlap_ms: int | None = Field(default=None, ge=0, le=800)
    default_use_production_storyboard: bool | None = None
    default_match_scenes_to_audio: bool | None = None
    default_visual_continuity: str | None = None
    default_ken_burns_enabled: bool | None = None
    default_ken_burns_zoom_percent: float | None = Field(default=None, ge=0.0, le=8.0)
    default_ken_burns_motion: KenBurnsMotion | None = None
    default_breathing_enabled: bool | None = None
    default_breathing_amplitude: float | None = Field(default=None, ge=0.0, le=5.0)
    default_breathing_speed: float | None = Field(default=None, ge=0.05, le=1.0)
    default_film_grain_enabled: bool | None = None
    default_film_grain_intensity: float | None = Field(default=None, ge=0.0, le=0.25)
    default_vignette_enabled: bool | None = None
    default_vignette_intensity: float | None = Field(default=None, ge=0.0, le=0.5)
    default_lut_enabled: bool | None = None
    default_lut_path: str | None = None
    default_transition_duration_sec: float | None = Field(default=None, ge=0.0, le=2.0)
    default_scene_duration_min: int | None = Field(default=None, ge=1, le=12)
    default_scene_duration_max: int | None = Field(default=None, ge=1, le=20)
    default_subtitle_font: str | None = None
    default_subtitle_size: int | None = Field(default=None, ge=18, le=96)
    default_subtitle_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    default_subtitle_position: SubtitlePosition | None = None
    default_subtitle_background_opacity: float | None = Field(default=None, ge=0.0, le=1.0)
    default_subtitle_words_per_group: int | None = Field(default=None, ge=1, le=12)
    default_subtitle_shadow_enabled: bool | None = None
    default_subtitle_shadow_strength: float | None = Field(default=None, ge=0.0, le=2.0)
    default_subtitle_safe_zone_enabled: bool | None = None
    default_subtitle_safe_zone_platform: SafeZonePlatform | None = None
    default_subtitle_safe_zone_config: dict[str, Any] | None = None
    default_word_pop_enabled: bool | None = None
    default_music_volume: float | None = Field(default=None, ge=0.0, le=1.0)
    default_ducking_enabled: bool | None = None
    default_ducking_amount: float | None = Field(default=None, ge=-30.0, le=-1.0)
    openai_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None
    replicate_api_key: str | None = None
    fal_api_key: str | None = None
    together_api_key: str | None = None
    runware_api_key: str | None = None
    ffmpeg_path: str | None = None
    redis_url: str | None = None

    @field_validator(
        "default_llm_model",
        "default_tts_voice",
        "default_image_style",
        "default_visual_continuity",
        "default_transcription_language",
        "default_lut_path",
        "default_subtitle_font",
        "default_subtitle_color",
        "openai_api_key",
        "groq_api_key",
        "openrouter_api_key",
        "replicate_api_key",
        "fal_api_key",
        "together_api_key",
        "runware_api_key",
        "ffmpeg_path",
        "redis_url",
        mode="before",
    )
    @classmethod
    def _normalize_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return value


class ProviderStatus(BaseModel):
    name: str
    configured: bool
    models: list[str] = []
