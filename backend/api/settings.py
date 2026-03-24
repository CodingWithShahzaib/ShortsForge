from __future__ import annotations

import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.schemas import AppSettings, ProviderStatus
from backend.services.transition_service import list_transitions

router = APIRouter()


@router.get("/")
async def get_settings_endpoint():
    settings = get_settings()
    return {
        "default_llm_provider": settings.default_llm_provider,
        "default_llm_model": settings.default_llm_model,
        "default_image_provider": settings.default_image_provider,
        "default_tts_provider": settings.default_tts_provider,
        "default_tts_voice": settings.default_tts_voice,
        "default_video_provider": settings.default_video_provider,
        "default_video_model": settings.default_video_model,
        "default_resolution": settings.default_resolution,
        "default_transition": settings.default_transition,
        "default_image_style": settings.default_image_style,
        "default_word_count": settings.default_word_count,
        "default_scene_count": settings.default_scene_count,
        "ffmpeg_path": settings.ffmpeg_path,
    }


@router.patch("/")
async def update_settings(data: AppSettings):
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}

    existing = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()

    key_map = {
        "openai_api_key": "OPENAI_API_KEY",
        "groq_api_key": "GROQ_API_KEY",
        "openrouter_api_key": "OPENROUTER_API_KEY",
        "elevenlabs_api_key": "ELEVENLABS_API_KEY",
        "replicate_api_key": "REPLICATE_API_KEY",
        "fal_api_key": "FAL_API_KEY",
        "together_api_key": "TOGETHER_API_KEY",
        "runware_api_key": "RUNWARE_API_KEY",
        "ffmpeg_path": "FFMPEG_PATH",
        "default_llm_provider": "DEFAULT_LLM_PROVIDER",
        "default_llm_model": "DEFAULT_LLM_MODEL",
        "default_image_provider": "DEFAULT_IMAGE_PROVIDER",
        "default_tts_provider": "DEFAULT_TTS_PROVIDER",
        "default_tts_voice": "DEFAULT_TTS_VOICE",
        "default_video_provider": "DEFAULT_VIDEO_PROVIDER",
        "default_video_model": "DEFAULT_VIDEO_MODEL",
        "default_resolution": "DEFAULT_RESOLUTION",
        "default_transition": "DEFAULT_TRANSITION",
        "default_image_style": "DEFAULT_IMAGE_STYLE",
        "default_word_count": "DEFAULT_WORD_COUNT",
        "default_scene_count": "DEFAULT_SCENE_COUNT",
        "redis_url": "REDIS_URL",
    }

    for field, value in updates.items():
        if value is not None and field in key_map:
            existing[key_map[field]] = value

    lines = [f"{k}={v}" for k, v in existing.items()]
    env_path.write_text("\n".join(lines) + "\n")

    get_settings.cache_clear()
    return {"status": "updated"}


@router.get("/providers")
async def list_providers():
    settings = get_settings()
    return {
        "llm": [
            ProviderStatus(name="openai", configured=bool(settings.openai_api_key), models=["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]),
            ProviderStatus(name="groq", configured=bool(settings.groq_api_key), models=["llama-3.1-8b-instant", "llama-3.1-70b-versatile"]),
            ProviderStatus(name="openrouter", configured=bool(settings.openrouter_api_key), models=["google/gemini-2.0-flash-exp:free", "meta-llama/llama-3.1-8b-instruct:free"]),
        ],
        "image": [
            ProviderStatus(name="replicate", configured=bool(settings.replicate_api_key)),
            ProviderStatus(name="fal", configured=bool(settings.fal_api_key)),
            ProviderStatus(name="together", configured=bool(settings.together_api_key)),
            ProviderStatus(name="runware", configured=bool(settings.runware_api_key)),
            ProviderStatus(name="pollinations", configured=True),
            ProviderStatus(name="openai_image", configured=bool(settings.openai_api_key)),
        ],
        "tts": [
            ProviderStatus(name="edge", configured=True),
            ProviderStatus(name="openai_tts", configured=bool(settings.openai_api_key)),
            ProviderStatus(name="elevenlabs", configured=bool(settings.elevenlabs_api_key)),
        ],
        "video": [
            ProviderStatus(
                name="sora",
                configured=bool(settings.openai_api_key),
                models=["sora-2", "sora-2-pro", "sora-2-pro-2025-10-06"],
            ),
        ],
        "transcription": [
            ProviderStatus(name="openai", configured=bool(settings.openai_api_key)),
            ProviderStatus(name="groq", configured=bool(settings.groq_api_key)),
        ],
    }


@router.get("/redis-status")
async def get_redis_status():
    """Return detailed Redis queue status for the settings dashboard."""
    from backend.core.redis_client import redis_health, is_redis_available
    from backend.core.redis_queue import get_queue_stats

    health = await redis_health()
    stats = await get_queue_stats()
    return {
        **health,
        "queue": stats,
    }


@router.get("/llm-models")
async def list_llm_models(provider: str = "openai"):
    """Fetch available LLM models from the provider's API (OpenAI, Groq, OpenRouter)."""
    settings = get_settings()
    provider = provider.lower()

    if provider == "openai":
        api_key = settings.openai_api_key
        base_url = settings.openai_base_url.rstrip("/")
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured")
        url = f"{base_url}/models"
        headers = {"Authorization": f"Bearer {api_key}"}
    elif provider == "groq":
        api_key = settings.groq_api_key
        if not api_key:
            raise HTTPException(status_code=400, detail="Groq API key not configured")
        url = "https://api.groq.com/openai/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
    elif provider == "openrouter":
        api_key = settings.openrouter_api_key
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenRouter API key not configured")
        url = "https://openrouter.ai/api/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text[:200])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Normalize response format
    if provider == "openrouter":
        # OpenRouter: { "data": [ { "id": "...", ... } ] }
        items = data.get("data", [])
        models = [m["id"] for m in items if isinstance(m.get("id"), str)]
    else:
        # OpenAI / Groq: { "data": [ { "id": "...", ... } ] }
        items = data.get("data", [])
        models = [m["id"] for m in items if isinstance(m.get("id"), str)]
        # Filter OpenAI to chat-capable models only (avoids deprecated/embedding-only)
        if provider == "openai":
            models = [m for m in models if m.startswith(("gpt-", "o1-", "o3-"))]

    models = sorted(set(models))
    return {"models": models}


@router.get("/resolutions")
async def list_resolutions():
    return [
        {"id": "1080x1920", "name": "1080x1920 (9:16 Portrait)", "category": "portrait"},
        {"id": "720x1280", "name": "720x1280 (9:16 Portrait HD)", "category": "portrait"},
        {"id": "1920x1080", "name": "1920x1080 (16:9 Landscape)", "category": "landscape"},
        {"id": "1280x720", "name": "1280x720 (16:9 Landscape HD)", "category": "landscape"},
        {"id": "1024x1024", "name": "1024x1024 (1:1 Square)", "category": "square"},
        {"id": "1024x1792", "name": "1024x1792 (9:16 Tall)", "category": "portrait"},
        {"id": "1792x1024", "name": "1792x1024 (16:9 Wide)", "category": "landscape"},
    ]


@router.get("/transitions")
async def list_transitions_endpoint():
    return list_transitions()
