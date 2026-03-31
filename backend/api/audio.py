from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type
from backend.schemas import GenerateAudioRequest
from backend.services.audio_service import synthesize_speech, list_voices

router = APIRouter()
logger = logging.getLogger(__name__)

# Fallback Edge TTS voices when Microsoft API returns 503/network error
EDGE_VOICES_FALLBACK = [
    {"id": "en-US-ChristopherNeural", "name": "Christopher (en-US)", "locale": "en-US", "gender": "Male"},
    {"id": "en-US-JennyNeural", "name": "Jenny (en-US)", "locale": "en-US", "gender": "Female"},
    {"id": "en-US-GuyNeural", "name": "Guy (en-US)", "locale": "en-US", "gender": "Male"},
    {"id": "en-US-AriaNeural", "name": "Aria (en-US)", "locale": "en-US", "gender": "Female"},
    {"id": "en-GB-ThomasNeural", "name": "Thomas (en-GB)", "locale": "en-GB", "gender": "Male"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (en-GB)", "locale": "en-GB", "gender": "Female"},
]


def _sanitize_music_filename(filename: str) -> str:
    base = Path(filename).name.strip()
    if not base or ".." in base:
        raise HTTPException(400, "Invalid filename")
    ext = Path(base).suffix.lower()
    if ext not in {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}:
        raise HTTPException(400, f"Unsupported audio format: {ext}")
    stem = Path(base).stem.strip()
    cleaned_stem = re.sub(r"[^a-zA-Z0-9._()\- ]+", "_", stem).strip(" ._")
    if not cleaned_stem:
        cleaned_stem = "track"
    return f"{cleaned_stem[:80]}{ext}"


def _build_music_storage_name(filename: str) -> str:
    return f"{uuid.uuid4().hex}__{_sanitize_music_filename(filename)}"


def _music_display_name(stored_name: str) -> str:
    stem = Path(stored_name).stem
    ext = Path(stored_name).suffix
    if "__" in stem:
        _, original_stem = stem.split("__", 1)
        if original_stem:
            return f"{original_stem}{ext}"
    return stored_name


@router.post("/generate")
async def generate_audio_endpoint(req: GenerateAudioRequest):
    path = await synthesize_speech(
        text=req.text,
        provider=req.provider,
        voice=req.voice,
        speed=req.speed,
    )
    storage = get_storage()
    return {"path": path, "url": await storage.get_url(path)}


@router.get("/voices")
async def list_voices_endpoint(provider: str = "edge"):
    try:
        voices = await list_voices(provider)
        return voices
    except Exception as exc:
        if provider == "edge":
            logger.warning("Edge TTS voices API unavailable (%s), using fallback list", exc)
            return EDGE_VOICES_FALLBACK
        raise HTTPException(503, f"TTS provider unavailable: {exc}")


@router.get("/providers")
async def list_tts_providers():
    settings = get_settings()
    providers = [{"id": "edge", "name": "Edge TTS (Free)", "configured": True}]
    if settings.openai_api_key:
        providers.append({"id": "openai_tts", "name": "OpenAI TTS", "configured": True})
    if settings.elevenlabs_api_key:
        providers.append({"id": "elevenlabs", "name": "ElevenLabs", "configured": True})
    return providers


@router.post("/music/upload")
async def upload_music(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    display_name = _sanitize_music_filename(file.filename)
    name = _build_music_storage_name(file.filename)
    content = await file.read()
    key = build_key("music", name)
    storage = get_storage()
    await storage.save_bytes(key, content, guess_content_type(name))
    return {
        "id": name,
        "name": display_name,
        "path": key,
        "url": await storage.get_url(key),
    }


@router.get("/music")
async def list_music():
    exts = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
    tracks = []
    storage = get_storage()
    keys = await storage.list_keys("music")
    for key in sorted(keys):
        name = Path(key).name
        if Path(name).suffix.lower() in exts:
            tracks.append({
                "id": name,
                "name": _music_display_name(name),
                "path": key,
                "url": await storage.get_url(key),
            })
    return tracks


@router.delete("/music/{music_id}", status_code=204)
async def delete_music(music_id: str):
    storage = get_storage()
    key = build_key("music", music_id)
    await storage.delete(key)
