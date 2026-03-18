"""
Unified task manager with Redis queue backend and in-memory fallback.

When Redis is available:
  - Jobs are serialized and enqueued to Redis
  - The background worker processes them with reliable delivery
  - Progress is broadcast via Redis Pub/Sub → WebSocket

When Redis is unavailable:
  - Falls back to in-memory asyncio tasks (original behavior)
  - Works identically but jobs are lost on server restart
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any, Callable, Coroutine

from backend.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)


class TaskManager:
    def __init__(self, max_concurrent: int | None = None):
        if max_concurrent is None:
            from backend.config import get_settings
            max_concurrent = get_settings().max_concurrent_jobs
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._tasks: dict[str, asyncio.Task] = {}

    async def submit(
        self,
        job_id: str,
        job_type: str,
        coro_fn: Callable[..., Coroutine[Any, Any, dict[str, Any]]],
        *args: Any,
        **kwargs: Any,
    ) -> str:
        """Submit a job. Uses Redis queue if available, else in-memory."""
        task = asyncio.create_task(self._run(job_id, job_type, coro_fn, *args, **kwargs))
        self._tasks[job_id] = task
        return job_id

    async def submit_to_redis(
        self,
        job_id: str,
        job_type: str,
        params: dict[str, Any],
        fallback_coro: Callable[..., Coroutine[Any, Any, dict[str, Any]]] | None = None,
    ) -> str:
        """Attempt to enqueue via Redis. Falls back to in-memory if unavailable.

        This is the preferred method for new code – it passes serializable
        params so the Redis worker can reconstruct the work.
        """
        from backend.core.redis_client import is_redis_available
        from backend.core import redis_queue

        if is_redis_available():
            enqueued = await redis_queue.enqueue_job(job_id, job_type, params)
            if enqueued:
                logger.info("Job %s (%s) enqueued to Redis", job_id, job_type)
                return job_id

        if fallback_coro is not None:
            logger.info("Redis unavailable – running job %s in-memory", job_id)
            return await self.submit(job_id, job_type, fallback_coro)

        logger.warning("Redis unavailable and no fallback for job %s", job_id)
        return job_id

    async def _run(
        self,
        job_id: str,
        job_type: str,
        coro_fn: Callable[..., Coroutine[Any, Any, dict[str, Any]]],
        *args: Any,
        **kwargs: Any,
    ) -> None:
        """In-memory execution path (fallback when Redis is unavailable)."""
        async with self._semaphore:
            try:
                await ws_manager.send_progress(job_id, job_type, 0, "in_progress", "Started")
                result = await coro_fn(*args, **kwargs)
                await ws_manager.send_completed(job_id, job_type, result)
            except Exception as exc:
                logger.error("Task %s failed: %s", job_id, traceback.format_exc())
                await ws_manager.send_error(job_id, job_type, str(exc))
            finally:
                self._tasks.pop(job_id, None)

    def cancel(self, job_id: str) -> bool:
        """Cancel an in-memory task. Redis jobs are cancelled via the queue."""
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    async def cancel_redis_job(self, job_id: str) -> bool:
        """Cancel a Redis-queued job by removing it from the queue."""
        from backend.core.redis_client import is_redis_available, get_redis
        if not is_redis_available():
            return False

        client = get_redis()
        if client is None:
            return False

        from backend.config import get_settings
        import json
        settings = get_settings()

        try:
            for queue_name in [settings.redis_queue_name, f"{settings.redis_queue_name}:processing"]:
                members = await client.lrange(queue_name, 0, -1)
                for m in members:
                    try:
                        data = json.loads(m)
                        if data.get("job_id") == job_id:
                            await client.lrem(queue_name, 1, m)
                            return True
                    except (json.JSONDecodeError, KeyError):
                        continue
        except Exception as exc:
            logger.error("Failed to cancel Redis job %s: %s", job_id, exc)
        return False

    async def shutdown(self) -> None:
        """Cancel all in-memory tasks and stop the Redis worker."""
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

        from backend.core.worker import stop_worker
        await stop_worker()

    @property
    def active_count(self) -> int:
        return len([t for t in self._tasks.values() if not t.done()])


task_manager = TaskManager()
