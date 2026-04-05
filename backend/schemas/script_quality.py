from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


IssueSeverity = Literal["info", "warning", "error"]


class ScriptQualityIssue(BaseModel):
    code: str
    message: str
    severity: IssueSeverity = "warning"


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
