from __future__ import annotations

import os
from typing import Any
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(Path(__file__).resolve().parent.parent, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://shortsforge:shortsforge_password@localhost:5432/shortsforge"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Media
    media_dir: str = str(Path(__file__).resolve().parent / "media")
    ffmpeg_path: str = "ffmpeg"

    # OpenAI
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # Groq
    groq_api_key: str = ""

    # OpenRouter
    openrouter_api_key: str = ""

    # Kokoro TTS
    kokoro_tts_url: str = ""

    # Image providers
    replicate_api_key: str = ""
    fal_api_key: str = ""
    together_api_key: str = ""
    runware_api_key: str = ""

    # YouTube OAuth2
    youtube_client_id: str = ""
    youtube_client_secret: str = ""
    youtube_token_key: str = ""

    # Redis
    redis_url: str = ""
    redis_max_connections: int = 10
    redis_job_ttl: int = 86400  # 24 hours
    redis_queue_name: str = "shortsforge:jobs"
    redis_progress_channel: str = "shortsforge:progress"

    # Storage (local or S3/MinIO)
    storage_backend: str = "s3"  # local | s3
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "shortsforge"
    s3_region: str = "us-east-1"
    s3_secure: bool = False
    s3_presign_expires: int = 3600

    # App
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    max_concurrent_jobs: int = 3
    default_llm_provider: str = "openai"
    default_llm_model: str = "gpt-4o-mini"
    default_image_provider: str = "replicate"
    default_tts_provider: str = "kokoro"
    default_tts_voice: str = "af_bella"
    default_tts_speed: float = 1.0
    default_tts_response_format: str = "mp3"
    default_tts_normalize: bool = True
    default_resolution: str = "1080x1920"
    default_transition: str = "fade"
    default_image_style: str = "realistic"
    default_word_count: int = 400
    default_scene_count: int = 5
    default_scene_narration_style: str = "balanced"
    default_subtitle_enabled: bool = True
    default_subtitle_source: str = "llm"
    default_generate_subtitles: bool = True
    default_transcription_provider: str = "openai"
    default_transcription_language: str = "en"
    default_inter_scene_pause_ms: int = 600
    default_transition_overlap_ms: int = 250
    default_use_production_storyboard: bool = True
    default_match_scenes_to_audio: bool = True
    default_visual_continuity: str = ""
    default_ken_burns_enabled: bool = True
    default_ken_burns_zoom_percent: float = 2.5
    default_ken_burns_motion: str = "auto"
    default_breathing_enabled: bool = False
    default_breathing_amplitude: float = 1.5
    default_breathing_speed: float = 0.25
    default_film_grain_enabled: bool = False
    default_film_grain_intensity: float = 0.05
    default_vignette_enabled: bool = True
    default_vignette_intensity: float = 0.15
    default_lut_enabled: bool = False
    default_lut_path: str = ""
    default_transition_duration_sec: float = 0.3
    default_scene_duration_min: int = 2
    default_scene_duration_max: int = 4
    default_subtitle_font: str = "Arial"
    default_subtitle_size: int = 48
    default_subtitle_color: str = "#FFFFFF"
    default_subtitle_position: str = "bottom"
    default_subtitle_words_per_group: int = 4
    default_subtitle_background_opacity: float = 0.65
    default_subtitle_shadow_enabled: bool = True
    default_subtitle_shadow_strength: float = 0.85
    default_subtitle_safe_zone_enabled: bool = True
    default_subtitle_safe_zone_platform: str = "tiktok"
    default_subtitle_safe_zone_config: dict[str, Any] | None = None
    default_word_pop_enabled: bool = False
    default_music_volume: float = 0.3
    default_ducking_enabled: bool = True
    default_ducking_amount: float = -12.0

    @property
    def redis_enabled(self) -> bool:
        return bool(self.redis_url)

    @property
    def storage_is_s3(self) -> bool:
        return self.storage_backend.lower() == "s3"

    @property
    def images_dir(self) -> Path:
        return Path(self.media_dir) / "images"

    @property
    def audio_dir(self) -> Path:
        return Path(self.media_dir) / "audio"

    @property
    def videos_dir(self) -> Path:
        return Path(self.media_dir) / "videos"

    @property
    def temp_dir(self) -> Path:
        return Path(self.media_dir) / "temp"

    @property
    def music_dir(self) -> Path:
        return Path(self.media_dir) / "music"

    @property
    def overlays_dir(self) -> Path:
        return Path(self.media_dir) / "overlays"


@lru_cache
def get_settings() -> Settings:
    return Settings()
