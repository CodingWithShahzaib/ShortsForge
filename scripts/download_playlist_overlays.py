"""Download a YouTube playlist into backend/media/overlays (requires yt-dlp: pip install yt-dlp).

  python scripts/download_playlist_overlays.py
  python scripts/download_playlist_overlays.py "https://www.youtube.com/playlist?list=..."
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "media" / "overlays"
DEFAULT_PLAYLIST = "https://www.youtube.com/playlist?list=PLasPZ8IgpProGtwsBs3XS89LT9G_se164"


def main() -> int:
    try:
        import yt_dlp
    except ImportError:
        print("Install yt-dlp: pip install yt-dlp", file=sys.stderr)
        return 1

    playlist = sys.argv[1].strip() if len(sys.argv) > 1 else DEFAULT_PLAYLIST
    OUT.mkdir(parents=True, exist_ok=True)
    opts = {
        "outtmpl": str(OUT / "pl_%(playlist_index)03d_%(title)s.%(ext)s"),
        "restrict_filenames": True,
        "ignoreerrors": True,
        "nooverwrites": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([playlist])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
