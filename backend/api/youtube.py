from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from datetime import timezone
from urllib.parse import urlparse
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.models import Job, Project, Scene, YouTubeAccount

logger = logging.getLogger(__name__)

router = APIRouter()

YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]

YOUTUBE_REDIRECT_PATH = "/api/youtube/callback"

_AVATAR_CACHE_TTL_SEC = 60 * 60
_AVATAR_CACHE_MAX = 128
_AVATAR_ALLOWED_HOSTS = {
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
}
_avatar_cache: dict[str, tuple[float, bytes, str]] = {}


def _get_cached_avatar(url: str) -> tuple[bytes, str] | None:
    now = time.time()
    cached = _avatar_cache.get(url)
    if not cached:
        return None
    expires_at, data, content_type = cached
    if expires_at <= now:
        _avatar_cache.pop(url, None)
        return None
    return data, content_type


def _set_cached_avatar(url: str, data: bytes, content_type: str) -> None:
    if len(_avatar_cache) >= _AVATAR_CACHE_MAX:
        _avatar_cache.clear()
    _avatar_cache[url] = (time.time() + _AVATAR_CACHE_TTL_SEC, data, content_type)


def _get_token_cipher():
    from cryptography.fernet import Fernet

    settings = get_settings()
    key = (settings.youtube_token_key or "").strip()
    if not key:
        raise HTTPException(500, "YOUTUBE_TOKEN_KEY is not configured on the server")
    try:
        return Fernet(key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, "Invalid YOUTUBE_TOKEN_KEY format") from exc


def _encrypt_token(token: str) -> str:
    if not token:
        return ""
    return _get_token_cipher().encrypt(token.encode("utf-8")).decode("utf-8")


def _decrypt_token(token: str) -> str:
    from cryptography.fernet import InvalidToken

    if not token:
        return ""
    try:
        return _get_token_cipher().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(
            500,
            "YouTube token decryption failed. Check YOUTUBE_TOKEN_KEY or reconnect the channel.",
        ) from exc


def _build_credentials(account: YouTubeAccount):
    """Build google.oauth2.credentials.Credentials from stored tokens."""
    from google.oauth2.credentials import Credentials

    settings = get_settings()
    expiry = account.token_expiry
    if expiry and expiry.tzinfo is not None:
        # google-auth compares against naive utcnow(); normalize to naive UTC.
        expiry = expiry.astimezone(timezone.utc).replace(tzinfo=None)
    return Credentials(
        token=_decrypt_token(account.access_token),
        refresh_token=_decrypt_token(account.refresh_token or ""),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.youtube_client_id,
        client_secret=settings.youtube_client_secret,
        scopes=account.scopes or YOUTUBE_SCOPES,
        expiry=expiry,
    )


async def _refresh_credentials_if_needed(
    creds, account: YouTubeAccount, db: AsyncSession
):
    """Refresh the access token if expired, and persist new tokens."""
    from google.auth.transport.requests import Request

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        account.access_token = _encrypt_token(creds.token)
        if creds.refresh_token:
            account.refresh_token = _encrypt_token(creds.refresh_token)
        account.token_expiry = creds.expiry
        await db.commit()
    return creds


async def _get_account_by_channel_id(db: AsyncSession, channel_id: str) -> YouTubeAccount | None:
    result = await db.execute(select(YouTubeAccount).where(YouTubeAccount.channel_id == channel_id))
    return result.scalar_one_or_none()


async def _get_default_account(db: AsyncSession) -> YouTubeAccount | None:
    result = await db.execute(
        select(YouTubeAccount).where(YouTubeAccount.is_default.is_(True))
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/auth-url")
async def get_auth_url():
    """Generate a Google OAuth2 consent URL."""
    from google_auth_oauthlib.flow import Flow

    settings = get_settings()
    if not settings.youtube_client_id or not settings.youtube_client_secret:
        raise HTTPException(400, "YouTube client ID and secret must be configured in Settings first")
    if not settings.youtube_token_key:
        raise HTTPException(400, "YOUTUBE_TOKEN_KEY must be configured before connecting a channel")

    redirect_uri = f"{settings.cors_origins[0].rstrip('/')}"
    backend_origin = "http://localhost:8000"
    redirect_uri = f"{backend_origin}{YOUTUBE_REDIRECT_PATH}"

    client_config = {
        "web": {
            "client_id": settings.youtube_client_id,
            "client_secret": settings.youtube_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    # Confidential web client: do not use PKCE. PKCE requires the same Flow (code_verifier)
    # on auth-url and callback; we use two separate requests, so Google would error with
    # "Missing code verifier" if code_challenge was sent without code_verifier on token exchange.
    flow = Flow.from_client_config(
        client_config,
        scopes=YOUTUBE_SCOPES,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=False,
    )
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return {"url": url}


@router.get("/avatar")
async def youtube_avatar(url: str = Query(...)):
    """Proxy YouTube avatar to avoid client-side rate limits."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(400, "Invalid avatar URL")
    host = (parsed.hostname or "").lower()
    if host not in _AVATAR_ALLOWED_HOSTS:
        raise HTTPException(400, "Avatar host not allowed")

    cached = _get_cached_avatar(url)
    if cached:
        data, content_type = cached
        return Response(
            content=data,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )

    import httpx

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        if cached:
            data, content_type = cached
            return Response(
                content=data,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=3600"},
            )
        raise HTTPException(502, f"Avatar fetch failed ({resp.status_code})")

    data = resp.content or b""
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(413, "Avatar image too large")

    content_type = resp.headers.get("content-type", "image/jpeg").split(";", 1)[0].strip()
    _set_cached_avatar(url, data, content_type)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/callback")
async def oauth_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth2 callback — exchange code for tokens."""
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build

    if error:
        logger.warning("YouTube OAuth error: %s", error)
        return RedirectResponse(url="http://localhost:3000/settings?youtube=error")

    if not code:
        raise HTTPException(400, "Missing authorization code")

    settings = get_settings()
    backend_origin = "http://localhost:8000"
    redirect_uri = f"{backend_origin}{YOUTUBE_REDIRECT_PATH}"

    client_config = {
        "web": {
            "client_id": settings.youtube_client_id,
            "client_secret": settings.youtube_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=YOUTUBE_SCOPES,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=False,
    )

    try:
        flow.fetch_token(code=code)
    except Exception as exc:
        logger.exception("Failed to exchange OAuth code: %s", exc)
        return RedirectResponse(url="http://localhost:3000/settings?youtube=error")

    creds = flow.credentials

    channel_id = ""
    channel_title = ""
    channel_thumbnail = ""
    try:
        yt = build("youtube", "v3", credentials=creds)
        resp = yt.channels().list(part="snippet", mine=True).execute()
        items = resp.get("items", [])
        if items:
            channel_id = items[0]["id"]
            snippet = items[0].get("snippet", {}) or {}
            channel_title = snippet.get("title", "")
            thumbs = snippet.get("thumbnails", {}) or {}
            channel_thumbnail = (
                (thumbs.get("high") or {}).get("url")
                or (thumbs.get("medium") or {}).get("url")
                or (thumbs.get("default") or {}).get("url")
                or ""
            )
    except Exception:
        logger.warning("Could not fetch channel info after OAuth", exc_info=True)

    if not channel_id:
        return RedirectResponse(url="http://localhost:3000/settings?youtube=error")

    existing = await _get_account_by_channel_id(db, channel_id)
    if existing:
        existing.access_token = _encrypt_token(creds.token)
        if creds.refresh_token:
            existing.refresh_token = _encrypt_token(creds.refresh_token)
        existing.token_expiry = creds.expiry
        existing.channel_title = channel_title or existing.channel_title
        existing.channel_thumbnail = channel_thumbnail or existing.channel_thumbnail
        existing.scopes = list(creds.scopes or YOUTUBE_SCOPES)
    else:
        is_default = False
        has_any = await db.execute(select(func.count()).select_from(YouTubeAccount))
        if int(has_any.scalar_one() or 0) == 0:
            is_default = True
        account = YouTubeAccount(
            channel_id=channel_id,
            channel_title=channel_title,
            channel_thumbnail=channel_thumbnail or None,
            access_token=_encrypt_token(creds.token),
            refresh_token=_encrypt_token(creds.refresh_token or ""),
            token_expiry=creds.expiry,
            scopes=list(creds.scopes or YOUTUBE_SCOPES),
            is_default=is_default,
        )
        db.add(account)
    await db.commit()

    return RedirectResponse(
        url=f"http://localhost:3000/settings?youtube=connected&channel_id={channel_id}"
    )


@router.get("/status")
async def youtube_status(db: AsyncSession = Depends(get_db)):
    """Return YouTube connection status and list of channels."""
    settings = get_settings()
    result = await db.execute(select(YouTubeAccount).order_by(YouTubeAccount.created_at.asc()))
    accounts = result.scalars().all()
    default = next((a for a in accounts if a.is_default), None)
    return {
        "connected": bool(accounts),
        "oauth_ready": bool(
            settings.youtube_client_id and settings.youtube_client_secret and settings.youtube_token_key
        ),
        "default_channel_id": default.channel_id if default else None,
        "channels": [
            {
                "channel_id": a.channel_id,
                "channel_title": a.channel_title,
                "channel_thumbnail": a.channel_thumbnail or "",
                "is_default": bool(a.is_default),
            }
            for a in accounts
        ],
    }


@router.get("/channel-stats")
async def youtube_channel_stats(channel_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """Public channel statistics for a connected account (YouTube Data API v3)."""
    import asyncio

    from googleapiclient.discovery import build

    settings = get_settings()
    oauth_ready = bool(
        settings.youtube_client_id and settings.youtube_client_secret and settings.youtube_token_key
    )
    result = await db.execute(select(YouTubeAccount).order_by(YouTubeAccount.created_at.asc()))
    accounts = result.scalars().all()
    if not accounts:
        return {
            "connected": False,
            "oauth_ready": oauth_ready,
            "channel": None,
            "error": None,
        }

    account = None
    if channel_id:
        account = next((a for a in accounts if a.channel_id == channel_id), None)
        if not account:
            raise HTTPException(404, "YouTube channel not found")
    else:
        account = next((a for a in accounts if a.is_default), None) or accounts[0]

    creds = _build_credentials(account)

    creds = await _refresh_credentials_if_needed(creds, account, db)

    def _fetch() -> dict | None:
        yt = build("youtube", "v3", credentials=creds)
        resp = yt.channels().list(part="snippet,statistics", id=account.channel_id).execute()
        items = resp.get("items", [])
        if not items:
            return None
        it = items[0]
        sn = it.get("snippet", {}) or {}
        st = it.get("statistics", {}) or {}
        thumbs = sn.get("thumbnails", {}) or {}
        thumb_url = (
            (thumbs.get("high") or {}).get("url")
            or (thumbs.get("medium") or {}).get("url")
            or (thumbs.get("default") or {}).get("url")
            or ""
        )
        custom = (sn.get("customUrl") or "").strip()
        return {
            "id": it.get("id", ""),
            "title": sn.get("title", ""),
            "custom_url": custom,
            "thumbnail_url": thumb_url,
            "subscriber_count": st.get("subscriberCount"),
            "video_count": st.get("videoCount"),
            "view_count": st.get("viewCount"),
            "hidden_subscriber_count": bool(st.get("hiddenSubscriberCount", False)),
        }

    try:
        channel = await asyncio.to_thread(_fetch)
        if channel and not channel.get("thumbnail_url") and account.channel_thumbnail:
            channel["thumbnail_url"] = account.channel_thumbnail
        return {
            "connected": True,
            "oauth_ready": oauth_ready,
            "channel": channel,
            "error": None,
        }
    except Exception as exc:
        logger.warning("YouTube channel stats failed: %s", exc)
        msg = str(exc)
        if "401" in msg or "invalid_grant" in msg.lower():
            msg = "Session expired — reconnect in Settings."
        return {
            "connected": True,
            "oauth_ready": oauth_ready,
            "channel": None,
            "error": msg[:300],
        }


class YouTubeDefaultRequest(BaseModel):
    channel_id: str


@router.post("/default")
async def youtube_set_default(req: YouTubeDefaultRequest, db: AsyncSession = Depends(get_db)):
    """Set the default YouTube channel."""
    account = await _get_account_by_channel_id(db, req.channel_id)
    if not account:
        raise HTTPException(404, "YouTube channel not found")
    if not account.is_default:
        await db.execute(update(YouTubeAccount).values(is_default=False))
        account.is_default = True
        await db.commit()
    return {"status": "default_set"}


@router.delete("/disconnect")
async def youtube_disconnect(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Remove stored YouTube tokens for a channel."""
    account = await _get_account_by_channel_id(db, channel_id)
    if not account:
        raise HTTPException(404, "YouTube channel not found")
    was_default = account.is_default
    await db.delete(account)
    await db.commit()
    if was_default:
        result = await db.execute(select(YouTubeAccount).order_by(YouTubeAccount.created_at.asc()))
        next_account = result.scalars().first()
        if next_account:
            next_account.is_default = True
            await db.commit()
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class YouTubeUploadRequest(BaseModel):
    job_id: str
    channel_id: str | None = None
    title: str = Field(max_length=100)
    description: str = Field(default="", max_length=5000)
    tags: list[str] = []
    privacy: Literal["private", "unlisted", "public"] = "private"
    category_id: str = "22"


@router.post("/upload")
async def upload_to_youtube(req: YouTubeUploadRequest, db: AsyncSession = Depends(get_db)):
    """Upload a completed video to YouTube."""
    import asyncio

    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    from backend.core.storage import get_storage, local_path_for

    result = await db.execute(select(YouTubeAccount).order_by(YouTubeAccount.created_at.asc()))
    accounts = result.scalars().all()
    if not accounts:
        raise HTTPException(401, "YouTube account not connected. Please connect in Settings.")
    account = None
    if req.channel_id:
        account = next((a for a in accounts if a.channel_id == req.channel_id), None)
        if not account:
            raise HTTPException(404, "YouTube channel not found")
    else:
        account = next((a for a in accounts if a.is_default), None) or accounts[0]

    creds = _build_credentials(account)
    creds = await _refresh_credentials_if_needed(creds, account, db)

    result = await db.execute(select(Job).where(Job.id == req.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "completed" or not job.result or not job.result.get("video_path"):
        raise HTTPException(400, "Job has no completed video to upload")

    input_key = job.result["video_path"]
    local_input = local_path_for(input_key)
    if not local_input or not Path(local_input).exists():
        settings = get_settings()
        temp_dir = Path(settings.temp_dir) / "youtube_uploads"
        temp_dir.mkdir(parents=True, exist_ok=True)
        local_input = str(temp_dir / Path(input_key).name)
        storage = get_storage()
        await storage.download_to_path(input_key, local_input)

    if not Path(local_input).exists():
        raise HTTPException(400, "Video file not found on server")

    body = {
        "snippet": {
            "title": req.title,
            "description": req.description,
            "tags": req.tags[:15],
            "categoryId": req.category_id,
        },
        "status": {
            "privacyStatus": req.privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(local_input, mimetype="video/mp4", resumable=True, chunksize=10 * 1024 * 1024)

    def _do_upload():
        yt = build("youtube", "v3", credentials=creds)
        request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            _, response = request.next_chunk()
        return response

    try:
        response = await asyncio.to_thread(_do_upload)
    except Exception as exc:
        error_msg = str(exc)
        if "401" in error_msg or "invalid_grant" in error_msg:
            raise HTTPException(401, "YouTube authentication expired. Please reconnect in Settings.")
        if "403" in error_msg:
            raise HTTPException(403, "YouTube upload quota exceeded or permission denied.")
        logger.exception("YouTube upload failed")
        raise HTTPException(500, f"YouTube upload failed: {error_msg[:200]}")

    video_id = response.get("id", "")
    return {
        "youtube_video_id": video_id,
        "youtube_url": f"https://youtu.be/{video_id}",
    }


# ---------------------------------------------------------------------------
# AI metadata
# ---------------------------------------------------------------------------


class AIMetadataRequest(BaseModel):
    project_id: str
    llm_provider: str | None = None
    llm_model: str | None = None


@router.post("/ai-metadata")
async def generate_ai_metadata(req: AIMetadataRequest, db: AsyncSession = Depends(get_db)):
    """Generate AI-powered YouTube title, description, and tags."""
    from backend.services.ai_client import chat_completion

    result = await db.execute(select(Project).where(Project.id == req.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    count_result = await db.execute(
        select(func.count()).select_from(Scene).where(Scene.project_id == req.project_id)
    )
    scene_count = int(count_result.scalar_one())

    settings = get_settings()
    proj_settings = project.settings or {}
    provider = req.llm_provider or proj_settings.get("llm_provider") or settings.default_llm_provider
    model = req.llm_model or proj_settings.get("llm_model") or settings.default_llm_model

    script_summary = (project.script or "")[:500]

    system_prompt = (
        "You are a YouTube metadata expert for short-form videos. "
        "Generate optimized metadata for maximum discoverability on YouTube. "
        "Respond ONLY with valid JSON, no markdown fences or extra text."
    )

    user_prompt = (
        f"Generate a YouTube title, description, and tags for this video:\n"
        f"- Video topic: {project.title}\n"
        f"- Story type: {project.story_type}\n"
        f"- Script summary: {script_summary}\n"
        f"- Number of scenes: {scene_count}\n\n"
        f'Respond in this JSON format: {{"title": "...", "description": "...", "tags": ["...", ...]}}\n\n'
        f"Rules:\n"
        f"- Title: max 100 characters, engaging, includes relevant keywords\n"
        f"- Description: 2-4 paragraphs with a hook, relevant keywords, and a call to action\n"
        f"- Tags: 5-15 relevant tags, mix of broad and specific keywords"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        raw = await chat_completion(messages, provider, model, temperature=0.7, max_tokens=1024)
    except Exception as exc:
        logger.exception("AI metadata generation failed")
        raise HTTPException(502, f"LLM call failed: {str(exc)[:200]}")

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("AI returned non-JSON metadata: %s", cleaned[:200])
        return {
            "title": project.title,
            "description": cleaned[:2000],
            "tags": [],
        }

    return {
        "title": str(data.get("title", project.title))[:100],
        "description": str(data.get("description", ""))[:5000],
        "tags": [str(t) for t in data.get("tags", [])][:15],
    }
