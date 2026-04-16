"""
Job handler registry for serializable job dispatch.

Each job type maps to a handler function that accepts a dict of params
and returns a result dict. Handlers are registered at import time and
looked up by the worker when processing queued jobs.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.engine.planning import ResolvedGenerationSettings, SceneSpec
from backend.services.image_prompt_runtime import (
    build_image_prompt_audit_metadata,
    compose_image_generation_prompt,
)

logger = logging.getLogger(__name__)


def _ws_pipeline_storyboard_only(scene_count: int) -> dict[str, Any]:
    """Scene-level steps for UI: storyboard done; assets wait for Studio or render."""
    return {
        "scenes": [
            {
                "index": i,
                "storyboard": "complete",
                "image": "pending",
                "tts": "pending",
            }
            for i in range(scene_count)
        ]
    }


HandlerFn = Callable[[dict[str, Any]], Coroutine[Any, Any, dict[str, Any]]]

_handlers: dict[str, HandlerFn] = {}


def register(job_type: str):
    """Decorator to register a job handler for a given type."""
    def decorator(fn: HandlerFn) -> HandlerFn:
        _handlers[job_type] = fn
        logger.debug("Registered job handler: %s -> %s", job_type, fn.__name__)
        return fn
    return decorator


def get_handler(job_type: str) -> HandlerFn | None:
    return _handlers.get(job_type)


def list_handlers() -> list[str]:
    return list(_handlers.keys())


def _resolve_pipeline_request(params: dict[str, Any], settings: dict[str, Any]) -> tuple[str, str]:
    mode = str(params.get("pipeline_mode") or settings.get("pipeline_mode") or "manual").lower()
    stage_raw = params.get("target_stage")
    if not stage_raw:
        if params.get("storyboard_only", False):
            stage_raw = "storyboard"
        elif params.get("prepare_only", False):
            stage_raw = "assets"
        elif mode == "auto":
            stage_raw = "compile"
        else:
            stage_raw = "storyboard"
    stage = str(stage_raw).lower()
    if mode not in {"manual", "auto"}:
        mode = "manual"
    if stage not in {"storyboard", "assets", "compile"}:
        stage = "storyboard"
    if mode == "auto":
        stage = "compile"
    return mode, stage


# ── Handler implementations ──────────────────────────────────────────

@register("video_render")
async def handle_video_render(params: dict[str, Any]) -> dict[str, Any]:
    """Render a full project video pipeline (storyboard → render)."""
    from backend.database import async_session
    from backend.engine import EngineRequest, ShortsForgeEngine
    from backend.models import Job, Project
    from backend.services.project_video_settings_service import build_runtime_settings

    project_id = params["project_id"]
    job_id = params["job_id"]
    scenes = params.get("scenes")
    if isinstance(scenes, list) and not scenes:
        scenes = None
    settings = params.get("settings") or {}
    from backend.config import get_settings
    app_settings = get_settings()

    async with async_session() as session:
        try:
            r_job = await session.execute(select(Job).where(Job.id == job_id))
            j = r_job.scalar_one_or_none()
            if j and j.status != "in_progress":
                j.status = "in_progress"
                j.started_at = j.started_at or datetime.now(timezone.utc)
                j.progress = max(j.progress or 0, 1)
                await session.commit()

            r2 = await session.execute(
                select(Project)
                .where(Project.id == project_id)
                .options(selectinload(Project.scenes), selectinload(Project.video_settings))
            )
            project = r2.scalar_one()
            if not settings:
                settings = build_runtime_settings(project, app_settings)
            resolved_settings = ResolvedGenerationSettings.from_mapping(settings, app_settings)

            pipeline_mode, target_stage = _resolve_pipeline_request(params, settings)

            inc = params.get("incremental_scene_ids") or []
            reg_set: set[str] | None = set(inc) if inc else None
            if inc:
                force_scene_clips = bool(params.get("force_regenerate_scene_clips", False))
            else:
                raw_f = params.get("force_regenerate_scene_clips")
                if raw_f is not None:
                    force_scene_clips = bool(raw_f)
                else:
                    force_scene_clips = bool((settings or {}).get("match_scenes_to_audio", False))

            engine_scenes = (
                [
                    scene
                    if isinstance(scene, SceneSpec)
                    else SceneSpec.from_mapping(
                        scene,
                        default_transition=resolved_settings.transition,
                    )
                    for scene in scenes
                ]
                if scenes is not None
                else None
            )
            engine = ShortsForgeEngine()
            result = (
                await engine.run(
                    EngineRequest(
                        project_id=project_id,
                        job_id=job_id,
                        scenes=engine_scenes,
                        settings=resolved_settings,
                        pipeline_mode=pipeline_mode,
                        target_stage=target_stage,
                        regenerate_scene_ids=reg_set,
                        force_regenerate_scene_clips=force_scene_clips,
                    ),
                    session,
                )
            ).to_mapping()
            r = await session.execute(select(Job).where(Job.id == job_id))
            j = r.scalar_one()
            j.status = "completed"
            j.progress = 100
            j.result = result
            j.completed_at = datetime.now(timezone.utc)

            r2 = await session.execute(select(Project).where(Project.id == project_id))
            p = r2.scalar_one()
            if result.get("storyboard_only"):
                p.status = "ready_for_edit"
            elif result.get("prepared"):
                p.status = "ready_for_compile"
            else:
                p.status = "completed"
            await session.commit()
            return result
        except Exception as exc:
            r = await session.execute(select(Job).where(Job.id == job_id))
            j = r.scalar_one()
            j.status = "failed"
            j.error = {"message": str(exc)}
            j.completed_at = datetime.now(timezone.utc)

            r2 = await session.execute(select(Project).where(Project.id == project_id))
            p = r2.scalar_one()
            p.status = "failed"
            await session.commit()
            raise


@register("asset_generate")
async def handle_asset_generate(params: dict[str, Any]) -> dict[str, Any]:
    """Generate a single scene asset (image or TTS) asynchronously."""
    from backend.config import get_settings
    from backend.database import async_session
    from backend.models import Job, Project, Scene, Asset
    from backend.services.project_video_settings_service import ensure_scene_asset_override
    from backend.services.image_service import DEFAULT_TEXT_NEGATIVE_PROMPT, generate_image
    from backend.services.audio_service import synthesize_speech
    from backend.core.websocket_manager import ws_manager

    project_id = params["project_id"]
    scene_id = params["scene_id"]
    job_id = params["job_id"]
    asset_type = params["asset_type"]
    prompt_override = params.get("prompt_override")

    app_settings = get_settings()

    try:
        return await _run_asset_generate(
            project_id, scene_id, job_id, asset_type, prompt_override, app_settings,
        )
    except Exception as exc:
        from backend.models import Job as JobModel

        async with async_session() as session:
            r = await session.execute(select(JobModel).where(JobModel.id == job_id))
            j = r.scalar_one_or_none()
            if j:
                j.status = "failed"
                j.error = {"message": str(exc)}
                j.completed_at = datetime.now(timezone.utc)
                await session.commit()
        raise


async def _run_asset_generate(
    project_id: str,
    scene_id: str,
    job_id: str,
    asset_type: str,
    prompt_override: str | None,
    app_settings: object,
) -> dict[str, Any]:
    from backend.database import async_session
    from backend.models import Job, Project, Scene, Asset
    from backend.services.project_video_settings_service import (
        build_runtime_settings,
        ensure_scene_asset_override,
    )
    from backend.services.image_service import generate_image
    from backend.services.audio_service import synthesize_speech
    from backend.core.websocket_manager import ws_manager

    async with async_session() as session:
        r_job = await session.execute(select(Job).where(Job.id == job_id))
        j = r_job.scalar_one_or_none()
        if j and j.status != "in_progress":
            j.status = "in_progress"
            j.started_at = j.started_at or datetime.now(timezone.utc)
            j.progress = max(j.progress or 0, 5)
            await session.commit()

        await ws_manager.send_progress(
            job_id, "asset_generate", 15, "in_progress", f"Generating {asset_type}"
        )

        r = await session.execute(
            select(Scene)
            .where(Scene.id == scene_id, Scene.project_id == project_id)
            .options(selectinload(Scene.assets))
        )
        scene = r.scalar_one_or_none()
        if not scene:
            raise ValueError("Scene not found")

        r_proj = await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.video_settings))
        )
        project = r_proj.scalar_one()
        settings = build_runtime_settings(project, app_settings)
        resolved_settings = ResolvedGenerationSettings.from_mapping(settings, app_settings)

        if asset_type == "image":
            for a in list(scene.assets):
                if a.type == "video":
                    await session.delete(a)
            await session.flush()

            img_prompt = (prompt_override or scene.image_prompt or "").strip()
            if not img_prompt:
                raise ValueError("Scene has no image prompt (set image_prompt or pass prompt_override)")

            resolution = settings.get("resolution", "1080x1920")
            width, height = map(int, resolution.split("x"))
            ov = scene.scene_settings if isinstance(scene.scene_settings, dict) else {}
            image_provider = ov.get("image_provider") or settings.get("image_provider", "replicate")
            image_style = ov.get("image_style") or settings.get("image_style", "realistic")
            gen_kwargs: dict = {}
            nprompt = ov.get("negative_prompt")
            if isinstance(nprompt, str) and nprompt.strip():
                gen_kwargs["negative_prompt"] = nprompt.strip()
            else:
                gen_kwargs["negative_prompt"] = DEFAULT_TEXT_NEGATIVE_PROMPT
            seed = ov.get("seed")
            if seed is not None and seed != "":
                try:
                    gen_kwargs["seed"] = int(seed)
                except (TypeError, ValueError):
                    gen_kwargs["seed"] = seed

            scene_spec = SceneSpec.from_mapping(
                {
                    "id": scene.id,
                    "narration": scene.narration,
                    "subtitle": scene.subtitle,
                    "image_prompt": img_prompt,
                    "transition_type": scene.transition_type,
                    "scene_type": scene.scene_type,
                    "duration": scene.duration,
                    "scene_settings": ov,
                    "trim_start_sec": scene.trim_start_sec,
                    "trim_end_sec": scene.trim_end_sec,
                }
            )
            final_prompt = compose_image_generation_prompt(scene_spec, resolved_settings)
            prompt_audit = build_image_prompt_audit_metadata(
                scene=scene_spec,
                settings=resolved_settings,
                provider=image_provider,
                style=image_style,
                final_prompt=final_prompt,
                generation_kwargs=gen_kwargs,
            )
            logger.info(
                "Manual image prompt audit scene_id=%s provider=%s style=%s beat_role=%s profile=%s preview=%s",
                scene_id,
                image_provider,
                image_style,
                prompt_audit.get("beat_role"),
                prompt_audit.get("story_profile"),
                final_prompt[:200],
            )

            prev_id: str | None = None
            imgs = [a for a in scene.assets if a.type == "image" and a.is_active]
            if imgs:
                imgs.sort(
                    key=lambda x: x.created_at.timestamp() if x.created_at else 0.0,
                    reverse=True,
                )
                prev_id = imgs[0].id
            for a in scene.assets:
                if a.type == "image":
                    a.is_active = False
            await session.flush()

            img_path = await generate_image(
                final_prompt, image_provider, width, height, image_style, **gen_kwargs
            )
            await ws_manager.send_progress(job_id, "asset_generate", 80, "in_progress", "Saving image")
            new_asset = Asset(
                scene_id=scene_id,
                type="image",
                file_path=img_path,
                provider=image_provider,
                source="ai_generated",
                parent_asset_id=prev_id,
                is_active=True,
                metadata_={
                    "width": width,
                    "height": height,
                    "style": image_style,
                    "prompt_audit": prompt_audit,
                    **{k: gen_kwargs[k] for k in ("negative_prompt", "seed") if k in gen_kwargs},
                },
            )
            session.add(new_asset)
            override_row = ensure_scene_asset_override(scene)
            override_row.manual_image_path = None
            override_row.image_status = "ai_generated"
        elif asset_type == "audio":
            for a in list(scene.assets):
                if a.type == "video":
                    await session.delete(a)
            await session.flush()

            narration = (prompt_override or scene.narration or scene.subtitle or "").strip()
            if not narration:
                raise ValueError("Scene has no narration for TTS")

            tts_provider = settings.get("tts_provider") or app_settings.default_tts_provider
            tts_voice = settings.get("tts_voice") or app_settings.default_tts_voice
            tts_speed = float(settings.get("tts_speed") or app_settings.default_tts_speed or 1.0)
            tts_response_format = str(
                settings.get("tts_response_format") or app_settings.default_tts_response_format or "mp3"
            )
            tts_normalize = bool(
                settings.get("tts_normalize")
                if settings.get("tts_normalize") is not None
                else app_settings.default_tts_normalize
                if app_settings.default_tts_normalize is not None
                else True
            )

            audios = [a for a in scene.assets if a.type == "audio" and a.is_active]
            prev_id = None
            if audios:
                audios.sort(
                    key=lambda x: x.created_at.timestamp() if x.created_at else 0.0,
                    reverse=True,
                )
                prev_id = audios[0].id
            for a in scene.assets:
                if a.type == "audio":
                    a.is_active = False
            await session.flush()

            await ws_manager.send_progress(job_id, "asset_generate", 40, "in_progress", "Synthesizing speech")
            audio_key = await synthesize_speech(
                narration,
                tts_provider,
                tts_voice,
                tts_speed,
                save=True,
                response_format=tts_response_format,
                normalization_options={"normalize": tts_normalize},
            )
            new_asset = Asset(
                scene_id=scene_id,
                type="audio",
                file_path=audio_key,
                provider=tts_provider,
                source="ai_generated",
                parent_asset_id=prev_id,
                is_active=True,
                metadata_={
                    "voice": tts_voice,
                    "speed": tts_speed,
                    "response_format": tts_response_format,
                    "normalize": tts_normalize,
                },
            )
            session.add(new_asset)
            override_row = ensure_scene_asset_override(scene)
            override_row.manual_audio_path = None
            override_row.audio_status = "ai_generated"
        else:
            raise ValueError(f"Unsupported asset_type: {asset_type}")

        rj = await session.execute(select(Job).where(Job.id == job_id))
        job_row = rj.scalar_one()
        job_row.status = "completed"
        job_row.progress = 100
        result = {"scene_id": scene_id, "asset_type": asset_type, "ok": True}
        job_row.result = result
        job_row.completed_at = datetime.now(timezone.utc)

        project.version = (project.version or 1) + 1
        await session.commit()
        return result


# ── Shared helpers ────────────────────────────────────────────────────

async def _mark_job_completed(job_id: str, result: dict) -> None:
    from backend.database import async_session
    from backend.models import Job

    async with async_session() as session:
        r = await session.execute(select(Job).where(Job.id == job_id))
        j = r.scalar_one_or_none()
        if j:
            j.status = "completed"
            j.progress = 100
            j.result = result
            j.completed_at = datetime.now(timezone.utc)
            await session.commit()


async def _mark_job_failed(job_id: str, error_msg: str) -> None:
    from backend.database import async_session
    from backend.models import Job

    async with async_session() as session:
        r = await session.execute(select(Job).where(Job.id == job_id))
        j = r.scalar_one_or_none()
        if j:
            j.status = "failed"
            j.error = {"message": error_msg}
            j.completed_at = datetime.now(timezone.utc)
            await session.commit()
