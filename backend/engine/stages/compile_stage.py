from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.core import ffmpeg
from backend.core.storage import get_storage
from backend.core.websocket_manager import ws_manager
from backend.engine.context import EngineContext
from backend.engine.executors.media_pipeline import (
    _apply_visual_style_overlays,
    _apply_optional_background_music,
    _apply_optional_overlay,
    _apply_render_subtitles,
    _concat_and_merge_render_media,
    _render_scene_audio,
    _render_scene_visual,
    _save_final_render,
)
from backend.engine.planning import SceneSpec, build_render_plan
from backend.engine.results import EngineResult
from backend.models import Scene


class CompileStage:
    async def run(self, context: EngineContext) -> EngineResult:
        work_dir = context.work_dir
        local_output_dir = context.local_output_dir
        if work_dir is None or local_output_dir is None:
            raise ValueError("EngineContext directories must be set before running CompileStage")
        work_dir.mkdir(parents=True, exist_ok=True)
        local_output_dir.mkdir(parents=True, exist_ok=True)

        storage = get_storage()
        result = await context.session.execute(
            select(Scene)
            .where(Scene.project_id == context.project_id)
            .options(selectinload(Scene.assets))
            .order_by(Scene.order_index)
        )
        db_scenes = result.scalars().all()
        scene_models = {i: db_scenes[i] for i in range(min(len(db_scenes), len(context.scenes)))} if db_scenes else {}

        total_steps = len(context.scenes) * 3 + 4
        step = 0

        async def _progress(detail: str = "") -> None:
            nonlocal step
            step += 1
            pct = min(int(step / total_steps * 100), 99)
            await ws_manager.send_progress(
                context.job_id,
                "video_render",
                pct,
                "in_progress",
                detail,
            )

        width, height = map(int, context.settings.resolution.split("x"))
        audio_sem = asyncio.Semaphore(4)
        visual_sem = asyncio.Semaphore(4)
        db_lock = asyncio.Lock()

        audio_packed = await asyncio.gather(*[
            _render_scene_audio(
                idx=i,
                sc=context.scenes[i],
                scene_model=scene_models.get(i),
                session=context.session,
                db_lock=db_lock,
                audio_sem=audio_sem,
                work_dir=work_dir,
                resolved_settings=context.settings,
                tts_provider=context.settings.tts_provider,
                tts_voice=context.settings.tts_voice,
                regenerate_scene_ids=context.regenerate_scene_ids,
                progress=_progress,
            )
            for i in range(len(context.scenes))
        ])
        context.audio_paths = [p[0] for p in audio_packed]
        context.durations = [p[1] for p in audio_packed]

        transitions_between = [
            context.scenes[i].transition or context.scenes[i].transition_type or "fade"
            for i in range(1, len(context.scenes))
        ]
        runtime_scenes = [
            SceneSpec.from_mapping(
                {
                    **scene.to_mapping(),
                    "duration": context.durations[i] if i < len(context.durations) else scene.duration,
                },
                default_transition=scene.transition or scene.transition_type or context.settings.transition,
            )
            for i, scene in enumerate(context.scenes)
        ]
        context.render_plan = build_render_plan(context.settings, runtime_scenes)
        context.scenes = context.render_plan.scenes

        paced_durations = context.render_plan.timeline.paced_durations
        boundary_overlaps = context.render_plan.timeline.boundary_overlaps

        context.visual_paths = await asyncio.gather(*[
            _render_scene_visual(
                idx=i,
                sc=context.scenes[i],
                scene_model=scene_models.get(i),
                session=context.session,
                db_lock=db_lock,
                visual_sem=visual_sem,
                work_dir=work_dir,
                storage=storage,
                project_id=context.project_id,
                resolved_settings=context.settings,
                width=width,
                height=height,
                duration=paced_durations[i],
                regenerate_scene_ids=context.regenerate_scene_ids,
                force_regenerate_scene_clips=context.force_regenerate_scene_clips,
                progress=_progress,
            )
            for i in range(len(context.scenes))
        ])

        for idx in range(len(context.scenes)):
            norm = str(work_dir / f"audio_norm_{idx:03d}.mp3")
            await ffmpeg.pad_or_trim_audio(
                context.audio_paths[idx],
                paced_durations[idx],
                norm,
                start_seconds=float(context.scenes[idx].trim_start_sec or 0.0),
            )
            context.audio_paths[idx] = norm

        merged = await _concat_and_merge_render_media(
            work_dir=work_dir,
            visual_paths=context.visual_paths,
            audio_paths=context.audio_paths,
            transitions_between=transitions_between,
            boundary_overlaps=boundary_overlaps,
            progress=_progress,
        )
        current = await _apply_render_subtitles(
            current_video=merged,
            work_dir=work_dir,
            render_plan=context.render_plan,
            audio_paths=context.audio_paths,
            width=width,
            height=height,
            progress=_progress,
        )
        current = await _apply_optional_overlay(
            current_video=current,
            raw_overlay=None,
            work_dir=work_dir,
            width=width,
            height=height,
            progress=_progress,
        )
        current = await _apply_visual_style_overlays(
            current_video=current,
            work_dir=work_dir,
            settings=context.settings,
            progress=_progress,
        )
        current = await _apply_optional_background_music(
            current_video=current,
            bg_music=context.settings.background_music,
            bg_volume=context.settings.background_music_volume,
            ducking_enabled=context.settings.ducking_enabled,
            ducking_amount=context.settings.ducking_amount,
            work_dir=work_dir,
            progress=_progress,
        )

        final_key, final_url, final_duration = await _save_final_render(
            current_video=current,
            local_output_dir=local_output_dir,
            project_id=context.project_id,
            storage=storage,
        )
        context.final_video_path = final_key
        context.final_video_url = final_url
        context.final_duration = final_duration

        return EngineResult(
            project_id=context.project_id,
            scenes=len(context.scenes),
            video_path=final_key,
            video_url=final_url,
            duration=final_duration,
            resolution=context.settings.resolution,
            inter_scene_pause_ms=context.settings.inter_scene_pause_ms,
            transition_overlap_ms=context.settings.transition_overlap_ms,
            project_version=context.project_version,
        )
