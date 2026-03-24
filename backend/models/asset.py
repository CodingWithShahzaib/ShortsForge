from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    scene_id: Mapped[str] = mapped_column(String(32), ForeignKey("scenes.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # image, audio, video, sora_clip
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    source: Mapped[str] = mapped_column(String(30), default="ai_generated")
    parent_asset_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("assets.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    scene: Mapped["Scene"] = relationship("Scene", back_populates="assets")


from backend.models.scene import Scene  # noqa: E402


class ProjectAsset(Base):
    """Project-level assets (e.g. background music, logo) not tied to a single scene."""

    __tablename__ = "project_assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    source: Mapped[str] = mapped_column(String(30), default="user_uploaded")

    project: Mapped["Project"] = relationship("Project", back_populates="project_assets")
