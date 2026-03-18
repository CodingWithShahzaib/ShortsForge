"""
Redis client singleton with connection pooling and graceful fallback.

When REDIS_URL is set, provides a shared async Redis connection pool.
When Redis is unavailable, all operations degrade gracefully so the
application continues to work using the in-memory task manager.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

_redis_pool: Any | None = None
_redis_available: bool = False


async def init_redis() -> bool:
    """Initialize the Redis connection pool. Returns True if connected."""
    global _redis_pool, _redis_available

    from backend.config import get_settings
    settings = get_settings()

    if not settings.redis_enabled:
        logger.info("Redis not configured (REDIS_URL empty) – using in-memory queue")
        _redis_available = False
        return False

    try:
        import redis.asyncio as aioredis

        _redis_pool = aioredis.ConnectionPool.from_url(
            settings.redis_url,
            max_connections=settings.redis_max_connections,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
            retry_on_timeout=True,
        )
        client = aioredis.Redis(connection_pool=_redis_pool)
        await client.ping()
        _redis_available = True
        info = await client.info("server")
        logger.info(
            "Redis connected: %s v%s",
            settings.redis_url.split("@")[-1] if "@" in settings.redis_url else settings.redis_url,
            info.get("redis_version", "?"),
        )
        return True
    except ImportError:
        logger.warning("redis package not installed – using in-memory queue")
        _redis_available = False
        return False
    except Exception as exc:
        logger.warning("Redis connection failed (%s) – falling back to in-memory queue", exc)
        _redis_available = False
        return False


async def close_redis() -> None:
    """Gracefully close the Redis connection pool."""
    global _redis_pool, _redis_available
    if _redis_pool is not None:
        try:
            await _redis_pool.disconnect()
        except Exception:
            pass
        _redis_pool = None
    _redis_available = False
    logger.info("Redis connection pool closed")


def get_redis():
    """Get a Redis client from the pool. Returns None if Redis is not available."""
    if not _redis_available or _redis_pool is None:
        return None
    try:
        import redis.asyncio as aioredis
        return aioredis.Redis(connection_pool=_redis_pool)
    except Exception:
        return None


def is_redis_available() -> bool:
    return _redis_available


async def redis_health() -> dict[str, Any]:
    """Health check: returns Redis status, version, memory, and queue depth."""
    if not _redis_available:
        return {"status": "disconnected", "enabled": False}

    client = get_redis()
    if client is None:
        return {"status": "disconnected", "enabled": True}

    try:
        from backend.config import get_settings
        settings = get_settings()

        await client.ping()
        info = await client.info("server", "memory", "clients")
        queue_len = await client.llen(settings.redis_queue_name)
        processing_len = await client.llen(f"{settings.redis_queue_name}:processing")

        return {
            "status": "connected",
            "enabled": True,
            "version": info.get("redis_version", "unknown"),
            "used_memory_human": info.get("used_memory_human", "?"),
            "connected_clients": info.get("connected_clients", 0),
            "queue_depth": queue_len,
            "processing": processing_len,
            "uptime_seconds": info.get("uptime_in_seconds", 0),
        }
    except Exception as exc:
        return {"status": "error", "enabled": True, "error": str(exc)}
