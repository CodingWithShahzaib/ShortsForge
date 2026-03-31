from __future__ import annotations

from dataclasses import dataclass

from backend.engine.planning import ResolvedGenerationSettings, SceneSpec


@dataclass(frozen=True)
class EngineRequest:
    project_id: str
    job_id: str
    settings: ResolvedGenerationSettings
    scenes: list[SceneSpec] | None = None
    pipeline_mode: str = "manual"
    target_stage: str = "compile"
    regenerate_scene_ids: set[str] | None = None
    force_regenerate_scene_clips: bool = False
