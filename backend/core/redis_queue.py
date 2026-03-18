"""
Redis-backed job queue with reliable processing.

Uses the BRPOPLPUSH pattern for at-least-once delivery:
  - Jobs are pushed to `azanx:jobs` (pending list)
  - Workers atomically pop from pending → `azanx:jobs:processing`
  - On completion/failure, the job is removed from the processing list

Progress events are broadcast via Redis Pub/Sub on `azanx:progress` so
all connected API servers can forward them to WebSocket clients.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from backend.core.redis_client import get_redis, is_redis_available

logger = logging.getLogger(__name__)


async def enqueue_job(
    job_id: str,
    job_type: str,
    params: dict[str, Any],
    priority: int = 0,
) -> bool:
    """Push a job onto the Redis queue. Returns False if Redis unavailable."""
    if not is_redis_available():
        return False

    client = get_redis()
    if client is None:
        return False

    from backend.config import get_settings
    settings = get_settings()

    payload = json.dumps({
        "job_id": job_id,
        "job_type": job_type,
        "params": params,
        "priority": priority,
        "enqueued_at": time.time(),
    })

    try:
        if priority > 0:
            await client.rpush(settings.redis_queue_name, payload)
        else:
            await client.lpush(settings.redis_queue_name, payload)

        await client.hset(f"azanx:job:{job_id}", mapping={
            "status": "queued",
            "job_type": job_type,
            "enqueued_at": str(time.time()),
            "params": json.dumps(params),
        })
        await client.expire(f"azanx:job:{job_id}", settings.redis_job_ttl)

        logger.debug("Enqueued job %s (%s) to Redis", job_id, job_type)
        return True
    except Exception as exc:
        logger.error("Failed to enqueue job %s: %s", job_id, exc)
        return False


async def dequeue_job(timeout: int = 5) -> dict[str, Any] | None:
    """Blocking pop from the queue with reliable processing guarantee."""
    if not is_redis_available():
        return None

    client = get_redis()
    if client is None:
        return None

    from backend.config import get_settings
    settings = get_settings()
    queue = settings.redis_queue_name
    processing = f"{queue}:processing"

    try:
        result = await client.brpoplpush(queue, processing, timeout=timeout)
        if result is None:
            return None

        payload = json.loads(result)

        await client.hset(f"azanx:job:{payload['job_id']}", mapping={
            "status": "in_progress",
            "started_at": str(time.time()),
            "worker_id": _worker_id(),
        })

        return payload
    except Exception as exc:
        logger.error("Failed to dequeue job: %s", exc)
        return None


async def ack_job(job_id: str, status: str = "completed", result: dict | None = None) -> None:
    """Acknowledge job completion – remove from processing list, update state."""
    if not is_redis_available():
        return

    client = get_redis()
    if client is None:
        return

    from backend.config import get_settings
    settings = get_settings()
    processing = f"{settings.redis_queue_name}:processing"

    try:
        members = await client.lrange(processing, 0, -1)
        for m in members:
            try:
                data = json.loads(m)
                if data.get("job_id") == job_id:
                    await client.lrem(processing, 1, m)
                    break
            except (json.JSONDecodeError, KeyError):
                continue

        update: dict[str, str] = {
            "status": status,
            "completed_at": str(time.time()),
        }
        if result:
            update["result"] = json.dumps(result)
        await client.hset(f"azanx:job:{job_id}", mapping=update)
        await client.expire(f"azanx:job:{job_id}", settings.redis_job_ttl)
    except Exception as exc:
        logger.error("Failed to ack job %s: %s", job_id, exc)


async def nack_job(job_id: str, error: str, retry: bool = False) -> None:
    """Mark job as failed. Optionally re-queue for retry."""
    if not is_redis_available():
        return

    client = get_redis()
    if client is None:
        return

    from backend.config import get_settings
    settings = get_settings()
    processing = f"{settings.redis_queue_name}:processing"

    try:
        members = await client.lrange(processing, 0, -1)
        for m in members:
            try:
                data = json.loads(m)
                if data.get("job_id") == job_id:
                    await client.lrem(processing, 1, m)
                    if retry:
                        retries = int(data.get("retries", 0)) + 1
                        if retries <= 3:
                            data["retries"] = retries
                            await client.lpush(settings.redis_queue_name, json.dumps(data))
                            logger.info("Re-queued job %s (retry %d/3)", job_id, retries)
                    break
            except (json.JSONDecodeError, KeyError):
                continue

        await client.hset(f"azanx:job:{job_id}", mapping={
            "status": "failed" if not retry else "retrying",
            "error": error,
            "failed_at": str(time.time()),
        })
    except Exception as exc:
        logger.error("Failed to nack job %s: %s", job_id, exc)


async def publish_progress(
    job_id: str,
    job_type: str,
    progress: int,
    status: str,
    detail: str = "",
) -> None:
    """Publish a progress event via Redis Pub/Sub."""
    if not is_redis_available():
        return

    client = get_redis()
    if client is None:
        return

    from backend.config import get_settings
    settings = get_settings()

    try:
        await client.publish(
            settings.redis_progress_channel,
            json.dumps({
                "type": "progress",
                "job_id": job_id,
                "job_type": job_type,
                "progress": progress,
                "status": status,
                "detail": detail,
            }),
        )
    except Exception:
        pass


async def publish_event(event_type: str, job_id: str, job_type: str, data: dict | None = None) -> None:
    """Publish a completion/error event via Redis Pub/Sub."""
    if not is_redis_available():
        return

    client = get_redis()
    if client is None:
        return

    from backend.config import get_settings
    settings = get_settings()

    try:
        await client.publish(
            settings.redis_progress_channel,
            json.dumps({
                "type": event_type,
                "job_id": job_id,
                "job_type": job_type,
                **(data or {}),
            }),
        )
    except Exception:
        pass


async def get_job_params(job_id: str) -> dict[str, Any] | None:
    """Get stored params for a job (e.g. for retry). Returns None if not found or expired."""
    if not is_redis_available():
        return None

    client = get_redis()
    if client is None:
        return None

    try:
        raw = await client.hget(f"azanx:job:{job_id}", "params")
        if raw:
            return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        pass
    return None


async def get_queue_stats() -> dict[str, Any]:
    """Return queue depth, processing count, and dead letter count."""
    if not is_redis_available():
        return {"available": False}

    client = get_redis()
    if client is None:
        return {"available": False}

    from backend.config import get_settings
    settings = get_settings()

    try:
        pending = await client.llen(settings.redis_queue_name)
        processing = await client.llen(f"{settings.redis_queue_name}:processing")
        dead = await client.llen(f"{settings.redis_queue_name}:dead")
        return {
            "available": True,
            "pending": pending,
            "processing": processing,
            "dead_letter": dead,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}


async def recover_stale_jobs(max_age_seconds: int = 600) -> int:
    """Move stale jobs from processing back to pending.

    Jobs that have been in the processing list longer than max_age_seconds
    are considered abandoned (worker crashed) and get re-queued.
    """
    if not is_redis_available():
        return 0

    client = get_redis()
    if client is None:
        return 0

    from backend.config import get_settings
    settings = get_settings()
    processing = f"{settings.redis_queue_name}:processing"

    try:
        members = await client.lrange(processing, 0, -1)
        recovered = 0
        now = time.time()

        for m in members:
            try:
                data = json.loads(m)
                enqueued = float(data.get("enqueued_at", 0))
                if now - enqueued > max_age_seconds:
                    await client.lrem(processing, 1, m)
                    retries = int(data.get("retries", 0)) + 1
                    if retries <= 3:
                        data["retries"] = retries
                        await client.lpush(settings.redis_queue_name, json.dumps(data))
                        recovered += 1
                    else:
                        await client.lpush(f"{settings.redis_queue_name}:dead", m)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue

        if recovered:
            logger.info("Recovered %d stale jobs from processing queue", recovered)
        return recovered
    except Exception as exc:
        logger.error("Failed to recover stale jobs: %s", exc)
        return 0


def _worker_id() -> str:
    import os
    import platform
    return f"{os.getpid()}@{platform.node()}"
