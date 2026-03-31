from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectVideoSettings(Base):
    __tablename__ = "project_video_settings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    project_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    video_style: Mapped[dict] = mapped_column(JSON, default=dict)
    subtitles: Mapped[dict] = mapped_column(JSON, default=dict)
    audio: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
    )

    project: Mapped["Project"] = relationship("Project", back_populates="video_settings")


class SceneAssetOverride(Base):
    __tablename__ = "scene_asset_overrides"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    scene_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("scenes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    manual_image_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    manual_audio_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    manual_video_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    custom_transition: Mapped[str | None] = mapped_column(String(50), nullable=True)
    custom_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_status: Mapped[str] = mapped_column(String(30), default="none")
    audio_status: Mapped[str] = mapped_column(String(30), default="none")
    video_status: Mapped[str] = mapped_column(String(30), default="none")
    overridden_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
    )

    scene: Mapped["Scene"] = relationship("Scene", back_populates="asset_override")


from backend.models.project import Project  # noqa: E402
from backend.models.scene import Scene  # noqa: E402
