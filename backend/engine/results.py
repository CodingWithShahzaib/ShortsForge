from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class EngineResult:
    prepared: bool = False
    storyboard_only: bool = False
    project_id: str | None = None
    scenes: int = 0
    video_path: str | None = None
    video_url: str | None = None
    duration: float | None = None
    resolution: str | None = None
    inter_scene_pause_ms: int | None = None
    transition_overlap_ms: int | None = None
    project_version: int | None = None
    stage_durations_ms: dict[str, int] | None = None
    total_duration_ms: int | None = None
    average_scene_runtime_ms: float | None = None

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any] | None) -> "EngineResult":
        data = dict(raw or {})
        return cls(
            prepared=bool(data.get("prepared", False)),
            storyboard_only=bool(data.get("storyboard_only", False)),
            project_id=data.get("project_id"),
            scenes=int(data.get("scenes") or 0),
            video_path=data.get("video_path"),
            video_url=data.get("video_url"),
            duration=float(data["duration"]) if data.get("duration") is not None else None,
            resolution=data.get("resolution"),
            inter_scene_pause_ms=(
                int(data["inter_scene_pause_ms"])
                if data.get("inter_scene_pause_ms") is not None
                else None
            ),
            transition_overlap_ms=(
                int(data["transition_overlap_ms"])
                if data.get("transition_overlap_ms") is not None
                else None
            ),
            project_version=(
                int(data["project_version"])
                if data.get("project_version") is not None
                else None
            ),
            stage_durations_ms=(
                {
                    str(key): int(value)
                    for key, value in dict(data.get("stage_durations_ms") or {}).items()
                }
                if isinstance(data.get("stage_durations_ms"), Mapping)
                else None
            ),
            total_duration_ms=(
                int(data["total_duration_ms"])
                if data.get("total_duration_ms") is not None
                else None
            ),
            average_scene_runtime_ms=(
                float(data["average_scene_runtime_ms"])
                if data.get("average_scene_runtime_ms") is not None
                else None
            ),
        )

    def to_mapping(self) -> dict[str, Any]:
        return asdict(self)
