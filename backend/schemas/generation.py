from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field, model_validator

from backend.services.script_service import validate_story_template_field

StoryTemplateField = Annotated[str, AfterValidator(validate_story_template_field)]


class GenerateVideoSceneInput(BaseModel):
    """Pre-defined scene for video generation (from script editor)."""
    narration: str
    subtitle: str | None = None
    image_prompt: str
    transition: str = "fade"
    duration: float | None = None


class GenerateVideoRequest(BaseModel):
    title: str = "AI Video"
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    custom_script: str | None = None
    scenes: list[GenerateVideoSceneInput] | None = None
    llm_provider: str = Field(default="openai", min_length=1)
    llm_model: str = Field(default="gpt-4o-mini", min_length=1)
    image_provider: str = Field(default="replicate", min_length=1)
    image_style: str = Field(default="realistic", min_length=1)
    tts_provider: str = Field(default="edge", min_length=1)
    tts_voice: str = Field(default="en-US-ChristopherNeural", min_length=1)
    resolution: str = Field(default="1080x1920", min_length=3)
    transition: str = Field(default="fade", min_length=1)
    subtitle_enabled: bool = True
    subtitle_source: Literal["llm", "transcription"] = "llm"
    generate_subtitles: bool = True  # When true, LLM generates subtitle text per scene
    transcription_provider: Literal["openai", "groq"] = "openai"
    transcription_language: str = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    subtitle_font: str = Field(default="Arial", min_length=1)
    subtitle_size: int = Field(default=48, ge=24, le=96)
    subtitle_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    subtitle_position: Literal["bottom", "top", "center"] = "bottom"
    background_music: str | None = None
    background_music_volume: float = Field(default=0.15, ge=0.0, le=1.0)
    scene_count: int = Field(default=5, ge=2, le=15)
    word_count: int = Field(default=400, ge=150, le=800)
    scene_duration: float = Field(default=5.0, ge=1.0, le=60.0)
    prepare_only: bool = False
    """When True, stop after per-scene image+TTS assets (no final FFmpeg composite)."""
    storyboard_only: bool = False
    """When True, stop after LLM storyboard + Scene rows — no image/TTS generation."""
    control_mode: Literal["autopilot", "co_pilot", "manual"] = Field(
        default="co_pilot",
        description="Legacy; studio-first flow uses co_pilot. autopilot | co_pilot | manual",
    )
    extra_settings: dict[str, Any] | None = None


class GenerateScriptRequest(BaseModel):
    concept: str
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    word_count: int = 400
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    temperature: float = 0.8


class RewriteScriptRequest(BaseModel):
    text: str
    instruction: str
    story_type: str = "general"
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7


class VideoProductionScene(BaseModel):
    """Single scene in a cinematic storyboard (narration + still image prompt for ShortsForge)."""
    scene_number: int
    timestamp: str  # e.g. "0:00-0:05" or "0-5s"
    duration_seconds: float
    camera_angle: str  # e.g. "Wide establishing shot, low angle"
    camera_movement: str  # e.g. "Slow dolly in"
    lighting: str  # e.g. "Golden hour, soft key from left"
    quality: str  # e.g. "4K cinematic, shallow depth of field"
    script: str  # narration/dialogue
    image_prompt: str = ""  # Single still-image prompt for scene art (vertical short / key frame)

    @model_validator(mode="before")
    @classmethod
    def _legacy_sora_prompt(cls, data: Any) -> Any:
        if isinstance(data, dict) and not (data.get("image_prompt") or "").strip():
            legacy = data.get("sora_prompt")
            if legacy:
                data = {**data, "image_prompt": legacy}
        return data


class GenerateVideoProductionScriptRequest(BaseModel):
    concept: str
    story_type: str = "general"
    scene_count: int = 5
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7


class GenerateImageRequest(BaseModel):
    prompt: str
    provider: str = "replicate"
    width: int = 1080
    height: int = 1920
    style: str = "realistic"


class GenerateAudioRequest(BaseModel):
    text: str
    provider: str = "edge"
    voice: str = "en-US-ChristopherNeural"
    speed: float = 1.0


class BatchGenerateRequest(BaseModel):
    count: int = Field(ge=1, le=20)
    base_settings: GenerateVideoRequest


class ViralIdeasRequest(BaseModel):
    """Ask the LLM for timely short-form video angles plus suggested Create-form settings."""

    niche: str | None = Field(default=None, max_length=240)
    count: int = Field(default=8, ge=3, le=12)
    llm_provider: str = "openai"
    llm_model: str | None = None
