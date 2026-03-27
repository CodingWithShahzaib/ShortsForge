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
    scene_settings: dict[str, Any] | None = None
    is_locked: bool = False
    user_notes: str | None = None
    trim_start_sec: float = 0.0
    trim_end_sec: float = 0.0


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
    scene_settings: dict[str, Any] | None = None
    is_locked: bool | None = None
    user_notes: str | None = None
    trim_start_sec: float | None = None
    trim_end_sec: float | None = None
    expected_version: int | None = Field(
        default=None,
        description="If set, must match project.version or 409 conflict",
    )


class ProjectAssetOut(BaseModel):
    id: str
    project_id: str
    type: str
    file_path: str
    url: str | None = None
    provider: str | None = None
    source: str = "user_uploaded"
    metadata_: dict[str, Any] | None = Field(
        default=None,
        serialization_alias="metadata",
    )
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class AssetOut(BaseModel):
    id: str
    scene_id: str
    type: str
    file_path: str
    url: str | None = None
    provider: str | None = None
    metadata_: dict[str, Any] | None = Field(
        default=None,
        serialization_alias="metadata",
    )
    created_at: datetime
    source: str = "ai_generated"
    parent_asset_id: str | None = None
    is_active: bool = True

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
    control_mode: str = "co_pilot"


class ProjectCreate(ProjectBase):
    script: str | None = None
    scenes: list[SceneCreate] | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    story_type: str | None = None
    script: str | None = None
    status: str | None = None
    settings: dict[str, Any] | None = None
    control_mode: str | None = None
    expected_version: int | None = Field(
        default=None,
        description="If set, must match project.version or 409 conflict",
    )


class ProjectOut(ProjectBase):
    id: str
    script: str | None = None
    status: str
    control_mode: str = "co_pilot"
    version: int = 1
    created_at: datetime
    updated_at: datetime
    scenes: list[SceneOut] = []
    project_assets: list[ProjectAssetOut] = []

    model_config = {"from_attributes": True}


class ProjectListOut(BaseModel):
    id: str
    title: str
    story_type: str
    status: str
    created_at: datetime
    scene_count: int = 0
    thumbnail_url: str | None = None
    duration_sec: int | None = None

    model_config = {"from_attributes": True}
