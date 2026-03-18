"""
Bridge Redis Pub/Sub messages to local WebSocket clients.

When running multiple API server instances behind a load balancer,
each instance subscribes to the Redis progress channel and forwards
events to its local WebSocket connections. This ensures all connected
clients receive real-time updates regardless of which instance
processed the job.
"""
from __future__ import annotations

import asyncio
import json
import logging

from backend.core.redis_client import get_redis, is_redis_available
from backend.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

_bridge_task: asyncio.Task | None = None


async def start_pubsub_bridge() -> None:
    """Start listening to Redis Pub/Sub and forwarding to WebSocket."""
    global _bridge_task

    if not is_redis_available():
        return

    _bridge_task = asyncio.create_task(_listen_loop())
    logger.info("Redis Pub/Sub → WebSocket bridge started")


async def stop_pubsub_bridge() -> None:
    global _bridge_task
    if _bridge_task and not _bridge_task.done():
        _bridge_task.cancel()
        try:
            await _bridge_task
        except asyncio.CancelledError:
            pass
    _bridge_task = None
    logger.info("Redis Pub/Sub bridge stopped")


async def _listen_loop() -> None:
    from backend.config import get_settings
    settings = get_settings()

    while True:
        try:
            client = get_redis()
            if client is None:
                await asyncio.sleep(5)
                continue

            pubsub = client.pubsub()
            await pubsub.subscribe(settings.redis_progress_channel)
            logger.debug("Subscribed to %s", settings.redis_progress_channel)

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                try:
                    data = json.loads(message["data"])
                    event_type = data.get("type")

                    if event_type == "progress":
                        await ws_manager.send_progress(
                            data["job_id"],
                            data.get("job_type", ""),
                            data.get("progress", 0),
                            data.get("status", "in_progress"),
                            data.get("detail", ""),
                        )
                    elif event_type == "completed":
                        await ws_manager.send_completed(
                            data["job_id"],
                            data.get("job_type", ""),
                            data.get("result"),
                        )
                    elif event_type == "error":
                        await ws_manager.send_error(
                            data["job_id"],
                            data.get("job_type", ""),
                            data.get("error", "Unknown error"),
                        )
                except (json.JSONDecodeError, KeyError) as exc:
                    logger.debug("Malformed pub/sub message: %s", exc)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("Pub/Sub bridge error: %s – reconnecting in 3s", exc)
            await asyncio.sleep(3)
