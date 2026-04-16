from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.schemas.generation import StoryBrief, StoryTemplateField


IssueSeverity = Literal["info", "warning", "error"]


class ScriptQualityIssue(BaseModel):
    code: str
    message: str
    severity: IssueSeverity = "warning"
    scene_indexes: list[int] = Field(default_factory=list)
    fix_hint: str | None = None


class ScriptQualityMetrics(BaseModel):
    score: int = Field(default=0, ge=0, le=100)
    hook_strength: int = Field(default=0, ge=0, le=100)
    pacing_score: int = Field(default=0, ge=0, le=100)
    repetition_detected: bool = False
    tts_issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    issues: list[ScriptQualityIssue] = Field(default_factory=list)
    cleaned_text: str | None = None
    hook_text: str | None = None


class ScriptAnalysisRequest(BaseModel):
    narration: str
    story_type: str = "general"
    is_first_scene: bool = False
    previous_narrations: list[str] = Field(default_factory=list)
    llm_provider: str | None = None
    llm_model: str | None = None


class ScriptImproveRequest(BaseModel):
    text: str
    story_type: str = "general"
    previous_narrations: list[str] = Field(default_factory=list)
    is_first_scene: bool = False
    issues: list[str] = Field(default_factory=list)
    llm_provider: str | None = None
    llm_model: str | None = None
    temperature: float = Field(default=0.4, ge=0.0, le=1.0)


class ScriptImproveResponse(BaseModel):
    text: str
    metrics: ScriptQualityMetrics
    improvements_made: list[str] = Field(default_factory=list)


class NormalizeScriptRequest(BaseModel):
    text: str


class ScriptFixReport(BaseModel):
    changed: bool = False
    issues: list[str] = Field(default_factory=list)
    duplicate_sentences_removed: int = Field(default=0, ge=0)
    initialism_spacing_fixed: bool = False
    original_word_count: int = Field(default=0, ge=0)
    normalized_word_count: int = Field(default=0, ge=0)


class NormalizeScriptResponse(BaseModel):
    text: str
    report: ScriptFixReport


class StoryQualitySceneRole(BaseModel):
    scene_index: int = Field(ge=0)
    role: str
    label: str


class StoryStructureSceneInput(BaseModel):
    narration: str | None = None
    subtitle: str | None = None
    image_prompt: str | None = None
    duration: float | None = None
    transition: str | None = None
    scene_type: str | None = None
    scene_settings: dict[str, Any] | None = None


class StoryStructureAnalysisRequest(BaseModel):
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    script: str | None = None
    story_brief: StoryBrief | None = None
    scenes: list[StoryStructureSceneInput] = Field(default_factory=list)


class StoryQualityReport(BaseModel):
    profile_id: str
    profile_label: str
    resolved_story_type: str = "general"
    story_template: str = "default"
    quality_posture: str = "Balanced defaults"
    overall_score: int = Field(default=0, ge=0, le=100)
    hook_score: int = Field(default=0, ge=0, le=100)
    payoff_score: int = Field(default=0, ge=0, le=100)
    escalation_score: int = Field(default=0, ge=0, le=100)
    visual_variety_score: int = Field(default=0, ge=0, le=100)
    repetition_score: int = Field(default=0, ge=0, le=100)
    show_tell_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    scene_count: int = Field(default=0, ge=0)
    estimated_word_count: int = Field(default=0, ge=0)
    issues: list[ScriptQualityIssue] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    scene_roles: list[StoryQualitySceneRole] = Field(default_factory=list)
