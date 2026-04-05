from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.core.websocket_manager import ws_manager
from backend.engine.context import EngineContext
from backend.config import get_settings
from backend.engine.planning import SceneSpec
from backend.models import Project, Scene
from backend.services.project_video_settings_service import apply_project_settings_snapshot
from backend.services.script_service import (
    generate_story_and_storyboard,
    generate_video_production_script,
    normalize_scene_narration,
    repair_storyboard_scene_narration,
)


def _scene_model_to_spec(scene: Scene, default_transition: str) -> SceneSpec:
    return SceneSpec.from_mapping(
        {
            "id": scene.id,
            "narration": scene.narration or "",
            "subtitle": scene.subtitle or scene.narration or "",
            "image_prompt": scene.image_prompt or "",
            "transition": scene.transition_type,
            "duration": scene.duration,
            "scene_type": scene.scene_type,
            "scene_settings": scene.scene_settings,
            "trim_start_sec": scene.trim_start_sec,
            "trim_end_sec": scene.trim_end_sec,
        },
        default_transition=default_transition,
    )


class StoryboardStage:
    async def run(self, context: EngineContext) -> EngineContext:
        session = context.session
        result = await session.execute(
            select(Project)
            .where(Project.id == context.project_id)
            .options(selectinload(Project.scenes), selectinload(Project.video_settings))
        )
        project = result.scalar_one()
        context.project_version = project.version

        if not context.scenes and project.scenes:
            context.scenes = [
                _scene_model_to_spec(scene, context.settings.transition)
                for scene in sorted(project.scenes, key=lambda s: s.order_index)
            ]
            return context

        if project.scenes:
            return context

        if context.scenes:
            raw_scenes = [scene.to_mapping() for scene in context.scenes]
            use_prod = False
        else:
            await ws_manager.send_progress(
                context.job_id,
                "video_render",
                0,
                "in_progress",
                "Generating script and storyboard",
            )
            use_prod = context.settings.use_production_storyboard
            script_text = context.settings.custom_script or project.script
            if use_prod and not script_text:
                storyboard = await generate_video_production_script(
                    concept=project.title or "AI Video",
                    story_type=context.settings.story_type or project.story_type,
                    scene_count=context.settings.scene_count,
                    dynamic_scenes=context.settings.dynamic_scenes,
                    image_style=context.settings.image_style,
                    resolution=context.settings.resolution,
                    transition=context.settings.transition,
                    llm_provider=context.settings.llm_provider,
                    llm_model=context.settings.llm_model,
                    temperature=0.7,
                    visual_continuity=context.settings.visual_continuity,
                    scene_narration_style=context.settings.scene_narration_style,
                    scene_duration_min=context.settings.scene_duration_min,
                    scene_duration_max=context.settings.scene_duration_max,
                )
            else:
                storyboard = await generate_story_and_storyboard(
                    concept=project.title if not script_text else None,
                    script=script_text,
                    story_type=context.settings.story_type or project.story_type,
                    scene_count=context.settings.scene_count,
                    dynamic_scenes=context.settings.dynamic_scenes,
                    image_style=context.settings.image_style,
                    resolution=context.settings.resolution,
                    transition=context.settings.transition,
                    word_count=context.settings.word_count,
                    scene_narration_style=context.settings.scene_narration_style,
                    generate_subtitles=context.settings.generate_subtitles,
                    llm_provider=context.settings.llm_provider,
                    llm_model=context.settings.llm_model,
                    story_template=context.settings.story_template,
                    visual_continuity=context.settings.visual_continuity,
                    scene_duration_min=context.settings.scene_duration_min,
                    scene_duration_max=context.settings.scene_duration_max,
                )
                use_prod = False

            project.title = storyboard.get("title", project.title)
            project.script = storyboard.get("script", project.script)
            settings_dict = context.settings.to_settings_dict()
            settings_dict["use_production_storyboard"] = bool(use_prod)
            if storyboard.get("visual_continuity"):
                settings_dict["visual_continuity"] = storyboard.get("visual_continuity")
            app = context.app_settings or get_settings()
            apply_project_settings_snapshot(project, settings_dict, app)
            raw_scenes = storyboard.get("scenes", [])

            if isinstance(storyboard, dict) and storyboard.get("quality_issues"):
                await ws_manager.send_progress(
                    context.job_id,
                    "video_render",
                    1,
                    "in_progress",
                    "Storyboard quality warnings: " + "; ".join(storyboard.get("quality_issues", [])),
                )

        raw_scenes = normalize_scene_narration(raw_scenes, script=project.script or "")
        protected_scene_indexes = {
            index
            for index, scene in enumerate(raw_scenes)
            if bool(scene.get("is_locked")) or bool(scene.get("is_manually_edited"))
        }
        raw_scenes, stage_issues = repair_storyboard_scene_narration(
            raw_scenes,
            script=project.script or "",
            skip_indexes=protected_scene_indexes,
        )
        if stage_issues:
            await ws_manager.send_progress(
                context.job_id,
                "video_render",
                1,
                "in_progress",
                "Narration quality checks: " + "; ".join(stage_issues),
            )
        normalized_scenes: list[SceneSpec] = []
        scene_duration_default = context.settings.scene_duration
        forced_transition = (
            context.settings.transition
            if context.settings.transition in {"fade_in_fade_out", "zoom_in_zoom_out"}
            else None
        )
        for i, sc in enumerate(raw_scenes):
            if use_prod:
                narration = (sc.get("script") or sc.get("narration") or sc.get("subtitle") or "").strip()
                subtitle = (sc.get("subtitle") or narration).strip()
                image_prompt = sc.get("image_prompt", "")
                transition = context.settings.transition
                scene_duration = sc.get("duration_seconds", scene_duration_default)
            else:
                narration = (sc.get("narration") or sc.get("subtitle") or sc.get("script") or "").strip()
                subtitle = (sc.get("subtitle") or narration).strip()
                image_prompt = sc.get("image_prompt", "")
                transition = forced_transition or sc.get("transition")
                scene_duration = sc.get("duration", scene_duration_default)

            session.add(
                Scene(
                    project_id=project.id,
                    order_index=i,
                    narration=narration,
                    subtitle=subtitle,
                    image_prompt=image_prompt,
                    transition_type=transition or context.settings.transition,
                    duration=scene_duration,
                    scene_type="image",
                )
            )
            normalized_scenes.append(
                SceneSpec.from_mapping(
                    {
                        **dict(sc),
                        "narration": narration,
                        "subtitle": subtitle,
                        "image_prompt": image_prompt,
                        "transition": transition or context.settings.transition,
                        "duration": scene_duration,
                    },
                    default_transition=context.settings.transition,
                )
            )

        await session.commit()
        context.scenes = normalized_scenes
        return context
