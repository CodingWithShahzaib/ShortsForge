from __future__ import annotations

import asyncio
import logging
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, Coroutine

from backend.config import get_settings

logger = logging.getLogger(__name__)


def find_ffmpeg() -> str:
    settings = get_settings()
    if settings.ffmpeg_path and shutil.which(settings.ffmpeg_path):
        return settings.ffmpeg_path
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    bundled = Path(__file__).resolve().parent.parent.parent / "resources" / "ffmpeg" / "ffmpeg.exe"
    if bundled.exists():
        return str(bundled)
    raise FileNotFoundError("FFmpeg not found. Install it or set FFMPEG_PATH.")


def find_ffprobe() -> str:
    ffmpeg_path = find_ffmpeg()
    ffprobe = Path(ffmpeg_path).parent / "ffprobe.exe"
    if ffprobe.exists():
        return str(ffprobe)
    ffprobe = Path(ffmpeg_path).parent / "ffprobe"
    if ffprobe.exists():
        return str(ffprobe)
    system = shutil.which("ffprobe")
    if system:
        return system
    raise FileNotFoundError("FFprobe not found.")


def _get_duration_sync(file_path: str) -> float:
    """Sync subprocess call - works on Windows without ProactorEventLoop."""
    ffprobe = find_ffprobe()
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", file_path],
        capture_output=True,
        text=True,
    )
    try:
        return float(result.stdout.strip()) if result.stdout else 0.0
    except ValueError:
        return 0.0


async def get_duration(file_path: str) -> float:
    return await asyncio.to_thread(_get_duration_sync, file_path)


def _run_ffmpeg_sync(cmd: list[str]) -> tuple[int, str]:
    """Sync subprocess call - works on Windows without ProactorEventLoop."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stderr or ""


async def run_ffmpeg(
    args: list[str],
    on_progress: Callable[[float], Coroutine[Any, Any, None]] | None = None,
    total_duration: float | None = None,
) -> int:
    """Run FFmpeg with progress parsing."""
    ffmpeg = find_ffmpeg()
    cmd = [ffmpeg, "-y", "-hide_banner", "-nostdin"] + args
    # Skip -progress when using sync subprocess (progress parsing needs async pipes)
    if on_progress and total_duration and total_duration > 0:
        pass  # Progress not supported with sync subprocess fallback

    logger.info("FFmpeg: %s", " ".join(cmd))
    returncode, stderr = await asyncio.to_thread(_run_ffmpeg_sync, cmd)
    if returncode != 0:
        err_text = (stderr or "")[-2000:]
        logger.error("FFmpeg failed (code %d): %s", returncode, err_text)
        raise RuntimeError(f"FFmpeg failed with code {returncode}: {err_text}")
    return returncode


async def _parse_progress(
    proc: asyncio.subprocess.Process,
    on_progress: Callable[[float], Coroutine[Any, Any, None]],
    total_duration: float,
) -> None:
    try:
        while proc.stdout and not proc.stdout.at_eof():
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").strip()
            if text.startswith("out_time_us="):
                try:
                    us = int(text.split("=")[1])
                    pct = min((us / 1_000_000) / total_duration * 100, 100)
                    await on_progress(pct)
                except (ValueError, ZeroDivisionError):
                    pass
    except Exception:
        pass


async def create_image_clip(
    image_path: str,
    duration: float,
    output_path: str,
    width: int = 1080,
    height: int = 1920,
    transition: str = "none",
    fps: int = 30,
) -> str:
    """Create a video clip from a still image with optional Ken Burns effect."""
    filter_parts = [f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                    f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"]

    if transition in ("zoom_in", "zoom_out"):
        zoom_start = "1" if transition == "zoom_in" else "1.3"
        zoom_end = "1.3" if transition == "zoom_in" else "1"
        filter_parts = [
            f"scale={width*2}:{height*2}:force_original_aspect_ratio=decrease",
            f"pad={width*2}:{height*2}:(ow-iw)/2:(oh-ih)/2:black",
            f"zoompan=z='if(eq(on,0),{zoom_start},{zoom_start}+(({zoom_end}-{zoom_start})*on/({duration}*{fps})))'"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={int(duration*fps)}:s={width}x{height}:fps={fps}",
        ]
    elif transition in ("pan_left", "pan_right"):
        direction = "on" if transition == "pan_right" else f"({int(duration*fps)}-on)"
        filter_parts = [
            f"scale={int(width*1.3)}:{height}:force_original_aspect_ratio=decrease",
            f"pad={int(width*1.3)}:{height}:(ow-iw)/2:(oh-ih)/2:black",
            f"zoompan=z=1:x='{direction}*{int(width*0.3)}/{int(duration*fps)}'"
            f":y='0':d={int(duration*fps)}:s={width}x{height}:fps={fps}",
        ]
    elif transition in ("pan_up", "pan_down"):
        direction = "on" if transition == "pan_down" else f"({int(duration*fps)}-on)"
        filter_parts = [
            f"scale={width}:{int(height*1.3)}:force_original_aspect_ratio=decrease",
            f"pad={width}:{int(height*1.3)}:(ow-iw)/2:(oh-ih)/2:black",
            f"zoompan=z=1:x='0'"
            f":y='{direction}*{int(height*0.3)}/{int(duration*fps)}'"
            f":d={int(duration*fps)}:s={width}x{height}:fps={fps}",
        ]
    else:
        filter_parts.append(f"fps={fps}")

    vf = ",".join(filter_parts)
    args = [
        "-loop", "1", "-i", image_path,
        "-vf", vf,
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


async def concat_with_transitions(
    clip_paths: list[str],
    transition_types: list[str],
    output_path: str,
    transition_duration: float = 0.5,
    on_progress: Callable[[float], Coroutine[Any, Any, None]] | None = None,
) -> str:
    """Concatenate video clips with xfade transitions using filter_complex."""
    if len(clip_paths) == 1:
        import shutil as _shutil
        _shutil.copy2(clip_paths[0], output_path)
        return output_path

    durations = [await get_duration(p) for p in clip_paths]
    total_dur = sum(durations) - transition_duration * (len(clip_paths) - 1)

    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    filter_parts = []
    current = "[0:v]"
    for i in range(1, len(clip_paths)):
        trans = transition_types[i - 1] if i - 1 < len(transition_types) else "fade"
        xfade_trans = _map_transition(trans)
        offset = sum(durations[:i]) - transition_duration * i
        out_label = f"[v{i}]"
        next_input = f"[{i}:v]"
        filter_parts.append(
            f"{current}{next_input}xfade=transition={xfade_trans}"
            f":duration={transition_duration}:offset={offset:.3f}{out_label}"
        )
        current = out_label

    filter_complex = ";".join(filter_parts)
    args = inputs + [
        "-filter_complex", filter_complex,
        "-map", current,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    await run_ffmpeg(args, on_progress, total_dur)
    return output_path


def _map_transition(name: str) -> str:
    mapping = {
        "fade": "fade",
        "dissolve": "dissolve",
        "wipeleft": "wipeleft",
        "wiperight": "wiperight",
        "slideup": "slideup",
        "slidedown": "slidedown",
        "slideleft": "slideleft",
        "slideright": "slideright",
        "circleopen": "circleopen",
        "circleclose": "circleclose",
        "zoom_in": "fade",
        "zoom_out": "fade",
        "pan_left": "slideleft",
        "pan_right": "slideright",
        "pan_up": "slideup",
        "pan_down": "slidedown",
    }
    return mapping.get(name, "fade")


async def add_audio_to_video(
    video_path: str,
    audio_path: str,
    output_path: str,
) -> str:
    args = [
        "-i", video_path, "-i", audio_path,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


async def mix_background_music(
    video_path: str,
    music_path: str,
    output_path: str,
    music_volume: float = 0.15,
) -> str:
    args = [
        "-i", video_path, "-i", music_path,
        "-filter_complex",
        f"[1:a]volume={music_volume}[bg];[0:a][bg]amix=inputs=2:duration=first[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


async def overlay_subtitles(
    video_path: str,
    subtitle_path: str,
    output_path: str,
) -> str:
    sub_path_escaped = subtitle_path.replace("\\", "/").replace(":", "\\:")
    args = [
        "-i", video_path,
        "-vf", f"ass='{sub_path_escaped}'",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


async def concat_audio_files(audio_paths: list[str], output_path: str) -> str:
    """Concatenate multiple audio files into one."""
    if len(audio_paths) == 1:
        import shutil as _shutil
        _shutil.copy2(audio_paths[0], output_path)
        return output_path

    inputs = []
    filter_parts = []
    for i, p in enumerate(audio_paths):
        inputs.extend(["-i", p])
        filter_parts.append(f"[{i}:a]")

    filter_complex = "".join(filter_parts) + f"concat=n={len(audio_paths)}:v=0:a=1[aout]"
    args = inputs + ["-filter_complex", filter_complex, "-map", "[aout]", output_path]
    await run_ffmpeg(args)
    return output_path
