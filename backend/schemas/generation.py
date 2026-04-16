from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field, model_validator

from backend.schemas.characters import CharacterConfig
from backend.services.script_service import validate_story_template_field

StoryTemplateField = Annotated[str, AfterValidator(validate_story_template_field)]


class HorrorStoryBrief(BaseModel):
    scare_frequency: Literal["low", "medium", "high"] = "medium"
    tension_curve: Literal["steady", "peaked", "escalating"] = "escalating"


class NewsStoryBrief(BaseModel):
    fact_density: Literal["light", "balanced", "dense"] = "balanced"
    source_prominence: Literal["minimal", "standard", "high"] = "standard"


class MotivationalStoryBrief(BaseModel):
    emotional_tone: Literal["gentle", "energetic", "intense"] = "energetic"
    takeaway_clarity: Literal["subtle", "balanced", "explicit"] = "explicit"


class MysteryStoryBrief(BaseModel):
    clue_density: Literal["light", "balanced", "dense"] = "balanced"
    twist_style: Literal["subtle", "sharp", "late"] = "sharp"


class StoryBrief(BaseModel):
    hook_type: Literal["question", "statement", "visual", "shocking_fact"] = "question"
    ending_type: Literal["cliffhanger", "resolution", "call_to_action", "twist"] = "resolution"
    pacing_profile: Literal["fast", "balanced", "slow_build"] = "balanced"
    visual_variety: Literal["high", "medium", "low"] = "medium"
    show_vs_tell_priority: Literal["show", "balanced", "tell"] = "balanced"
    horror: HorrorStoryBrief | None = None
    news: NewsStoryBrief | None = None
    motivational: MotivationalStoryBrief | None = None
    mystery: MysteryStoryBrief | None = None


class GenerateVideoSceneInput(BaseModel):
    """Pre-defined scene for video generation (from script editor)."""
    narration: str
    subtitle: str | None = None
    image_prompt: str
    transition: str = "fade"
    duration: float | None = None
    scene_type: str = "image"
    scene_settings: dict[str, Any] | None = None
    speaker_id: str | None = None
    shot_type: Literal["medium", "closeup", "two-shot", "reaction"] = "medium"
    is_reaction_shot: bool = False
    character_references: dict[str, Any] | None = None
    voice_profile: str | None = None


class GenerateVideoRequest(BaseModel):
    project_id: str | None = None
    title: str = "AI Video"
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    story_brief: StoryBrief | None = None
    custom_script: str | None = None
    scenes: list[GenerateVideoSceneInput] | None = None
    llm_provider: str = Field(default="openai", min_length=1)
    llm_model: str = Field(default="gpt-4o-mini", min_length=1)
    image_provider: str = Field(default="replicate", min_length=1)
    image_style: str = Field(default="realistic", min_length=1)
    tts_provider: Literal["kokoro"] = "kokoro"
    tts_voice: str = Field(default="af_bella", min_length=1)
    tts_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    tts_response_format: Literal["mp3", "wav", "opus", "flac", "m4a"] = "mp3"
    tts_normalize: bool = True
    resolution: str = Field(default="1080x1920", min_length=3)
    transition: str = Field(default="fade", min_length=1)
    subtitle_enabled: bool = True
    subtitle_source: Literal["llm", "transcription"] = "transcription"
    generate_subtitles: bool = True  # When true, LLM generates subtitle text per scene
    transcription_provider: Literal["openai", "groq"] = "openai"
    transcription_language: str = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    subtitle_font: str = Field(default="Arial", min_length=1)
    subtitle_size: int = Field(default=48, ge=24, le=96)
    subtitle_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    subtitle_position: Literal["bottom", "top", "center"] = "bottom"
    subtitle_words_per_group: int = Field(default=4, ge=2, le=12)
    subtitle_background_opacity: float = Field(default=0.65, ge=0.0, le=1.0)
    subtitle_shadow_enabled: bool = True
    subtitle_shadow_strength: float = Field(default=0.85, ge=0.0, le=2.0)
    subtitle_safe_zone_enabled: bool = True
    subtitle_safe_zone_platform: Literal["tiktok", "instagram_reel", "youtube_short"] = "tiktok"
    subtitle_word_pop_enabled: bool = False
    background_music: str | None = None
    background_music_volume: float = Field(default=0.15, ge=0.0, le=1.0)
    ducking_enabled: bool = True
    ducking_amount: float = Field(default=-12.0, ge=-30.0, le=-1.0)
    scene_count: int = Field(default=5, ge=2, le=100)
    dynamic_scenes: bool = False
    word_count: int = Field(default=400, ge=150, le=800)
    scene_narration_style: Literal["short", "balanced", "long"] = "balanced"
    scene_duration: float = Field(default=5.0, ge=1.0, le=60.0)
    scene_duration_min: int = Field(default=2, ge=1, le=12)
    scene_duration_max: int = Field(default=4, ge=1, le=20)
    inter_scene_pause_ms: int = Field(default=600, ge=0, le=1200)
    transition_overlap_ms: int = Field(default=250, ge=0, le=800)
    use_production_storyboard: bool = True
    match_scenes_to_audio: bool = True
    visual_continuity: str = ""
    ken_burns_enabled: bool = True
    ken_burns_zoom_percent: float = Field(default=2.5, ge=0.0, le=8.0)
    ken_burns_motion: Literal["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "auto"] = "auto"
    breathing_enabled: bool = False
    breathing_amplitude: float = Field(default=1.5, ge=0.0, le=5.0)
    breathing_speed: float = Field(default=0.25, ge=0.05, le=1.0)
    film_grain_enabled: bool = False
    film_grain_intensity: float = Field(default=0.05, ge=0.0, le=0.25)
    vignette_enabled: bool = True
    vignette_intensity: float = Field(default=0.15, ge=0.0, le=0.5)
    lut_enabled: bool = False
    lut_path: str | None = None
    transition_duration_sec: float = Field(default=0.3, ge=0.0, le=2.0)
    prepare_only: bool = False
    """When True, stop after per-scene image+TTS assets (no final FFmpeg composite)."""
    storyboard_only: bool = False
    """When True, stop after LLM storyboard + Scene rows — no image/TTS generation."""
    pipeline_mode: Literal["manual", "auto"] = "manual"
    target_stage: Literal["storyboard", "assets", "compile"] | None = None
    control_mode: Literal["autopilot", "co_pilot", "manual"] = Field(
        default="co_pilot",
        description="Internal workflow mode. Keep value names unchanged: autopilot | co_pilot | manual",
    )
    generation_mode: Literal["standard", "dialogue"] = "standard"
    characters: list[CharacterConfig] | None = None
    character_consistency_enabled: bool = True
    dialogue_style_preset: Literal[
        "comic_book",
        "political_cartoon",
        "graphic_novel",
        "anime",
        "photorealistic",
        "documentary",
        "cinematic",
        "cinematic_noir",
        "epic_blockbuster",
        "watercolor",
    ] = "comic_book"
    default_shot_type: Literal["medium", "closeup", "two-shot", "reaction"] = "medium"
    pause_between_speakers_ms: int = Field(default=300, ge=0, le=1500)
    reaction_shot_duration: float = Field(default=2.5, ge=1.0, le=8.0)
    speaker_labels_in_subtitles: bool = True
    extra_settings: dict[str, Any] | None = None


class DialogueSceneInput(BaseModel):
    speaker_id: str | None = None
    narration: str
    subtitle: str | None = None
    shot_type: Literal["medium", "closeup", "two-shot", "reaction"] = "medium"
    is_reaction_shot: bool = False
    transition: str = "crossfade"
    duration: float | None = None


class DialogueVideoRequest(GenerateVideoRequest):
    generation_mode: Literal["standard", "dialogue"] = "dialogue"
    characters: list[CharacterConfig] = Field(min_length=2)
    custom_script: str | None = None
    dialogue_scenes: list[DialogueSceneInput] | None = None

    @model_validator(mode="after")
    def validate_dialogue_input(self) -> "DialogueVideoRequest":
        has_dialogue_scenes = bool(self.dialogue_scenes)
        has_script = bool((self.custom_script or "").strip())
        if not has_dialogue_scenes and not has_script:
            raise ValueError("Provide either dialogue_scenes or a custom_script for dialogue generation.")
        return self


class GenerateScriptRequest(BaseModel):
    concept: str
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    story_brief: StoryBrief | None = None
    word_count: int = 400
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    temperature: float = 0.8


class GenerateStoryboardRequest(BaseModel):
    concept: str = ""
    script: str = ""
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    story_brief: StoryBrief | None = None
    scene_count: int = Field(default=5, ge=2, le=100)
    dynamic_scenes: bool = False
    image_style: str = "realistic"
    resolution: str = "1080x1920"
    transition: str = "fade"
    word_count: int = Field(default=400, ge=150, le=800)
    scene_narration_style: Literal["short", "balanced", "long"] = "balanced"
    generate_subtitles: bool = True
    llm_provider: str = "openai"
    llm_model: str | None = None


class RewriteScriptRequest(BaseModel):
    text: str
    instruction: str
    story_type: str = "general"
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7


class RefineScriptCharactersRequest(BaseModel):
    text: str
    instruction: str
    story_type: str = "general"
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7


class RefineScriptCharactersResponse(BaseModel):
    text: str
    characters: list[CharacterConfig] = Field(default_factory=list)


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
    story_template: StoryTemplateField = "default"
    story_brief: StoryBrief | None = None
    scene_count: int = Field(default=5, ge=2, le=100)
    dynamic_scenes: bool = False
    image_style: str = "realistic"
    resolution: str = "1080x1920"
    transition: str = "fade"
    scene_narration_style: Literal["short", "balanced", "long"] = "balanced"
    llm_provider: str = "openai"
    llm_model: str | None = None
    temperature: float = 0.7
    visual_continuity: str | None = None


class GenerateImageRequest(BaseModel):
    prompt: str
    provider: str = "replicate"
    width: int = 1080
    height: int = 1920
    style: str = "realistic"


class GenerateAudioRequest(BaseModel):
    text: str
    provider: Literal["kokoro"] = "kokoro"
    voice: str = "af_bella"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    response_format: Literal["mp3", "wav", "opus", "flac", "m4a"] = "mp3"
    normalize: bool = True


class BatchGenerateRequest(BaseModel):
    count: int = Field(ge=1, le=20)
    base_settings: GenerateVideoRequest


class ViralIdeasRequest(BaseModel):
    """Ask the LLM for timely short-form video angles plus suggested Create-form settings."""

    niche: str | None = Field(default=None, max_length=1500)
    count: int = Field(default=8, ge=3, le=12)
    llm_provider: str = "openai"
    llm_model: str | None = None
    idea_type: Literal["any", "faceless", "dialogue"] = "any"
    tone: Literal["any", "serious", "funny", "dark", "inspirational", "educational", "dramatic"] = "any"
    hook_style: Literal["any", "question", "bold_claim", "shocking_fact", "story_setup", "countdown", "debate"] = "any"
    virality_angle: Literal["any", "curiosity_gap", "controversy", "relatability", "fear", "awe", "humor"] = "any"
    duration_target_seconds: int | None = Field(default=None, ge=15, le=60)
    character_mode: Literal["off", "optional", "required"] = "optional"
    cast_size: int | None = Field(default=None, ge=2, le=4)
    avoid_topics: str | None = Field(default=None, max_length=300)
