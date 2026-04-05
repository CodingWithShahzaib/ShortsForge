from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from backend.config import get_settings
from backend.schemas import (
    AppSettings,
    AudioSettings,
    ProviderStatus,
    SafeZoneResponse,
    SubtitleSettings,
    VideoStyleSettings,
)
from backend.services.transition_service import list_transitions

router = APIRouter()


def _video_style_from_app_settings() -> VideoStyleSettings:
    settings = get_settings()
    return VideoStyleSettings(
        ken_burns_enabled=settings.default_ken_burns_enabled,
        ken_burns_zoom_percent=settings.default_ken_burns_zoom_percent,
        ken_burns_motion=settings.default_ken_burns_motion,
        breathing_enabled=settings.default_breathing_enabled,
        breathing_amplitude=settings.default_breathing_amplitude,
        breathing_speed=settings.default_breathing_speed,
        film_grain_enabled=settings.default_film_grain_enabled,
        film_grain_intensity=settings.default_film_grain_intensity,
        vignette_enabled=settings.default_vignette_enabled,
        vignette_intensity=settings.default_vignette_intensity,
        lut_enabled=settings.default_lut_enabled,
        lut_path=settings.default_lut_path or None,
        default_transition=settings.default_transition,
        transition_duration_sec=settings.default_transition_duration_sec,
        scene_duration_min=settings.default_scene_duration_min,
        scene_duration_max=settings.default_scene_duration_max,
    )


def _subtitle_settings_from_app_settings() -> SubtitleSettings:
    settings = get_settings()
    return SubtitleSettings(
        font_family=settings.default_subtitle_font,
        font_size=settings.default_subtitle_size,
        position=settings.default_subtitle_position,
        background_opacity=settings.default_subtitle_background_opacity,
        text_color=settings.default_subtitle_color,
        shadow_enabled=settings.default_subtitle_shadow_enabled,
        shadow_strength=settings.default_subtitle_shadow_strength,
        safe_zone_enabled=settings.default_subtitle_safe_zone_enabled,
        safe_zone_platform=settings.default_subtitle_safe_zone_platform,
        safe_zone_config=settings.default_subtitle_safe_zone_config,
        words_per_group=settings.default_subtitle_words_per_group,
        word_pop_enabled=settings.default_word_pop_enabled,
    )


def _audio_settings_from_app_settings() -> AudioSettings:
    settings = get_settings()
    return AudioSettings(
        music_volume=settings.default_music_volume,
        ducking_enabled=settings.default_ducking_enabled,
        ducking_amount=settings.default_ducking_amount,
        voice_provider=settings.default_tts_provider,
        voice_id=settings.default_tts_voice,
        speed=settings.default_tts_speed,
        response_format=settings.default_tts_response_format,
        normalize=settings.default_tts_normalize,
    )


@router.get("/")
async def get_settings_endpoint():
    settings = get_settings()
    return {
        "default_llm_provider": settings.default_llm_provider,
        "default_llm_model": settings.default_llm_model,
        "default_image_provider": settings.default_image_provider,
        "default_tts_provider": settings.default_tts_provider,
        "default_tts_voice": settings.default_tts_voice,
        "default_tts_speed": settings.default_tts_speed,
        "default_tts_response_format": settings.default_tts_response_format,
        "default_tts_normalize": settings.default_tts_normalize,
        "default_resolution": settings.default_resolution,
        "default_transition": settings.default_transition,
        "default_image_style": settings.default_image_style,
        "default_word_count": settings.default_word_count,
        "default_scene_count": settings.default_scene_count,
        "default_scene_narration_style": settings.default_scene_narration_style,
        "default_subtitle_enabled": settings.default_subtitle_enabled,
        "default_subtitle_source": settings.default_subtitle_source,
        "default_generate_subtitles": settings.default_generate_subtitles,
        "default_transcription_provider": settings.default_transcription_provider,
        "default_transcription_language": settings.default_transcription_language,
        "default_inter_scene_pause_ms": settings.default_inter_scene_pause_ms,
        "default_transition_overlap_ms": settings.default_transition_overlap_ms,
        "default_use_production_storyboard": settings.default_use_production_storyboard,
        "default_match_scenes_to_audio": settings.default_match_scenes_to_audio,
        "default_visual_continuity": settings.default_visual_continuity,
        "default_ken_burns_enabled": settings.default_ken_burns_enabled,
        "default_ken_burns_zoom_percent": settings.default_ken_burns_zoom_percent,
        "default_ken_burns_motion": settings.default_ken_burns_motion,
        "default_film_grain_enabled": settings.default_film_grain_enabled,
        "default_film_grain_intensity": settings.default_film_grain_intensity,
        "default_vignette_enabled": settings.default_vignette_enabled,
        "default_vignette_intensity": settings.default_vignette_intensity,
        "default_lut_enabled": settings.default_lut_enabled,
        "default_lut_path": settings.default_lut_path,
        "default_transition_duration_sec": settings.default_transition_duration_sec,
        "default_scene_duration_min": settings.default_scene_duration_min,
        "default_scene_duration_max": settings.default_scene_duration_max,
        "default_subtitle_font": settings.default_subtitle_font,
        "default_subtitle_size": settings.default_subtitle_size,
        "default_subtitle_color": settings.default_subtitle_color,
        "default_subtitle_position": settings.default_subtitle_position,
        "default_subtitle_words_per_group": settings.default_subtitle_words_per_group,
        "default_subtitle_background_opacity": settings.default_subtitle_background_opacity,
        "default_subtitle_shadow_enabled": settings.default_subtitle_shadow_enabled,
        "default_subtitle_shadow_strength": settings.default_subtitle_shadow_strength,
        "default_subtitle_safe_zone_enabled": settings.default_subtitle_safe_zone_enabled,
        "default_subtitle_safe_zone_platform": settings.default_subtitle_safe_zone_platform,
        "default_subtitle_safe_zone_config": settings.default_subtitle_safe_zone_config,
        "default_word_pop_enabled": settings.default_word_pop_enabled,
        "default_music_volume": settings.default_music_volume,
        "default_ducking_enabled": settings.default_ducking_enabled,
        "default_ducking_amount": settings.default_ducking_amount,
        "ffmpeg_path": settings.ffmpeg_path,
        "video_style": _video_style_from_app_settings().model_dump(),
        "subtitles": _subtitle_settings_from_app_settings().model_dump(),
        "audio": _audio_settings_from_app_settings().model_dump(),
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
        "default_tts_speed": "DEFAULT_TTS_SPEED",
        "default_tts_response_format": "DEFAULT_TTS_RESPONSE_FORMAT",
        "default_tts_normalize": "DEFAULT_TTS_NORMALIZE",
        "default_resolution": "DEFAULT_RESOLUTION",
        "default_transition": "DEFAULT_TRANSITION",
        "default_image_style": "DEFAULT_IMAGE_STYLE",
        "default_word_count": "DEFAULT_WORD_COUNT",
        "default_scene_count": "DEFAULT_SCENE_COUNT",
        "default_scene_narration_style": "DEFAULT_SCENE_NARRATION_STYLE",
        "default_subtitle_enabled": "DEFAULT_SUBTITLE_ENABLED",
        "default_subtitle_source": "DEFAULT_SUBTITLE_SOURCE",
        "default_generate_subtitles": "DEFAULT_GENERATE_SUBTITLES",
        "default_transcription_provider": "DEFAULT_TRANSCRIPTION_PROVIDER",
        "default_transcription_language": "DEFAULT_TRANSCRIPTION_LANGUAGE",
        "default_inter_scene_pause_ms": "DEFAULT_INTER_SCENE_PAUSE_MS",
        "default_transition_overlap_ms": "DEFAULT_TRANSITION_OVERLAP_MS",
        "default_use_production_storyboard": "DEFAULT_USE_PRODUCTION_STORYBOARD",
        "default_match_scenes_to_audio": "DEFAULT_MATCH_SCENES_TO_AUDIO",
        "default_visual_continuity": "DEFAULT_VISUAL_CONTINUITY",
        "default_ken_burns_enabled": "DEFAULT_KEN_BURNS_ENABLED",
        "default_ken_burns_zoom_percent": "DEFAULT_KEN_BURNS_ZOOM_PERCENT",
        "default_ken_burns_motion": "DEFAULT_KEN_BURNS_MOTION",
        "default_film_grain_enabled": "DEFAULT_FILM_GRAIN_ENABLED",
        "default_film_grain_intensity": "DEFAULT_FILM_GRAIN_INTENSITY",
        "default_vignette_enabled": "DEFAULT_VIGNETTE_ENABLED",
        "default_vignette_intensity": "DEFAULT_VIGNETTE_INTENSITY",
        "default_lut_enabled": "DEFAULT_LUT_ENABLED",
        "default_lut_path": "DEFAULT_LUT_PATH",
        "default_transition_duration_sec": "DEFAULT_TRANSITION_DURATION_SEC",
        "default_scene_duration_min": "DEFAULT_SCENE_DURATION_MIN",
        "default_scene_duration_max": "DEFAULT_SCENE_DURATION_MAX",
        "default_subtitle_font": "DEFAULT_SUBTITLE_FONT",
        "default_subtitle_size": "DEFAULT_SUBTITLE_SIZE",
        "default_subtitle_color": "DEFAULT_SUBTITLE_COLOR",
        "default_subtitle_position": "DEFAULT_SUBTITLE_POSITION",
        "default_subtitle_words_per_group": "DEFAULT_SUBTITLE_WORDS_PER_GROUP",
        "default_subtitle_background_opacity": "DEFAULT_SUBTITLE_BACKGROUND_OPACITY",
        "default_subtitle_shadow_enabled": "DEFAULT_SUBTITLE_SHADOW_ENABLED",
        "default_subtitle_shadow_strength": "DEFAULT_SUBTITLE_SHADOW_STRENGTH",
        "default_subtitle_safe_zone_enabled": "DEFAULT_SUBTITLE_SAFE_ZONE_ENABLED",
        "default_subtitle_safe_zone_platform": "DEFAULT_SUBTITLE_SAFE_ZONE_PLATFORM",
        "default_subtitle_safe_zone_config": "DEFAULT_SUBTITLE_SAFE_ZONE_CONFIG",
        "default_word_pop_enabled": "DEFAULT_WORD_POP_ENABLED",
        "default_music_volume": "DEFAULT_MUSIC_VOLUME",
        "default_ducking_enabled": "DEFAULT_DUCKING_ENABLED",
        "default_ducking_amount": "DEFAULT_DUCKING_AMOUNT",
        "redis_url": "REDIS_URL",
    }

    for field, value in updates.items():
        if field not in key_map:
            continue
        env_key = key_map[field]
        if value is None:
            existing.pop(env_key, None)
        else:
            existing[env_key] = json.dumps(value) if isinstance(value, (dict, list)) else value

    lines = [f"{k}={v}" for k, v in existing.items()]
    env_path.write_text("\n".join(lines) + "\n")

    get_settings.cache_clear()
    return {"status": "updated"}


@router.get("/video-style", response_model=VideoStyleSettings)
async def get_video_style_settings():
    return _video_style_from_app_settings()


@router.post("/video-style", response_model=VideoStyleSettings)
async def update_video_style_settings(data: VideoStyleSettings):
    await update_settings(
        AppSettings(
            default_ken_burns_enabled=data.ken_burns_enabled,
            default_ken_burns_zoom_percent=data.ken_burns_zoom_percent,
            default_ken_burns_motion=data.ken_burns_motion,
            default_breathing_enabled=data.breathing_enabled,
            default_breathing_amplitude=data.breathing_amplitude,
            default_breathing_speed=data.breathing_speed,
            default_film_grain_enabled=data.film_grain_enabled,
            default_film_grain_intensity=data.film_grain_intensity,
            default_vignette_enabled=data.vignette_enabled,
            default_vignette_intensity=data.vignette_intensity,
            default_lut_enabled=data.lut_enabled,
            default_lut_path=data.lut_path,
            default_transition=data.default_transition,
            default_transition_duration_sec=data.transition_duration_sec,
            default_scene_duration_min=data.scene_duration_min,
            default_scene_duration_max=data.scene_duration_max,
        )
    )
    return _video_style_from_app_settings()


@router.get("/subtitles", response_model=SubtitleSettings)
async def get_subtitle_settings():
    return _subtitle_settings_from_app_settings()


@router.post("/subtitles", response_model=SubtitleSettings)
async def update_subtitle_settings(data: SubtitleSettings):
    await update_settings(
        AppSettings(
            default_subtitle_font=data.font_family,
            default_subtitle_size=data.font_size,
            default_subtitle_color=data.text_color,
            default_subtitle_position=data.position,
            default_subtitle_background_opacity=data.background_opacity,
            default_subtitle_words_per_group=data.words_per_group,
            default_subtitle_shadow_enabled=data.shadow_enabled,
            default_subtitle_shadow_strength=data.shadow_strength,
            default_subtitle_safe_zone_enabled=data.safe_zone_enabled,
            default_subtitle_safe_zone_platform=data.safe_zone_platform,
            default_subtitle_safe_zone_config=data.safe_zone_config.model_dump() if data.safe_zone_config else None,
            default_word_pop_enabled=data.word_pop_enabled,
        )
    )
    return _subtitle_settings_from_app_settings()


@router.get("/audio", response_model=AudioSettings)
async def get_audio_settings():
    return _audio_settings_from_app_settings()


@router.post("/audio", response_model=AudioSettings)
async def update_audio_settings(data: AudioSettings):
    await update_settings(
        AppSettings(
            default_music_volume=data.music_volume,
            default_ducking_enabled=data.ducking_enabled,
            default_ducking_amount=data.ducking_amount,
            default_tts_provider=data.voice_provider,
            default_tts_voice=data.voice_id,
            default_tts_speed=data.speed,
            default_tts_response_format=data.response_format,
            default_tts_normalize=data.normalize,
        )
    )
    return _audio_settings_from_app_settings()


@router.get("/safe-zones", response_model=SafeZoneResponse)
async def get_safe_zone_settings():
    return SafeZoneResponse()


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
            ProviderStatus(name="kokoro", configured=bool(settings.kokoro_tts_url)),
        ],
        "video": [],
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
            models = [m for m in models if m.startswith(("gpt-", "o1-", "o3-", "o4-"))]

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


class FetchOverlayBody(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)


@router.get("/overlays")
async def list_overlays_endpoint():
    from backend.services.overlay_service import list_overlays

    return list_overlays()


@router.post("/overlays/upload")
async def upload_overlay_endpoint(file: UploadFile = File(...)):
    from backend.services.overlay_service import (
        VIDEO_EXTS,
        ensure_overlays_dir,
        unique_filename,
    )

    if not file.filename:
        raise HTTPException(400, "Missing filename")
    raw = await file.read()
    if len(raw) > 80 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 80MB)")
    dest_name = unique_filename(file.filename)
    dest = ensure_overlays_dir() / dest_name
    dest.write_bytes(raw)
    ext = dest.suffix.lower()
    kind = "video" if ext in VIDEO_EXTS else "image"
    return {"id": dest.name, "filename": dest.name, "kind": kind}


@router.post("/overlays/fetch")
async def fetch_overlay_endpoint(body: FetchOverlayBody):
    from backend.services.overlay_service import (
        ALLOWED_EXTS,
        OVERLAY_FETCH_HEADERS,
        VIDEO_EXTS,
        ensure_overlays_dir,
        guess_overlay_extension_from_bytes,
        overlay_ext_from_content_type,
    )

    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Only http(s) URLs are allowed")
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=120.0,
            headers=OVERLAY_FETCH_HEADERS,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            if len(resp.content) > 80 * 1024 * 1024:
                raise HTTPException(400, "Download too large")
            content = resp.content
            ct = resp.headers.get("content-type")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Download failed: {e.response.status_code}") from e
    except httpx.RequestError as e:
        raise HTTPException(502, f"Download failed: {e}") from e

    lead = content.lstrip()[:64]
    if lead.startswith(b"<!") or lead[:7].lower() == b"<!docty" or lead[:5].lower() == b"<html":
        raise HTTPException(
            400,
            "That URL returned a web page, not a direct file. "
            "Open the link in a browser, use “Save link as…”, or paste a URL that ends in "
            ".png, .webm, .mp4, etc.",
        )

    path_part = unquote(urlparse(url).path)
    suggested = Path(path_part).name or ""
    ext = Path(suggested).suffix.lower()
    if ext not in ALLOWED_EXTS:
        ext = ""
    if not ext:
        ext = overlay_ext_from_content_type(ct) or ""
    if not ext:
        ext = guess_overlay_extension_from_bytes(content) or ""
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            400,
            "Could not detect a supported overlay type "
            "(PNG, WebP, JPG, WebM, MOV, MP4, GIF, MKV). "
            "Try a direct CDN link to the asset file.",
        )
    name = f"fetched_{uuid.uuid4().hex[:12]}{ext}"
    dest = ensure_overlays_dir() / name
    dest.write_bytes(content)
    kind = "video" if ext in VIDEO_EXTS else "image"
    return {"id": dest.name, "filename": dest.name, "kind": kind}


@router.delete("/overlays/{filename}")
async def delete_overlay_endpoint(filename: str):
    from backend.services.overlay_service import resolve_overlay_file

    p = resolve_overlay_file(filename)
    if not p:
        raise HTTPException(404, "Overlay not found")
    p.unlink()
    return {"status": "deleted"}
