from __future__ import annotations

from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, Field

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
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    image_provider: str = "replicate"
    image_style: str = "realistic"
    tts_provider: str = "edge"
    tts_voice: str = "en-US-ChristopherNeural"
    resolution: str = "1080x1920"
    transition: str = "fade"
    subtitle_enabled: bool = True
    subtitle_source: str = "transcription"  # "transcription" | "llm"
    generate_subtitles: bool = True  # When true, LLM generates subtitle text per scene
    transcription_provider: str = "openai"  # openai | groq
    transcription_language: str = "en"  # ISO 639-1 language code for speech-to-text
    subtitle_font: str = "Arial"
    subtitle_size: int = 48
    subtitle_color: str = "#FFFFFF"
    subtitle_position: str = "bottom"
    background_music: str | None = None
    background_music_volume: float = 0.15
    scene_count: int = 5
    word_count: int = 400
    scene_duration: float = Field(5.0, ge=1.0, le=60.0)
    prepare_only: bool = False
    """When True, stop after per-scene image+TTS assets (no final FFmpeg composite)."""
    storyboard_only: bool = False
    """When True, stop after LLM storyboard + Scene rows — no image/TTS generation."""
    control_mode: str = Field(
        default="autopilot",
        description="autopilot | co_pilot | manual",
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


class VideoProductionScene(BaseModel):
    """Single scene in a video production script (Sora/Runway style)."""
    scene_number: int
    timestamp: str  # e.g. "0:00-0:05" or "0-5s"
    duration_seconds: float
    camera_angle: str  # e.g. "Wide establishing shot, low angle"
    camera_movement: str  # e.g. "Slow dolly in"
    lighting: str  # e.g. "Golden hour, soft key from left"
    quality: str  # e.g. "4K cinematic, shallow depth of field"
    script: str  # narration/dialogue
    sora_prompt: str  # Full combined prompt for Sora/Runway/Kling


class GenerateVideoProductionScriptRequest(BaseModel):
    concept: str
    story_type: str = "general"
    scene_count: int = 5
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7


class DirectorBoardTimelineEntry(BaseModel):
    """Single timeline entry for director board."""
    start_sec: float
    end_sec: float
    phase_label: str | None = None
    script: str
    bullet_notes: list[str] = []


class DirectorBoardGenerateRequest(BaseModel):
    """Request to AI-generate cinematic, audio, and safety sections from story + timeline."""
    overall_story: str
    timeline_entries: list[DirectorBoardTimelineEntry]
    total_duration: float = 8.0
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.6


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


class SoraGenerateRequest(BaseModel):
    prompt: str
    model: str = "sora-2"
    size: str = "1280x720"
    seconds: str = "8"
    input_image_url: str | None = None
    input_image_file_id: str | None = None
    remix_id: str | None = None


class SoraEditRequest(BaseModel):
    video_id: str
    prompt: str
    model: str = "sora-2"


class SoraExtendRequest(BaseModel):
    video_id: str
    prompt: str
    model: str = "sora-2"
    seconds: str = "8"


class SoraRemixRequest(BaseModel):
    prompt: str | None = None
    model: str = "sora-2"
    size: str | None = None
    seconds: str | None = None


class SoraCharacterCreateRequest(BaseModel):
    name: str
    video_id: str


class SoraVideoOut(BaseModel):
    id: str
    status: str
    model: str | None = None
    progress: int = 0
    seconds: str | None = None
    size: str | None = None
    created_at: int | None = None
    completed_at: int | None = None
    error: dict[str, Any] | None = None


class SoraCharacterOut(BaseModel):
    id: str
    character_id: str
    name: str
    source_video_path: str | None = None
    metadata_: dict[str, Any] | None = None
