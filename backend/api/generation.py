from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type, local_path_for
from backend.database import get_db
from backend.models import Project, Job
from backend.schemas import GenerateVideoRequest, BatchGenerateRequest, JobOut
from backend.core.task_manager import task_manager

router = APIRouter()


@router.post("/video", response_model=JobOut)
async def generate_video(req: GenerateVideoRequest, db: AsyncSession = Depends(get_db)):
    project = Project(
        title=req.title or "AI Video",
        story_type=req.story_type,
        script=req.custom_script or (("\n\n".join(s.narration for s in req.scenes)) if req.scenes else None),
        status="generating",
        settings=req.model_dump(exclude={"scenes"}),
    )
    db.add(project)
    await db.flush()

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
        "settings": req.model_dump(exclude={"scenes"}),
        "prepare_only": req.prepare_only,
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
    db: AsyncSession = Depends(get_db),
):
    query = select(Job).order_by(Job.created_at.desc()).offset(skip).limit(limit)
    if status:
        query = query.where(Job.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


class CompileRequest(BaseModel):
    project_id: str


@router.post("/compile", response_model=JobOut)
async def compile_video(req: CompileRequest, db: AsyncSession = Depends(get_db)):
    """Compile a project that has status ready_for_edit (post-production complete)."""
    result = await db.execute(
        select(Project).where(Project.id == req.project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != "ready_for_edit":
        raise HTTPException(
            400,
            f"Project must be in ready_for_edit status to compile (current: {project.status}).",
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
            f"Project is not failed (status: {project.status}). Only failed projects can be retried.",
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

    project_id_val = project.id
    job_id_val = job.id

    redis_params = {
        "project_id": project_id_val,
        "job_id": job_id_val,
        "scenes": None,
        "settings": None,
    }

    async def _do_render():
        from backend.core.job_registry import handle_video_render
        return await handle_video_render(redis_params)

    await task_manager.submit_to_redis(
        job.id, "video_render", redis_params, fallback_coro=_do_render,
    )
    return job


@router.post("/jobs/{job_id}/retry", response_model=JobOut)
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Retry a failed job. For video_render uses project retry; for Sora jobs re-enqueues with stored params."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "failed":
        raise HTTPException(400, f"Job is not failed (status: {job.status}). Only failed jobs can be retried.")

    if job.type == "video_render" and job.project_id:
        return await retry_project(job.project_id, db)

    # Sora jobs: get params from Redis and reuse the same job
    from backend.core import redis_queue

    params = await redis_queue.get_job_params(job_id)
    if not params:
        raise HTTPException(
            400,
            "Retry not available: job params have expired. Please create a new generation.",
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

    async def _do_sora():
        from backend.core.job_registry import get_handler
        handler = get_handler(job_type)
        if handler:
            return await handler(redis_params)
        raise ValueError(f"No handler for {job_type}")

    await task_manager.submit_to_redis(
        job.id, job_type, redis_params, fallback_coro=_do_sora,
    )
    return job


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
        raise HTTPException(400, "Job has no completed video to export")

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
        raise HTTPException(400, "Source video file not found")
    output_name = f"export_{uuid.uuid4().hex[:8]}_{req.resolution}_{req.quality}.mp4"
    local_output = str((Path(settings.temp_dir) / "exports" / output_name))

    returncode = await asyncio.to_thread(
        _run_ffmpeg_export, local_input, local_output,
        res_preset["width"], res_preset["height"],
        qual_preset["crf"], qual_preset["preset"],
    )
    if returncode != 0:
        raise HTTPException(500, "FFmpeg export failed")
    export_key = build_key("videos", f"exports/{output_name}")
    await storage.save_file(export_key, local_output, guess_content_type(output_name))

    return {
        "path": export_key,
        "url": await storage.get_url(export_key),
        "resolution": f"{res_preset['width']}x{res_preset['height']}",
        "quality": req.quality,
    }
