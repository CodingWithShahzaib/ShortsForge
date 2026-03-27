from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    story_type: Mapped[str] = mapped_column(String(100), default="general")
    script: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    control_mode: Mapped[str] = mapped_column(String(20), default="co_pilot")
    version: Mapped[int] = mapped_column(Integer, default=1)
    settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    scenes: Mapped[list["Scene"]] = relationship(
        "Scene", back_populates="project", cascade="all, delete-orphan",
        order_by="Scene.order_index",
    )
    jobs: Mapped[list["Job"]] = relationship(
        "Job", back_populates="project", cascade="all, delete-orphan",
    )
    project_assets: Mapped[list["ProjectAsset"]] = relationship(
        "ProjectAsset", back_populates="project", cascade="all, delete-orphan",
    )


from backend.models.scene import Scene  # noqa: E402
from backend.models.job import Job  # noqa: E402
