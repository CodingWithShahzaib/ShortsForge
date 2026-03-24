from __future__ import annotations

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
from pathlib import Path

import openai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.database import init_db


async def _cleanup_orphaned_jobs() -> None:
    """Mark any jobs left in queued/in_progress as failed on startup.

    When the server restarts (e.g. --reload), in-memory tasks are lost
    but DB rows still show them as active. This prevents permanent "stuck" state.
    """
    import logging
    from datetime import datetime, timezone
    from sqlalchemy import select, update
    from backend.database import async_session
    from backend.models import Job, Project

    logger = logging.getLogger(__name__)
    async with async_session() as session:
        result = await session.execute(
            select(Job).where(Job.status.in_(["queued", "in_progress"]))
        )
        orphaned = result.scalars().all()
        if not orphaned:
            return

        logger.warning("Found %d orphaned jobs on startup, marking as failed", len(orphaned))
        now = datetime.now(timezone.utc)
        project_ids = set()
        for j in orphaned:
            j.status = "failed"
            j.error = {"message": "Server restarted while job was running. Use Retry to re-run."}
            j.completed_at = now
            if j.project_id:
                project_ids.add(j.project_id)

        for pid in project_ids:
            r = await session.execute(select(Project).where(Project.id == pid))
            p = r.scalar_one_or_none()
            if p and p.status == "generating":
                p.status = "failed"

        await session.commit()
        logger.info("Cleaned up %d orphaned jobs", len(orphaned))


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.storage_is_s3:
        Path(settings.temp_dir).mkdir(parents=True, exist_ok=True)
    else:
        for d in (settings.images_dir, settings.audio_dir, settings.videos_dir, settings.temp_dir, settings.music_dir):
            Path(d).mkdir(parents=True, exist_ok=True)
    await init_db()
    await _cleanup_orphaned_jobs()

    # Initialize Redis (optional – degrades gracefully)
    from backend.core.redis_client import init_redis, close_redis
    redis_ok = await init_redis()

    # Start Redis worker + pub/sub bridge if Redis is available
    from backend.core.worker import start_worker, stop_worker
    from backend.core.pubsub_bridge import start_pubsub_bridge, stop_pubsub_bridge
    if redis_ok:
        await start_worker()
        await start_pubsub_bridge()

    from backend.core.task_manager import task_manager
    yield

    # Shutdown
    await task_manager.shutdown()
    if redis_ok:
        await stop_pubsub_bridge()
    await close_redis()


app = FastAPI(
    title="ShortsForge API",
    version="1.0.0",
    description="From script to reel in minutes. AI-powered faceless video generation platform.",
    lifespan=lifespan,
)


def _openai_status_detail(exc: openai.APIStatusError) -> str:
    body = exc.body
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
    return exc.message or str(exc)


def _openai_error_code(exc: openai.APIStatusError) -> str | None:
    body = exc.body
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("code"):
            return str(err["code"])
    return None


def _openai_http_status(exc: openai.APIStatusError) -> int:
    """OpenAI uses 429 for quota and for rate limits; map quota to 402 for clearer logs and clients."""
    if _openai_error_code(exc) == "insufficient_quota":
        return 402
    return exc.status_code


@app.exception_handler(openai.APIStatusError)
async def openai_api_status_handler(_request: Request, exc: openai.APIStatusError) -> JSONResponse:
    detail = _openai_status_detail(exc)
    err_code = _openai_error_code(exc)
    payload: dict[str, str] = {"detail": detail}
    if err_code:
        payload["code"] = err_code
    return JSONResponse(status_code=_openai_http_status(exc), content=payload)


@app.exception_handler(openai.APIConnectionError)
async def openai_connection_handler(_request: Request, exc: openai.APIConnectionError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": exc.message})


settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not settings.storage_is_s3:
    media_path = Path(settings.media_dir)
    if media_path.exists():
        app.mount("/media", StaticFiles(directory=str(media_path)), name="media")

from backend.api.projects import router as projects_router
from backend.api.generation import router as generation_router
from backend.api.sora import router as sora_router
from backend.api.images import router as images_router
from backend.api.audio import router as audio_router
from backend.api.scripts import router as scripts_router
from backend.api.settings import router as settings_router
from backend.api.templates import router as templates_router
from backend.api.websocket import router as ws_router
from backend.api.media import router as media_router

app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(generation_router, prefix="/api/generate", tags=["generation"])
app.include_router(sora_router, prefix="/api/sora", tags=["sora"])
app.include_router(images_router, prefix="/api/images", tags=["images"])
app.include_router(audio_router, prefix="/api/audio", tags=["audio"])
app.include_router(scripts_router, prefix="/api/scripts", tags=["scripts"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(templates_router, prefix="/api/templates", tags=["templates"])
app.include_router(ws_router, prefix="/ws", tags=["websocket"])
app.include_router(media_router, prefix="/api/media", tags=["media"])


@app.get("/api/health")
async def health_check():
    from backend.core.redis_client import redis_health
    return {
        "status": "ok",
        "version": "1.0.0",
        "redis": await redis_health(),
    }
