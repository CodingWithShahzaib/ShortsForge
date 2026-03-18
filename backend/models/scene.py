from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    transition_type: Mapped[str] = mapped_column(String(50), default="fade")
    duration: Mapped[float] = mapped_column(Float, default=5.0)
    scene_type: Mapped[str] = mapped_column(String(20), default="image")

    project: Mapped["Project"] = relationship("Project", back_populates="scenes")
    assets: Mapped[list["Asset"]] = relationship(
        "Asset", back_populates="scene", cascade="all, delete-orphan",
    )


from backend.models.project import Project  # noqa: E402
from backend.models.asset import Asset  # noqa: E402
