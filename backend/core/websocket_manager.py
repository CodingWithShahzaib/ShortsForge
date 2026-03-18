from __future__ import annotations
import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WebSocket connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info("WebSocket disconnected. Total: %d", len(self._connections))

    async def broadcast(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_progress(
        self, job_id: str, job_type: str, progress: int, status: str, detail: str = ""
    ) -> None:
        await self.broadcast({
            "type": "progress",
            "job_id": job_id,
            "job_type": job_type,
            "progress": progress,
            "status": status,
            "detail": detail,
        })

    async def send_completed(self, job_id: str, job_type: str, result: dict[str, Any] | None = None) -> None:
        await self.broadcast({
            "type": "completed",
            "job_id": job_id,
            "job_type": job_type,
            "result": result,
        })

    async def send_error(self, job_id: str, job_type: str, error: str) -> None:
        await self.broadcast({
            "type": "error",
            "job_id": job_id,
            "job_type": job_type,
            "error": error,
        })


ws_manager = WebSocketManager()
