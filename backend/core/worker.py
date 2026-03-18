"""
Background worker that processes jobs from the Redis queue.

Runs as an asyncio task inside the FastAPI process. When Redis is
enabled, the worker loop continuously dequeues jobs and dispatches
them to registered handlers. Multiple concurrent jobs are limited
by the configurable semaphore.

If Redis is not available, this module is a no-op – the in-memory
TaskManager handles everything instead.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any

from backend.core.redis_client import is_redis_available
from backend.core import redis_queue
from backend.core.job_registry import get_handler
from backend.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

_worker_task: asyncio.Task | None = None
_shutdown_event: asyncio.Event | None = None


async def start_worker() -> None:
    """Start the background worker loop if Redis is available."""
    global _worker_task, _shutdown_event

    if not is_redis_available():
        logger.info("Redis not available – worker not started (using in-memory mode)")
        return

    _shutdown_event = asyncio.Event()

    # Import registry to ensure all handlers are registered
    import backend.core.job_registry  # noqa: F401

    _worker_task = asyncio.create_task(_worker_loop())
    logger.info("Redis worker started")

    # Also start stale job recovery
    asyncio.create_task(_stale_job_recovery_loop())


async def stop_worker() -> None:
    """Signal the worker to stop and wait for it to finish."""
    global _worker_task, _shutdown_event

    if _shutdown_event:
        _shutdown_event.set()

    if _worker_task and not _worker_task.done():
        try:
            await asyncio.wait_for(_worker_task, timeout=10)
        except asyncio.TimeoutError:
            _worker_task.cancel()
            try:
                await _worker_task
            except asyncio.CancelledError:
                pass

    _worker_task = None
    _shutdown_event = None
    logger.info("Redis worker stopped")


async def _worker_loop() -> None:
    """Main loop: dequeue jobs and dispatch to handlers concurrently."""
    from backend.config import get_settings
    settings = get_settings()

    semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)

    while not (_shutdown_event and _shutdown_event.is_set()):
        try:
            payload = await redis_queue.dequeue_job(timeout=2)
            if payload is None:
                continue

            job_id = payload["job_id"]
            job_type = payload["job_type"]
            params = payload.get("params", {})

            handler = get_handler(job_type)
            if handler is None:
                logger.error("No handler for job type '%s' (job %s)", job_type, job_id)
                await redis_queue.nack_job(job_id, f"Unknown job type: {job_type}")
                await ws_manager.send_error(job_id, job_type, f"Unknown job type: {job_type}")
                continue

            asyncio.create_task(_process_job(semaphore, job_id, job_type, params, handler))

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Worker loop error: %s", exc)
            await asyncio.sleep(1)


async def _process_job(
    semaphore: asyncio.Semaphore,
    job_id: str,
    job_type: str,
    params: dict[str, Any],
    handler: Any,
) -> None:
    """Process a single job with concurrency control."""
    async with semaphore:
        try:
            await _mark_job_started(job_id)
            await ws_manager.send_progress(job_id, job_type, 0, "in_progress", "Started")
            await redis_queue.publish_progress(job_id, job_type, 0, "in_progress", "Started")

            result = await handler(params)

            await redis_queue.ack_job(job_id, "completed", result)
            await redis_queue.publish_event("completed", job_id, job_type, {"result": result})
            await ws_manager.send_completed(job_id, job_type, result)

        except Exception as exc:
            error_msg = str(exc)
            logger.error("Job %s (%s) failed: %s", job_id, job_type, traceback.format_exc())

            await redis_queue.nack_job(job_id, error_msg)
            await redis_queue.publish_event("error", job_id, job_type, {"error": error_msg})
            await ws_manager.send_error(job_id, job_type, error_msg)


async def _stale_job_recovery_loop() -> None:
    """Periodically check for stale jobs in the processing list and re-queue them."""
    while not (_shutdown_event and _shutdown_event.is_set()):
        try:
            await asyncio.sleep(120)  # Check every 2 minutes
            recovered = await redis_queue.recover_stale_jobs(max_age_seconds=600)
            if recovered > 0:
                logger.info("Recovered %d stale jobs", recovered)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Stale job recovery error: %s", exc)


async def _mark_job_started(job_id: str) -> None:
    """Set job status to in_progress when a worker begins processing."""
    try:
        from datetime import datetime, timezone
        from sqlalchemy import select
        from backend.database import async_session
        from backend.models import Job

        async with async_session() as session:
            result = await session.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if job and job.status != "in_progress":
                job.status = "in_progress"
                job.started_at = job.started_at or datetime.now(timezone.utc)
                job.progress = max(job.progress or 0, 1)
                await session.commit()
    except Exception as exc:
        logger.debug("Failed to mark job %s as started: %s", job_id, exc)
