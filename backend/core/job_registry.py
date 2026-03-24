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
                    story_template=settings.get("story_template", "default"),
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

            storyboard_only = params.get("storyboard_only", False)
            if storyboard_only:
                r_pf = await session.execute(
                    select(Project)
                    .where(Project.id == project_id)
                    .options(selectinload(Project.scenes))
                )
                proj_for_skip = r_pf.scalar_one()
                if not proj_for_skip.scenes:
                    raise ValueError(
                        "storyboard_only requires at least one scene. "
                        "Use a concept/custom script or pass pre-defined scenes."
                    )
                await ws_manager.send_progress(
                    job_id, "video_render", 99, "in_progress",
                    "Storyboard ready — generate assets per scene, then compile",
                )
                result = {
                    "prepared": True,
                    "storyboard_only": True,
                    "scenes": len(proj_for_skip.scenes),
                }
                r = await session.execute(select(Job).where(Job.id == job_id))
                j = r.scalar_one()
                j.status = "completed"
                j.progress = 100
                j.result = result
                j.completed_at = datetime.now(timezone.utc)
                proj_for_skip.status = "ready_for_edit"
                await session.commit()
                return result

            prepare_only = params.get("prepare_only", False)
            inc = params.get("incremental_scene_ids") or []
            reg_set: set[str] | None = set(inc) if inc else None
            result = await render_video(
                project_id=project_id,
                job_id=job_id,
                session=session,
                scenes=scenes,
                settings=settings if settings else None,
                stop_after_assets=prepare_only,
                regenerate_scene_ids=reg_set,
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


@register("asset_generate")
async def handle_asset_generate(params: dict[str, Any]) -> dict[str, Any]:
    """Generate a single scene asset (image or TTS) asynchronously."""
    from backend.config import get_settings
    from backend.database import async_session
    from backend.models import Job, Project, Scene, Asset
    from backend.services.image_service import generate_image
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

        r_proj = await session.execute(select(Project).where(Project.id == project_id))
        project = r_proj.scalar_one()
        settings = project.settings or {}

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
            seed = ov.get("seed")
            if seed is not None and seed != "":
                try:
                    gen_kwargs["seed"] = int(seed)
                except (TypeError, ValueError):
                    gen_kwargs["seed"] = seed

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
                img_prompt, image_provider, width, height, image_style, **gen_kwargs
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
                    **{k: gen_kwargs[k] for k in ("negative_prompt", "seed") if k in gen_kwargs},
                },
            )
            session.add(new_asset)
        elif asset_type == "audio":
            for a in list(scene.assets):
                if a.type == "video":
                    await session.delete(a)
            await session.flush()

            narration = (prompt_override or scene.narration or "").strip()
            if not narration:
                raise ValueError("Scene has no narration for TTS")

            tts_provider = settings.get("tts_provider") or app_settings.default_tts_provider
            tts_voice = settings.get("tts_voice") or app_settings.default_tts_voice

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
            audio_key = await synthesize_speech(narration, tts_provider, tts_voice, save=True)
            new_asset = Asset(
                scene_id=scene_id,
                type="audio",
                file_path=audio_key,
                provider=tts_provider,
                source="ai_generated",
                parent_asset_id=prev_id,
                is_active=True,
                metadata_={"voice": tts_voice},
            )
            session.add(new_asset)
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
