from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from backend.config import Settings as AppConfig

from backend.engine.planning import RenderPlan, ResolvedGenerationSettings, SceneSpec


@dataclass
class EngineContext:
    project_id: str
    job_id: str
    session: Any
    settings: ResolvedGenerationSettings
    scenes: list[SceneSpec]
    pipeline_mode: str
    target_stage: str
    regenerate_scene_ids: set[str] | None = None
    force_regenerate_scene_clips: bool = False

    project_version: int | None = None
    render_plan: RenderPlan | None = None

    work_dir: Path | None = None
    local_output_dir: Path | None = None

    audio_paths: list[str] = field(default_factory=list)
    visual_paths: list[str] = field(default_factory=list)
    durations: list[float] = field(default_factory=list)

    final_video_path: str | None = None
    final_video_url: str | None = None
    final_duration: float | None = None
    # Application-level settings (runtime config). Optional for tests; orchestrator
    # sets this when building the context.
    app_settings: AppConfig | None = None
