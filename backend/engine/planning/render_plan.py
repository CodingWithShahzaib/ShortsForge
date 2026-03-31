from __future__ import annotations

from dataclasses import dataclass

from backend.engine.planning.scenes import SceneSpec
from backend.engine.planning.settings import ResolvedGenerationSettings
from backend.engine.planning.timeline import TimelinePlan, build_timeline_plan


@dataclass(frozen=True)
class RenderPlan:
    settings: ResolvedGenerationSettings
    scenes: list[SceneSpec]
    timeline: TimelinePlan


def build_render_plan(
    settings: ResolvedGenerationSettings,
    scenes: list[SceneSpec],
) -> RenderPlan:
    transitions_between = [scenes[i].transition or scenes[i].transition_type or settings.transition for i in range(1, len(scenes))]
    timeline = build_timeline_plan(
        [scene.duration for scene in scenes],
        transitions_between,
        settings.inter_scene_pause_ms,
        settings.transition_overlap_ms,
    )
    return RenderPlan(
        settings=settings,
        scenes=scenes,
        timeline=timeline,
    )


__all__ = ["RenderPlan", "build_render_plan"]
