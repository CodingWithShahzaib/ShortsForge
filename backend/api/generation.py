from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.core.prompts.dialogue_prompts import build_dialogue_scene_prompt
from backend.core.storage import build_key, get_storage, guess_content_type, local_path_for
from backend.database import get_db
from backend.engine.planning import ResolvedGenerationSettings
from backend.models import Job, Project, Scene
from backend.schemas import (
    BatchGenerateRequest,
    CharacterConfig,
    DialogueSceneInput,
    DialogueVideoRequest,
    GenerateVideoRequest,
    JobOut,
)
from backend.core.task_manager import task_manager
from backend.services.project_video_settings_service import apply_project_settings_snapshot
from backend.services.script_service import sanitize_speaker_tagged_dialogue

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_pipeline_intent(req: GenerateVideoRequest) -> tuple[str, str]:
    """Normalize new stage contract with legacy storyboard/prepare flags."""
    mode = req.pipeline_mode or "manual"
    stage = req.target_stage
    if stage is None:
        if req.storyboard_only:
            stage = "storyboard"
        elif req.prepare_only:
            stage = "assets"
        elif mode == "auto":
            stage = "compile"
        else:
            stage = "storyboard"
    if mode == "auto":
        stage = "compile"
    return mode, stage


def _resolve_generation_settings(req: GenerateVideoRequest) -> dict[str, Any]:
    """Resolve request settings into the canonical stored engine settings."""
    app_settings = get_settings()
    return ResolvedGenerationSettings.from_request(req, app_settings).to_settings_dict()


def _job_to_out(job: Job) -> JobOut:
    """Build a plain response model to avoid ORM recursive encoding edge-cases."""
    result = job.result if isinstance(job.result, dict) else None
    error = job.error if isinstance(job.error, dict) else None
    return JobOut(
        id=job.id,
        project_id=job.project_id,
        type=job.type,
        status=job.status,
        progress=int(job.progress or 0),
        result=result,
        error=error,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
    )


STYLE_PRESET_SETTINGS: dict[str, dict[str, Any]] = {
    "comic_book": {
        "image_style": "comic_book",
        "negative_prompt": (
            "photorealistic, 3d render, blurry, soft edges, watercolor, "
            "washed colors, weak outlines, text, letters, signature, watermark"
        ),
        "transition": "crossfade",
    },
    "political_cartoon": {
        "image_style": "comic_book",
        "negative_prompt": (
            "photorealistic, 3d render, blurry, soft edges, painterly wash, "
            "watermark, text, typography, logo"
        ),
        "transition": "crossfade",
    },
    "graphic_novel": {
        "image_style": "comic_book",
        "negative_prompt": (
            "photorealistic, 3d render, blurry, low contrast, watercolor, "
            "logo, text, letters, signature"
        ),
        "transition": "crossfade",
    },
    "anime": {
        "image_style": "anime",
        "negative_prompt": (
            "photorealistic, 3d render, muddy shading, distorted anatomy, "
            "grainy realism, text, watermark"
        ),
        "transition": "crossfade",
    },
    "photorealistic": {
        "image_style": "realistic",
        "negative_prompt": (
            "cartoon stylization, comic-book outlines, cel shading, exaggerated anatomy, "
            "watermark, text, logo"
        ),
        "transition": "crossfade",
    },
    "documentary": {
        "image_style": "realistic",
        "negative_prompt": (
            "fantasy stylization, comic-book outlines, glossy studio glam lighting, "
            "watermark, text, logo"
        ),
        "transition": "crossfade",
    },
    "cinematic": {
        "image_style": "cinematic",
        "negative_prompt": (
            "flat lighting, cartoon simplification, blurry details, oversaturated colors, "
            "text, watermark, logo"
        ),
        "transition": "crossfade",
    },
    "cinematic_noir": {
        "image_style": "cinematic",
        "negative_prompt": (
            "flat daylight lighting, cheerful pastel palette, washed blacks, soft low-contrast image, "
            "text, watermark, logo"
        ),
        "transition": "crossfade",
    },
    "epic_blockbuster": {
        "image_style": "cinematic",
        "negative_prompt": (
            "small-scale staging, dull lighting, low contrast, casual snapshot framing, "
            "text, watermark, logo"
        ),
        "transition": "crossfade",
    },
    "watercolor": {
        "image_style": "watercolor",
        "negative_prompt": (
            "photorealistic, hard 3d render, heavy comic outlines, muddy pigment, "
            "text, watermark, signature"
        ),
        "transition": "crossfade",
    },
}


def build_character_prompt(
    scene_text: str,
    character: CharacterConfig,
    shot_type: str,
    base_style: str,
) -> str:
    prompt = build_dialogue_scene_prompt(
        character=character,
        dialogue_line=scene_text,
        shot_type=shot_type,
        preset=base_style,
    )
    return (
        f"{prompt}, {base_style.replace('_', ' ')}, "
        "consistent character design, same face, same outfit, same silhouette"
    )


def _dialogue_style_settings(preset: str) -> dict[str, Any]:
    return STYLE_PRESET_SETTINGS.get(preset, STYLE_PRESET_SETTINGS["comic_book"])


def _parse_dialogue_script(
    script: str,
    characters: list[CharacterConfig],
) -> list[DialogueSceneInput]:
    cleaned_script = sanitize_speaker_tagged_dialogue(script or "")
    lines = [line.strip() for line in cleaned_script.splitlines() if line.strip()]
    if not lines:
        raise HTTPException(400, "Dialogue script is empty.")

    character_by_name = {character.name.strip().lower(): character for character in characters}
    ordered_ids = [character.id for character in characters]
    dialogue_scenes: list[DialogueSceneInput] = []

    for index, raw_line in enumerate(lines):
        speaker_id: str | None = None
        narration = raw_line
        if ":" in raw_line:
            maybe_speaker, maybe_text = raw_line.split(":", 1)
            speaker = character_by_name.get(maybe_speaker.strip().lower())
            if speaker is not None:
                speaker_id = speaker.id
                narration = maybe_text.strip()
        if speaker_id is None:
            speaker_id = ordered_ids[index % len(ordered_ids)]
        dialogue_scenes.append(
            DialogueSceneInput(
                speaker_id=speaker_id,
                narration=narration.strip(),
                shot_type="medium",
                transition="crossfade",
            )
        )
    return dialogue_scenes


def _build_dialogue_scene_payloads(payload: DialogueVideoRequest) -> list[dict[str, Any]]:
    if not payload.characters:
        raise HTTPException(400, "At least two characters are required for dialogue videos.")

    style_settings = _dialogue_style_settings(payload.dialogue_style_preset)
    resolved_transition = payload.transition or style_settings["transition"]
    characters_by_id = {character.id: character for character in payload.characters}
    raw_scenes = payload.dialogue_scenes or _parse_dialogue_script(payload.custom_script or "", payload.characters)
    built_scenes: list[dict[str, Any]] = []

    for scene_index, scene in enumerate(raw_scenes):
        speaker = (
            characters_by_id.get(scene.speaker_id or "")
            or payload.characters[scene_index % len(payload.characters)]
        )
        shot_type = "reaction" if scene.is_reaction_shot else scene.shot_type or payload.default_shot_type
        subtitle = scene.subtitle or scene.narration
        speaker_prefix = f"{speaker.name}:"
        if payload.speaker_labels_in_subtitles and not subtitle.strip().lower().startswith(speaker_prefix.lower()):
            subtitle = f"{speaker.name}: {subtitle}"
        image_prompt = build_character_prompt(
            scene_text=scene.narration,
            character=speaker,
            shot_type=shot_type,
            base_style=payload.dialogue_style_preset,
        )
        built_scenes.append(
            {
                "narration": scene.narration,
                "subtitle": subtitle,
                "image_prompt": image_prompt,
                "transition": resolved_transition if not payload.dialogue_scenes else (scene.transition or resolved_transition),
                "duration": scene.duration or (
                    payload.reaction_shot_duration if scene.is_reaction_shot else payload.scene_duration
                ),
                "scene_type": "dialogue",
                "speaker_id": speaker.id,
                "shot_type": shot_type,
                "is_reaction_shot": scene.is_reaction_shot,
                "scene_settings": {
                    "speaker_id": speaker.id,
                    "speaker_name": speaker.name,
                    "shot_type": shot_type,
                    "is_reaction_shot": scene.is_reaction_shot,
                    "voice_profile": speaker.voice_profile,
                    "character_references": {
                        "reference_image_url": speaker.reference_image_url,
                        "color_palette": speaker.color_palette,
                    },
                    "negative_prompt": style_settings["negative_prompt"],
                },
            }
        )
    return built_scenes


async def _delete_final_videos_for_recompile(project_id: str, db: AsyncSession) -> None:
    """Remove stored final renders for a project and clear video pointers on completed video_render jobs."""
    result = await db.execute(
        select(Job).where(
            Job.project_id == project_id,
            Job.type == "video_render",
            Job.status == "completed",
        )
    )
    jobs = result.scalars().all()
    keys: list[str] = []
    for job in jobs:
        res = job.result if isinstance(job.result, dict) else {}
        vp = res.get("video_path")
        if isinstance(vp, str) and vp.strip():
            keys.append(vp.strip())
        vu = res.get("video_url")
        if isinstance(vu, str) and vu.strip() and not vu.startswith("http"):
            keys.append(vu.strip())
    unique_keys = list(dict.fromkeys(keys))
    storage = get_storage()
    for key in unique_keys:
        try:
            await storage.delete(key)
        except Exception:
            logger.warning("Could not delete prior render object %s", key, exc_info=True)
    for job in jobs:
        res = job.result if isinstance(job.result, dict) else {}
        if not res.get("video_path") and not res.get("video_url"):
            continue
        new_res = {k: v for k, v in res.items() if k not in ("video_path", "video_url")}
        job.result = new_res if new_res else None


async def _requeue_failed_video_render(
    job: Job,
    project: Project,
    db: AsyncSession,
) -> JobOut:
    """Reset a failed video_render job row, mark project generating, and enqueue the same job again."""
    from backend.core import redis_queue

    project.status = "generating"
    job.status = "queued"
    job.progress = 0
    job.error = None
    job.completed_at = None
    job.result = None
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)

    stored = await redis_queue.get_job_params(job.id)
    if stored:
        redis_params = {**stored, "job_id": job.id, "project_id": project.id}
    else:
        redis_params = {
            "project_id": project.id,
            "job_id": job.id,
            "scenes": None,
            "settings": None,
            "prepare_only": False,
            "storyboard_only": False,
            "pipeline_mode": "manual",
            "target_stage": "compile",
        }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return _job_to_out(job)


@router.post("/video", response_model=JobOut)
async def generate_video(req: GenerateVideoRequest, db: AsyncSession = Depends(get_db)):
    pipeline_mode, target_stage = _resolve_pipeline_intent(req)
    _settings_dump = _resolve_generation_settings(req)
    project = Project(
        title=req.title or "AI Video",
        story_type=req.story_type,
        script=req.custom_script or (("\n\n".join(s.narration for s in req.scenes)) if req.scenes else None),
        status="generating",
        control_mode=req.control_mode,
        settings=None,
    )
    db.add(project)
    await db.flush()
    apply_project_settings_snapshot(project, _settings_dump, get_settings())

    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    scenes_payload = None
    if req.scenes:
        scenes_payload = [
            {
                "narration": s.narration,
                "subtitle": s.subtitle or s.narration,
                "image_prompt": s.image_prompt,
                "transition": s.transition,
                "duration": s.duration,
            }
            for s in req.scenes
        ]
    redis_params = {
        "project_id": project.id,
        "job_id": job.id,
        "scenes": scenes_payload,
        "settings": _settings_dump,
        "prepare_only": target_stage == "assets",
        "storyboard_only": target_stage == "storyboard",
        "pipeline_mode": pipeline_mode,
        "target_stage": target_stage,
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/video-with-characters", response_model=JobOut)
async def generate_dialogue_video(
    req: DialogueVideoRequest,
    db: AsyncSession = Depends(get_db),
):
    pipeline_mode, target_stage = _resolve_pipeline_intent(req)
    scenes_payload = _build_dialogue_scene_payloads(req)
    style_settings = _dialogue_style_settings(req.dialogue_style_preset)
    resolved_image_style = req.image_style or style_settings["image_style"]
    resolved_transition = req.transition or style_settings["transition"]
    _settings_dump = _resolve_generation_settings(req)
    _settings_dump.update(
        {
            "generation_mode": "dialogue",
            "characters": [character.model_dump() for character in req.characters],
            "character_consistency_enabled": req.character_consistency_enabled,
            "dialogue_style_preset": req.dialogue_style_preset,
            "default_shot_type": req.default_shot_type,
            "pause_between_speakers_ms": req.pause_between_speakers_ms,
            "reaction_shot_duration": req.reaction_shot_duration,
            "speaker_labels_in_subtitles": req.speaker_labels_in_subtitles,
            "image_style": resolved_image_style,
            "transition": resolved_transition,
            "inter_scene_pause_ms": req.pause_between_speakers_ms,
            # Dialogue reads cleaner when speaker turns never overlap caption timing.
            "transition_overlap_ms": 0,
        }
    )

    project = Project(
        title=req.title or "Dialogue Video",
        story_type=req.story_type,
        script=req.custom_script,
        status="generating",
        control_mode=req.control_mode,
        settings=None,
    )
    db.add(project)
    await db.flush()
    apply_project_settings_snapshot(project, _settings_dump, get_settings())

    for order_index, scene in enumerate(scenes_payload):
        db.add(
            Scene(
                project_id=project.id,
                order_index=order_index,
                narration=scene["narration"],
                subtitle=scene["subtitle"],
                image_prompt=scene["image_prompt"],
                transition_type=scene["transition"],
                duration=float(scene["duration"] or req.scene_duration),
                scene_type=scene["scene_type"],
                scene_settings=scene["scene_settings"],
                is_manually_edited=False,
            )
        )

    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "project_id": project.id,
        "job_id": job.id,
        "scenes": None,
        "settings": _settings_dump,
        "prepare_only": target_stage == "assets",
        "storyboard_only": target_stage == "storyboard",
        "pipeline_mode": pipeline_mode,
        "target_stage": target_stage,
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/batch", response_model=list[JobOut])
async def batch_generate(req: BatchGenerateRequest, db: AsyncSession = Depends(get_db)):
    jobs = []
    for i in range(req.count):
        settings = req.base_settings.model_copy()
        settings.title = f"{settings.title} #{i + 1}"
        job_out = await generate_video(settings, db)
        jobs.append(job_out)
    return jobs


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    status: str | None = None,
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Job).order_by(Job.created_at.desc()).offset(skip).limit(limit)
    if status:
        query = query.where(Job.status == status)
    if project_id:
        query = query.where(Job.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


class IncrementalRenderRequest(BaseModel):
    project_id: str
    scene_ids: list[str]


class CompileRequest(BaseModel):
    project_id: str


class AssetsStageRequest(BaseModel):
    project_id: str


@router.post("/incremental-render", response_model=JobOut)
async def incremental_render_video(req: IncrementalRenderRequest, db: AsyncSession = Depends(get_db)):
    """Re-render only listed scenes and rebuild the final video; other scenes reuse existing clips/audio."""
    if not req.scene_ids:
        raise HTTPException(400, "Choose at least one scene to re-render.")
    result = await db.execute(select(Project).where(Project.id == req.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status not in ("ready_for_edit", "completed"):
        raise HTTPException(
            400,
            f"This action is only available when the project is ready to review or already done (current: {project.status}).",
        )

    project.status = "generating"
    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "project_id": project.id,
        "job_id": job.id,
        "scenes": None,
        "settings": None,
        "prepare_only": False,
        "storyboard_only": False,
        "pipeline_mode": "manual",
        "target_stage": "compile",
        "incremental_scene_ids": req.scene_ids,
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/compile", response_model=JobOut)
async def compile_video(req: CompileRequest, db: AsyncSession = Depends(get_db)):
    """Compile from ready_for_edit, or recompile from completed (prior final file removed)."""
    result = await db.execute(
        select(Project).where(Project.id == req.project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status == "generating":
        active_jobs_result = await db.execute(
            select(Job).where(
                Job.project_id == project.id,
                Job.status.in_(["queued", "in_progress"]),
            )
        )
        active_jobs = active_jobs_result.scalars().all()
        if not active_jobs:
            # Recover from stale generating status when all work already finished.
            project.status = "ready_for_compile"
            await db.commit()
            await db.refresh(project)
    if project.status not in ("ready_for_edit", "ready_for_compile", "completed"):
        raise HTTPException(
            400,
            "Export is only available when the project is ready to review, ready to export, or already has a finished video "
            f"(current: {project.status}).",
        )

    if project.status == "completed":
        await _delete_final_videos_for_recompile(project.id, db)

    project.status = "generating"
    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "project_id": project.id,
        "job_id": job.id,
        "scenes": None,
        "settings": None,
        "prepare_only": False,
        "storyboard_only": False,
        "pipeline_mode": "manual",
        "target_stage": "compile",
        # Re-encode each scene clip from the still image + current timing (required when
        # match_scenes_to_audio or other duration settings change; avoids reusing stale clips).
        "force_regenerate_scene_clips": True,
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/assets", response_model=JobOut)
async def prepare_assets(req: AssetsStageRequest, db: AsyncSession = Depends(get_db)):
    """Generate scene-level image/audio assets only; does not compile final video."""
    result = await db.execute(select(Project).where(Project.id == req.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status not in ("ready_for_edit", "ready_for_compile", "failed", "completed", "generating"):
        raise HTTPException(
            400,
            f"You can't create assets for this project right now (current status: {project.status}).",
        )

    project.status = "generating"
    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "project_id": project.id,
        "job_id": job.id,
        "scenes": None,
        "settings": None,
        "prepare_only": True,
        "storyboard_only": False,
        "pipeline_mode": "manual",
        "target_stage": "assets",
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/retry/{project_id}", response_model=JobOut)
async def retry_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Retry a failed project, resuming from the last completed stage."""
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "failed":
        raise HTTPException(
            400,
            f"This project cannot be retried right now (status: {project.status}). Only failed projects can be retried.",
        )

    rj = await db.execute(
        select(Job)
        .where(
            Job.project_id == project_id,
            Job.type == "video_render",
            Job.status == "failed",
        )
        .order_by(Job.created_at.desc())
        .limit(1)
    )
    existing = rj.scalar_one_or_none()
    if existing:
        return await _requeue_failed_video_render(existing, project, db)

    job = Job(
        project_id=project.id,
        type="video_render",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await _requeue_failed_video_render(job, project, db)


@router.post("/jobs/{job_id}/retry", response_model=JobOut)
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Retry a failed job. Reuses the same job row; re-enqueues with stored Redis params or video_render defaults."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "failed":
        raise HTTPException(400, f"Job is not failed (status: {job.status}). Only failed jobs can be retried.")

    if job.type == "video_render" and job.project_id:
        result_p = await db.execute(select(Project).where(Project.id == job.project_id))
        project = result_p.scalar_one_or_none()
        if not project:
            raise HTTPException(404, "Project not found")
        if project.status != "failed":
            raise HTTPException(
                400,
                f"This project cannot be retried right now (status: {project.status}). Only failed projects can be retried.",
            )
        return await _requeue_failed_video_render(job, project, db)

    # Other job types (e.g. asset_generate): re-dispatch using params stored in Redis
    from backend.core import redis_queue

    params = await redis_queue.get_job_params(job_id)
    if not params:
        raise HTTPException(
            400,
            "Retry is no longer available for this task. Please start a new generation.",
        )

    job_type = job.type
    # Reuse the same job: reset status, clear error, re-enqueue
    job.status = "queued"
    job.progress = 0
    job.error = None
    job.completed_at = None
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)

    redis_params = {**params, "job_id": job.id}

    async def _dispatch_registered_handler():
        from backend.core.job_registry import get_handler
        handler = get_handler(job_type)
        if handler:
            return await handler(redis_params)
        raise ValueError(f"No handler for {job_type}")

    await task_manager.submit_to_redis(
        job.id, job_type, redis_params, fallback_coro=_dispatch_registered_handler,
    )
    return _job_to_out(job)


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_failed_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a failed job. For video_render jobs with a project, deletes the project (cascade: scenes, assets, all jobs)."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "failed":
        raise HTTPException(400, f"Only failed tasks can be deleted (current status: {job.status}).")

    await task_manager.cancel_redis_job(job_id)

    if job.type == "video_render" and job.project_id:
        rp = await db.execute(select(Project).where(Project.id == job.project_id))
        project = rp.scalar_one_or_none()
        if project:
            await db.delete(project)
        else:
            await db.delete(job)
    else:
        await db.delete(job)

    await db.commit()


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, db: AsyncSession = Depends(get_db)):
    cancelled = task_manager.cancel(job_id)

    if not cancelled:
        cancelled = await task_manager.cancel_redis_job(job_id)

    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job and job.status in ("queued", "in_progress"):
        job.status = "cancelled"
        job.completed_at = datetime.now(timezone.utc)
        if job.project_id:
            r2 = await db.execute(select(Project).where(Project.id == job.project_id))
            proj = r2.scalar_one_or_none()
            if proj and proj.status == "generating":
                proj.status = "failed"
        await db.commit()
        cancelled = True
    return {"cancelled": cancelled}


@router.post("/cancel-project/{project_id}")
async def cancel_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel all active jobs for a project and reset its status."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    jobs_result = await db.execute(
        select(Job).where(
            Job.project_id == project_id,
            Job.status.in_(["queued", "in_progress"]),
        )
    )
    active_jobs = jobs_result.scalars().all()
    now = datetime.now(timezone.utc)
    for j in active_jobs:
        task_manager.cancel(j.id)
        await task_manager.cancel_redis_job(j.id)
        j.status = "cancelled"
        j.completed_at = now

    if project.status == "generating":
        project.status = "failed"

    await db.commit()
    return {"cancelled": len(active_jobs)}


EXPORT_PRESETS = {
    "youtube_landscape": {"width": 1920, "height": 1080, "label": "YouTube (1920x1080)"},
    "youtube_short": {"width": 1080, "height": 1920, "label": "YouTube Short (1080x1920)"},
    "tiktok": {"width": 1080, "height": 1920, "label": "TikTok (1080x1920)"},
    "instagram_reel": {"width": 1080, "height": 1920, "label": "Instagram Reel (1080x1920)"},
    "instagram_square": {"width": 1080, "height": 1080, "label": "Instagram Square (1080x1080)"},
    "twitter": {"width": 1280, "height": 720, "label": "Twitter/X (1280x720)"},
    "hd_720p": {"width": 1280, "height": 720, "label": "720p HD"},
    "fhd_1080p": {"width": 1920, "height": 1080, "label": "1080p Full HD"},
    "4k": {"width": 3840, "height": 2160, "label": "4K UHD"},
}

QUALITY_PRESETS = {
    "low": {"crf": 28, "preset": "faster", "label": "Low (smaller file)"},
    "medium": {"crf": 23, "preset": "medium", "label": "Medium (balanced)"},
    "high": {"crf": 18, "preset": "slow", "label": "High (best quality)"},
}


@router.get("/export-presets")
async def list_export_presets():
    return {
        "resolutions": [{"id": k, **v} for k, v in EXPORT_PRESETS.items()],
        "quality": [{"id": k, **v} for k, v in QUALITY_PRESETS.items()],
    }


class ExportRequest(BaseModel):
    job_id: str
    resolution: str = "youtube_landscape"
    quality: str = "medium"


def _run_ffmpeg_export(input_path: str, output_path: str, width: int, height: int, crf: int, preset: str) -> int:
    import subprocess
    from backend.core.ffmpeg import find_ffmpeg
    ffmpeg = find_ffmpeg()
    cmd = [
        ffmpeg, "-y", "-hide_banner",
        "-i", input_path,
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        "-c:v", "libx264", "-crf", str(crf), "-preset", preset,
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode


@router.post("/export")
async def export_video(req: ExportRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == req.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "completed" or not job.result or not job.result.get("video_path"):
        raise HTTPException(400, "This task has no finished video to export.")

    res_preset = EXPORT_PRESETS.get(req.resolution)
    if not res_preset:
        raise HTTPException(400, f"Unknown resolution preset: {req.resolution}")
    qual_preset = QUALITY_PRESETS.get(req.quality)
    if not qual_preset:
        raise HTTPException(400, f"Unknown quality preset: {req.quality}")

    input_key = job.result["video_path"]
    storage = get_storage()
    settings = get_settings()
    local_input = local_path_for(input_key)
    if not local_input:
        temp_dir = Path(settings.temp_dir) / "exports"
        temp_dir.mkdir(parents=True, exist_ok=True)
        local_input = str(temp_dir / Path(input_key).name)
        await storage.download_to_path(input_key, local_input)
    if not Path(local_input).exists():
        raise HTTPException(400, "The source video file could not be found.")
    output_name = f"export_{uuid.uuid4().hex[:8]}_{req.resolution}_{req.quality}.mp4"
    local_output = str((Path(settings.temp_dir) / "exports" / output_name))

    returncode = await asyncio.to_thread(
        _run_ffmpeg_export, local_input, local_output,
        res_preset["width"], res_preset["height"],
        qual_preset["crf"], qual_preset["preset"],
    )
    if returncode != 0:
        raise HTTPException(500, "Video export failed. Please try again.")
    export_key = build_key("videos", f"exports/{output_name}")
    await storage.save_file(export_key, local_output, guess_content_type(output_name))

    return {
        "path": export_key,
        "url": await storage.get_url(export_key),
        "resolution": f"{res_preset['width']}x{res_preset['height']}",
        "quality": req.quality,
    }
