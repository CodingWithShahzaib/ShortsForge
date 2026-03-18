from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.storage import get_storage

router = APIRouter()


@router.get("/url")
async def get_media_url(path: str):
    if not path:
        raise HTTPException(400, "path is required")
    if path.startswith("http://") or path.startswith("https://"):
        return {"url": path}
    storage = get_storage()
    return {"url": await storage.get_url(path)}
