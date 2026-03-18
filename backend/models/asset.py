from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String
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

    scene: Mapped["Scene"] = relationship("Scene", back_populates="assets")


from backend.models.scene import Scene  # noqa: E402
