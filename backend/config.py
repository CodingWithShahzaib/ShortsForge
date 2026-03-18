from __future__ import annotations

import os
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

    # ElevenLabs
    elevenlabs_api_key: str = ""

    # Image providers
    replicate_api_key: str = ""
    fal_api_key: str = ""
    together_api_key: str = ""
    runware_api_key: str = ""

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
    cors_origins: list[str] = ["http://localhost:3000"]
    max_concurrent_jobs: int = 3
    default_llm_provider: str = "openai"
    default_llm_model: str = "gpt-4o-mini"
    default_image_provider: str = "replicate"
    default_tts_provider: str = "edge"
    default_tts_voice: str = "en-US-ChristopherNeural"
    default_video_provider: str = "sora"
    default_video_model: str = "sora-2"
    default_resolution: str = "1080x1920"
    default_transition: str = "fade"
    default_image_style: str = "realistic"
    default_word_count: int = 400
    default_scene_count: int = 5

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
