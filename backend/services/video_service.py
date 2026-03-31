from __future__ import annotations

import logging
from typing import Any
from sqlalchemy import select

from backend.config import get_settings
from backend.engine.planning import ResolvedGenerationSettings, SceneSpec, build_timeline_plan
from backend.models import Project, Scene

logger = logging.getLogger(__name__)

def _hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS format &HAABBGGRR (alpha, blue, green, red)."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
        return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"


def _effective_clip_duration(sc: SceneSpec, base_duration: float) -> float:
    """Shorten clip by optional trim metadata on the scene dict."""
    ts = float(sc.trim_start_sec or 0)
    te = float(sc.trim_end_sec or 0)
    return max(0.5, float(base_duration) - ts - te)


def _normalize_ms(value: Any, *, default: int, lower: int, upper: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(lower, min(upper, parsed))


def build_scene_timing_plan(
    base_durations: list[float],
    transitions_between: list[str],
    inter_scene_pause_ms: int,
    transition_overlap_ms: int,
) -> tuple[list[float], list[float]]:
    """Build paced clip lengths and per-boundary overlaps.

    Returns:
      paced_durations: per-scene clip/audio lengths with pause tail applied
      boundary_overlaps: per-boundary overlap duration used for xfade/acrossfade
    """
    plan = build_timeline_plan(
        base_durations,
        transitions_between,
        inter_scene_pause_ms,
        transition_overlap_ms,
    )
    return plan.paced_durations, plan.boundary_overlaps


def build_scene_start_times(
    scene_durations: list[float],
    boundary_overlaps: list[float],
) -> list[float]:
    """Map per-scene durations/overlaps onto the final rendered timeline."""
    if not scene_durations:
        return []
    starts = [0.0]
    for i in range(1, len(scene_durations)):
        prev_duration = max(0.0, float(scene_durations[i - 1]))
        overlap = max(0.0, float(boundary_overlaps[i - 1])) if i - 1 < len(boundary_overlaps) else 0.0
        starts.append(starts[-1] + prev_duration - overlap)
    return starts


def _scene_to_spec(scene: Scene) -> SceneSpec:
    """Convert Scene model to a typed scene spec for pipeline compatibility."""
    ss = scene.scene_settings if isinstance(getattr(scene, "scene_settings", None), dict) else {}
    return SceneSpec.from_mapping({
        "id": scene.id,
        "narration": scene.narration or "",
        "subtitle": scene.narration or scene.subtitle or "",
        "image_prompt": scene.image_prompt or "",
        "transition": scene.transition_type,
        "transition_type": scene.transition_type,
        "scene_type": scene.scene_type,
        "duration": scene.duration,
        "scene_settings": ss,
        "trim_start_sec": float(getattr(scene, "trim_start_sec", 0) or 0),
        "trim_end_sec": float(getattr(scene, "trim_end_sec", 0) or 0),
    }, default_transition=scene.transition_type or "fade")


async def render_video(
    project_id: str,
    job_id: str,
    session: Any,
    scenes: list[dict[str, Any] | SceneSpec] | None = None,
    settings: dict[str, Any] | None = None,
    stop_after_assets: bool = False,
    regenerate_scene_ids: set[str] | None = None,
    *,
    force_regenerate_scene_clips: bool = False,
) -> dict[str, Any]:
    """Backward-compatible wrapper around `ShortsForgeEngine`."""
    from backend.engine import EngineRequest, ShortsForgeEngine

    app_settings = get_settings()
    project_version: int | None = None
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project:
        project_version = project.version
        if settings is None:
            settings = project.settings or {}

    resolved_settings = ResolvedGenerationSettings.from_mapping(settings or {}, app_settings)
    engine_scenes = None
    if scenes is not None:
        engine_scenes = []
        for s in scenes:
            if isinstance(s, SceneSpec):
                engine_scenes.append(s)
            elif isinstance(s, dict):
                engine_scenes.append(
                    SceneSpec.from_mapping(
                        s,
                        default_transition=resolved_settings.transition,
                    )
                )
            else:
                engine_scenes.append(_scene_to_spec(s))

    target_stage = "assets" if stop_after_assets else "compile"
    engine = ShortsForgeEngine()
    result = (
        await engine.run(
            EngineRequest(
                project_id=project_id,
                job_id=job_id,
                settings=resolved_settings,
                scenes=engine_scenes,
                pipeline_mode="manual",
                target_stage=target_stage,
                regenerate_scene_ids=regenerate_scene_ids,
                force_regenerate_scene_clips=force_regenerate_scene_clips,
            ),
            session,
        )
    ).to_mapping()
    if result.get("project_version") is None and project_version is not None:
        result["project_version"] = project_version
    return result
