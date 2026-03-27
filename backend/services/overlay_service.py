from __future__ import annotations

import re
import uuid
from pathlib import Path

from backend.config import get_settings

# Files placed in media/overlays (PNG/WebP with alpha, looping WebM, etc.)
IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
VIDEO_EXTS = frozenset({".webm", ".mov", ".mp4", ".mkv", ".gif"})
ALLOWED_EXTS = IMAGE_EXTS | VIDEO_EXTS

# Browser-like client — many CDNs block or throttle non-browser User-Agents.
OVERLAY_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "image/avif,image/webp,image/apng,image/*,video/webm,video/mp4,video/*,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def guess_overlay_extension_from_bytes(data: bytes) -> str | None:
    """Infer .png / .webm / etc. from file signatures when URL or Content-Type is ambiguous."""
    if not data or len(data) < 12:
        return None
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return ".gif"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return ".webp"
    if data[4:8] == b"ftyp":
        return ".mp4"
    if data[0:4] == b"\x1a\x45\xdf\xa3":
        head = data[:8192].lower()
        if b"webm" in head:
            return ".webm"
        if b"matroska" in head:
            return ".mkv"
        return ".webm"
    return None


def overlay_ext_from_content_type(ct: str | None) -> str | None:
    """Map Content-Type to a file extension, or None if unknown / must sniff bytes."""
    if not ct:
        return None
    base = ct.split(";")[0].strip().lower()
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/mp4": ".mp4",
        "application/mp4": ".mp4",
        "video/x-matroska": ".mkv",
        "video/matroska": ".mkv",
    }.get(base)


def get_overlays_dir() -> Path:
    return Path(get_settings().media_dir) / "overlays"


def ensure_overlays_dir() -> Path:
    d = get_overlays_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def sanitize_stored_filename(name: str) -> str:
    """Safe filename for disk (no path segments)."""
    base = Path(name).name.strip()
    if not base or ".." in base:
        raise ValueError("Invalid filename")
    if not re.match(r"^[a-zA-Z0-9._\- ()\[\]]+$", base):
        raise ValueError("Filename may only contain letters, numbers, spaces, ._-[]()")
    suf = Path(base).suffix.lower()
    if suf not in ALLOWED_EXTS:
        raise ValueError(f"Unsupported type {suf!r}; allowed: {sorted(ALLOWED_EXTS)}")
    return base


def resolve_overlay_file(overlay_id: str | None) -> Path | None:
    """Return absolute path if overlay_id names a file under overlays dir."""
    if not overlay_id or not isinstance(overlay_id, str):
        return None
    oid = overlay_id.strip()
    if oid.lower() in ("", "none", "null"):
        return None
    base = Path(oid).name
    if not base or ".." in base:
        return None
    root = ensure_overlays_dir().resolve()
    p = (root / base).resolve()
    try:
        p.relative_to(root)
    except ValueError:
        return None
    if not p.is_file():
        return None
    return p


def list_overlays() -> list[dict[str, str]]:
    """Scan media/overlays for compositable assets."""
    root = ensure_overlays_dir()
    out: list[dict[str, str]] = []
    for p in sorted(root.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext not in ALLOWED_EXTS:
            continue
        kind = "video" if ext in VIDEO_EXTS else "image"
        out.append(
            {
                "id": p.name,
                "filename": p.name,
                "kind": kind,
            }
        )
    return out


def unique_filename(original: str) -> str:
    """Avoid collisions while keeping extension."""
    base = sanitize_stored_filename(original)
    p = ensure_overlays_dir() / base
    if not p.exists():
        return base
    stem = Path(base).stem
    ext = Path(base).suffix
    for _ in range(50):
        candidate = f"{stem}_{uuid.uuid4().hex[:6]}{ext}"
        if not (ensure_overlays_dir() / candidate).exists():
            return candidate
    return f"{stem}_{uuid.uuid4().hex}{ext}"
