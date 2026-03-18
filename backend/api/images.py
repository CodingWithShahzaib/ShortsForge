from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type
from backend.schemas import GenerateImageRequest
from backend.services.image_service import generate_image, get_image_provider
from backend.services.prompt_service import enhance_image_prompt

router = APIRouter()


@router.post("/generate")
async def generate_image_endpoint(req: GenerateImageRequest):
    path = await generate_image(
        prompt=req.prompt,
        provider=req.provider,
        width=req.width,
        height=req.height,
        style=req.style,
    )
    storage = get_storage()
    return {"path": path, "url": await storage.get_url(path)}


@router.post("/enhance-prompt")
async def enhance_prompt(prompt: str, style: str = "realistic"):
    enhanced = await enhance_image_prompt(prompt, style)
    return {"original": prompt, "enhanced": enhanced}


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise HTTPException(400, f"Unsupported image format: {ext}")
    name = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()
    key = build_key("images", name)
    storage = get_storage()
    await storage.save_bytes(key, content, guess_content_type(name))
    return {"path": key, "url": await storage.get_url(key)}


@router.get("/providers")
async def list_image_providers():
    from backend.config import get_settings
    settings = get_settings()
    providers = []
    if settings.replicate_api_key:
        providers.append({"id": "replicate", "name": "Replicate Flux", "configured": True})
    if settings.fal_api_key:
        providers.append({"id": "fal", "name": "FAL AI", "configured": True})
    if settings.together_api_key:
        providers.append({"id": "together", "name": "Together AI", "configured": True})
    if settings.runware_api_key:
        providers.append({"id": "runware", "name": "Runware", "configured": True})
    providers.append({"id": "pollinations", "name": "Pollinations (Free)", "configured": True})
    if settings.openai_api_key:
        providers.append({"id": "openai_image", "name": "OpenAI Image", "configured": True})
    return providers
