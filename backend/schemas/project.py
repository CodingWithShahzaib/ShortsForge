from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class SceneBase(BaseModel):
    narration: str | None = None
    subtitle: str | None = None
    image_prompt: str | None = None
    transition_type: str = "fade"
    duration: float = 5.0
    scene_type: str = "image"


class SceneCreate(SceneBase):
    pass


class SceneUpdate(BaseModel):
    narration: str | None = None
    subtitle: str | None = None
    image_prompt: str | None = None
    transition_type: str | None = None
    duration: float | None = None
    scene_type: str | None = None
    order_index: int | None = None


class AssetOut(BaseModel):
    id: str
    scene_id: str
    type: str
    file_path: str
    url: str | None = None
    provider: str | None = None
    metadata_: dict[str, Any] | None = Field(None, alias="metadata")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}

    @field_validator("metadata_", mode="before")
    @classmethod
    def coerce_metadata(cls, v: Any) -> dict[str, Any] | None:
        """SQLAlchemy Base has a 'metadata' attr; from_attributes may pick it up instead of metadata_."""
        if v is None or isinstance(v, dict):
            return v
        return None


class SceneOut(SceneBase):
    id: str
    project_id: str
    order_index: int
    assets: list[AssetOut] = []

    model_config = {"from_attributes": True}


class ProjectBase(BaseModel):
    title: str
    story_type: str = "general"
    settings: dict[str, Any] | None = None


class ProjectCreate(ProjectBase):
    script: str | None = None
    scenes: list[SceneCreate] | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    story_type: str | None = None
    script: str | None = None
    status: str | None = None
    settings: dict[str, Any] | None = None


class ProjectOut(ProjectBase):
    id: str
    script: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    scenes: list[SceneOut] = []

    model_config = {"from_attributes": True}


class ProjectListOut(BaseModel):
    id: str
    title: str
    story_type: str
    status: str
    created_at: datetime
    scene_count: int = 0

    model_config = {"from_attributes": True}
