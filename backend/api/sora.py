from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Job, SoraCharacter
from pydantic import BaseModel
from backend.schemas import (
    SoraGenerateRequest, SoraEditRequest, SoraExtendRequest,
    SoraRemixRequest, SoraCharacterCreateRequest,
    SoraVideoOut, SoraCharacterOut, JobOut,
)
from backend.core.task_manager import task_manager
from backend.services import sora_service

router = APIRouter()


async def _update_job_failed(job_id: str, error_msg: str) -> None:
    from backend.database import async_session
    async with async_session() as session:
        r = await session.execute(select(Job).where(Job.id == job_id))
        j = r.scalar_one_or_none()
        if j:
            j.status = "failed"
            j.error = {"message": error_msg}
            j.completed_at = datetime.now(timezone.utc)
            await session.commit()


async def _update_job_completed(job_id: str, result: dict) -> None:
    from backend.database import async_session
    async with async_session() as session:
        r = await session.execute(select(Job).where(Job.id == job_id))
        j = r.scalar_one()
        j.status = "completed"
        j.progress = 100
        j.result = result
        j.completed_at = datetime.now(timezone.utc)
        await session.commit()


@router.post("/generate", response_model=JobOut)
async def generate_sora_video(req: SoraGenerateRequest, db: AsyncSession = Depends(get_db)):
    job = Job(type="sora_generate", status="queued", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "job_id": job.id,
        "prompt": req.prompt,
        "model": req.model,
        "size": req.size,
        "seconds": req.seconds,
        "input_image_url": req.input_image_url,
        "input_image_file_id": req.input_image_file_id,
        "remix_id": req.remix_id,
    }

    async def _do():
        try:
            video = await sora_service.create_video(
                prompt=req.prompt, model=req.model, size=req.size, seconds=req.seconds,
                input_image_url=req.input_image_url,
                input_image_file_id=req.input_image_file_id,
                remix_id=req.remix_id,
            )
            result = await sora_service.poll_and_download(video["id"], job_id=job.id)
            await _update_job_completed(job.id, result)
            return result
        except Exception as exc:
            await _update_job_failed(job.id, str(exc))
            raise

    await task_manager.submit_to_redis(
        job.id, "sora_generate", redis_params, fallback_coro=_do,
    )
    return job


@router.post("/edit", response_model=JobOut)
async def edit_sora_video(req: SoraEditRequest, db: AsyncSession = Depends(get_db)):
    job = Job(type="sora_edit", status="queued", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "job_id": job.id,
        "video_id": req.video_id,
        "prompt": req.prompt,
        "model": req.model,
    }

    async def _do():
        try:
            video = await sora_service.edit_video(req.video_id, req.prompt, req.model)
            result = await sora_service.poll_and_download(video["id"], job_id=job.id)
            await _update_job_completed(job.id, result)
            return result
        except Exception as exc:
            await _update_job_failed(job.id, str(exc))
            raise

    await task_manager.submit_to_redis(
        job.id, "sora_edit", redis_params, fallback_coro=_do,
    )
    return job


@router.post("/extend", response_model=JobOut)
async def extend_sora_video(req: SoraExtendRequest, db: AsyncSession = Depends(get_db)):
    job = Job(type="sora_extend", status="queued", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "job_id": job.id,
        "video_id": req.video_id,
        "prompt": req.prompt,
        "model": req.model,
        "seconds": req.seconds,
    }

    async def _do():
        try:
            video = await sora_service.extend_video(req.video_id, req.prompt, req.model, req.seconds)
            result = await sora_service.poll_and_download(video["id"], job_id=job.id)
            await _update_job_completed(job.id, result)
            return result
        except Exception as exc:
            await _update_job_failed(job.id, str(exc))
            raise

    await task_manager.submit_to_redis(
        job.id, "sora_extend", redis_params, fallback_coro=_do,
    )
    return job


@router.post("/{video_id}/remix", response_model=JobOut)
async def remix_sora_video(
    video_id: str, req: SoraRemixRequest, db: AsyncSession = Depends(get_db),
):
    job = Job(type="sora_remix", status="queued", started_at=datetime.now(timezone.utc))
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "job_id": job.id,
        "video_id": video_id,
        "prompt": req.prompt,
        "model": req.model,
        "size": req.size,
        "seconds": req.seconds,
    }

    async def _do():
        try:
            video = await sora_service.remix_video(video_id, req.prompt, req.model, req.size, req.seconds)
            result = await sora_service.poll_and_download(video["id"], job_id=job.id)
            await _update_job_completed(job.id, result)
            return result
        except Exception as exc:
            await _update_job_failed(job.id, str(exc))
            raise

    await task_manager.submit_to_redis(
        job.id, "sora_remix", redis_params, fallback_coro=_do,
    )
    return job


class SoraBatchItem(BaseModel):
    prompt: str
    model: str = "sora-2"
    size: str = "1280x720"
    seconds: str = "8"
    input_image_url: str | None = None
    remix_id: str | None = None


class SoraBatchRequest(BaseModel):
    items: list[SoraBatchItem]


@router.post("/batch", response_model=list[JobOut])
async def batch_generate_sora(req: SoraBatchRequest, db: AsyncSession = Depends(get_db)):
    """Queue multiple Sora video generation jobs at once."""
    if not req.items:
        raise HTTPException(400, "At least one item required")
    if len(req.items) > 20:
        raise HTTPException(400, "Maximum 20 items per batch")

    created_jobs = []
    for item in req.items:
        job = Job(type="sora_generate", status="queued", started_at=datetime.now(timezone.utc))
        db.add(job)
        await db.flush()
        await db.refresh(job)

        redis_params = {
            "job_id": job.id,
            "prompt": item.prompt,
            "model": item.model,
            "size": item.size,
            "seconds": item.seconds,
            "input_image_url": item.input_image_url,
            "remix_id": item.remix_id,
        }

        async def _make_do(itm=item, jid=job.id):
            async def _do():
                try:
                    video = await sora_service.create_video(
                        prompt=itm.prompt, model=itm.model, size=itm.size,
                        seconds=itm.seconds,
                        input_image_url=itm.input_image_url,
                        remix_id=itm.remix_id,
                    )
                    result = await sora_service.poll_and_download(video["id"], job_id=jid)
                    await _update_job_completed(jid, result)
                    return result
                except Exception as exc:
                    await _update_job_failed(jid, str(exc))
                    raise
            return _do

        do_fn = await _make_do()
        await task_manager.submit_to_redis(
            job.id, "sora_generate", redis_params, fallback_coro=do_fn,
        )
        created_jobs.append(job)

    await db.commit()
    return created_jobs


@router.get("/status/{video_id}")
async def get_sora_status(video_id: str):
    try:
        return await sora_service.get_video_status(video_id)
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/videos")
async def list_sora_videos(limit: int = 20):
    return await sora_service.list_videos(limit)


@router.delete("/videos/{video_id}", status_code=204)
async def delete_sora_video(video_id: str):
    await sora_service.delete_video(video_id)


@router.post("/characters", response_model=SoraCharacterOut)
async def create_sora_character(
    req: SoraCharacterCreateRequest, db: AsyncSession = Depends(get_db),
):
    result = await sora_service.create_character(req.video_id)
    char = SoraCharacter(
        character_id=result.get("id", ""),
        name=req.name,
        metadata_=result,
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return SoraCharacterOut(
        id=char.id, character_id=char.character_id,
        name=char.name, source_video_path=char.source_video_path,
        metadata_=char.metadata_,
    )


@router.get("/characters/{character_id}", response_model=SoraCharacterOut)
async def get_sora_character(character_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SoraCharacter).where(SoraCharacter.character_id == character_id)
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(404, "Character not found")
    return SoraCharacterOut(
        id=char.id, character_id=char.character_id,
        name=char.name, source_video_path=char.source_video_path,
        metadata_=char.metadata_,
    )


@router.get("/characters")
async def list_characters(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SoraCharacter).order_by(SoraCharacter.created_at.desc()))
    chars = result.scalars().all()
    return [
        SoraCharacterOut(
            id=c.id, character_id=c.character_id,
            name=c.name, source_video_path=c.source_video_path,
            metadata_=c.metadata_,
        )
        for c in chars
    ]
