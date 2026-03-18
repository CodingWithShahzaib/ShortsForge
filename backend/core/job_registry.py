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

logger = logging.getLogger(__name__)

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


# ── Handler implementations ──────────────────────────────────────────

@register("video_render")
async def handle_video_render(params: dict[str, Any]) -> dict[str, Any]:
    """Render a full project video pipeline (storyboard → render)."""
    from backend.config import get_settings
    from backend.database import async_session
    from backend.models import Job, Project, Scene
    from backend.services.video_service import render_video
    from backend.services.script_service import generate_story_and_storyboard
    from backend.core.websocket_manager import ws_manager

    project_id = params["project_id"]
    job_id = params["job_id"]
    scenes = params.get("scenes")
    settings = params.get("settings") or {}
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
                .options(selectinload(Project.scenes))
            )
            project = r2.scalar_one()

            if not settings and project.settings:
                settings = project.settings

            if scenes is None and not project.scenes:
                await ws_manager.send_progress(
                    job_id, "video_render", 0, "in_progress", "Generating script and storyboard"
                )
                storyboard = await generate_story_and_storyboard(
                    concept=project.title if not settings.get("custom_script") else None,
                    script=settings.get("custom_script") or project.script,
                    story_type=settings.get("story_type", project.story_type),
                    scene_count=settings.get("scene_count", 5),
                    image_style=settings.get("image_style") or app_settings.default_image_style,
                    word_count=settings.get("word_count") or 400,
                    generate_subtitles=settings.get("generate_subtitles", True),
                    llm_provider=settings.get("llm_provider") or app_settings.default_llm_provider,
                    llm_model=settings.get("llm_model") or app_settings.default_llm_model,
                )

                project.title = storyboard.get("title", project.title)
                project.script = storyboard.get("script", project.script)
                project.settings = settings or project.settings

                scenes = []
                for i, sc in enumerate(storyboard.get("scenes", [])):
                    scene_duration = sc.get("duration", settings.get("scene_duration", 5.0))
                    scene = Scene(
                        project_id=project.id,
                        order_index=i,
                        narration=sc.get("narration", ""),
                        subtitle=sc.get("subtitle") or sc.get("narration", ""),
                        image_prompt=sc.get("image_prompt", ""),
                        transition_type=sc.get("transition") or settings.get("transition") or app_settings.default_transition,
                        duration=scene_duration,
                        scene_type="image",
                    )
                    session.add(scene)
                    sc_copy = dict(sc)
                    sc_copy["duration"] = scene_duration
                    scenes.append(sc_copy)
                await session.commit()
                await ws_manager.send_progress(
                    job_id, "video_render", 0, "in_progress", "Storyboard ready, rendering video"
                )
            elif scenes and not project.scenes:
                scene_duration_default = settings.get("scene_duration", 5.0)
                scene_objs = []
                for i, sc in enumerate(scenes):
                    scene_duration = sc.get("duration", scene_duration_default)
                    scene_obj = Scene(
                        project_id=project.id,
                        order_index=i,
                        narration=sc.get("narration", ""),
                        subtitle=sc.get("subtitle") or sc.get("narration", ""),
                        image_prompt=sc.get("image_prompt", ""),
                        transition_type=sc.get("transition") or settings.get("transition") or app_settings.default_transition,
                        duration=scene_duration,
                        scene_type="image",
                    )
                    session.add(scene_obj)
                    scene_objs.append(scene_obj)
                    sc["duration"] = scene_duration
                await session.commit()
                await ws_manager.send_progress(
                    job_id, "video_render", 0, "in_progress", "Scenes ready, rendering video"
                )

            prepare_only = params.get("prepare_only", False)
            result = await render_video(
                project_id=project_id,
                job_id=job_id,
                session=session,
                scenes=scenes,
                settings=settings if settings else None,
                stop_after_assets=prepare_only,
            )
            r = await session.execute(select(Job).where(Job.id == job_id))
            j = r.scalar_one()
            j.status = "completed"
            j.progress = 100
            j.result = result
            j.completed_at = datetime.now(timezone.utc)

            r2 = await session.execute(select(Project).where(Project.id == project_id))
            p = r2.scalar_one()
            p.status = "ready_for_edit" if result.get("prepared") else "completed"
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


@register("sora_generate")
async def handle_sora_generate(params: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.services import sora_service
    from backend.database import async_session
    from backend.models import Job

    job_id = params["job_id"]
    app_settings = get_settings()

    try:
        video = await sora_service.create_video(
            prompt=params["prompt"],
            model=params.get("model") or app_settings.default_video_model,
            size=params.get("size", "1280x720"),
            seconds=params.get("seconds", "8"),
            input_image_url=params.get("input_image_url"),
            input_image_file_id=params.get("input_image_file_id"),
            remix_id=params.get("remix_id"),
        )
        result = await sora_service.poll_and_download(video["id"], job_id=job_id)
        await _mark_job_completed(job_id, result)
        return result
    except Exception as exc:
        await _mark_job_failed(job_id, str(exc))
        raise


@register("sora_edit")
async def handle_sora_edit(params: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.services import sora_service

    job_id = params["job_id"]
    app_settings = get_settings()
    try:
        video = await sora_service.edit_video(
            params["video_id"], params["prompt"], params.get("model") or app_settings.default_video_model,
        )
        result = await sora_service.poll_and_download(video["id"], job_id=job_id)
        await _mark_job_completed(job_id, result)
        return result
    except Exception as exc:
        await _mark_job_failed(job_id, str(exc))
        raise


@register("sora_extend")
async def handle_sora_extend(params: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.services import sora_service

    job_id = params["job_id"]
    app_settings = get_settings()
    try:
        video = await sora_service.extend_video(
            params["video_id"], params["prompt"],
            params.get("model") or app_settings.default_video_model, params.get("seconds", "8"),
        )
        result = await sora_service.poll_and_download(video["id"], job_id=job_id)
        await _mark_job_completed(job_id, result)
        return result
    except Exception as exc:
        await _mark_job_failed(job_id, str(exc))
        raise


@register("sora_remix")
async def handle_sora_remix(params: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.services import sora_service

    job_id = params["job_id"]
    app_settings = get_settings()
    try:
        video = await sora_service.remix_video(
            params["video_id"], params.get("prompt"),
            params.get("model") or app_settings.default_video_model, params.get("size"), params.get("seconds"),
        )
        result = await sora_service.poll_and_download(video["id"], job_id=job_id)
        await _mark_job_completed(job_id, result)
        return result
    except Exception as exc:
        await _mark_job_failed(job_id, str(exc))
        raise


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
