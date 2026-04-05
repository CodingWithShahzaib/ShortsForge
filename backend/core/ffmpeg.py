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


def build_audio_trim_filter(target_seconds: float, start_seconds: float = 0.0) -> str:
    """Build FFmpeg audio trim/pad filter with optional start offset."""
    safe_target = max(0.1, float(target_seconds))
    safe_start = max(0.0, float(start_seconds))
    end = safe_start + safe_target
    t_start = f"{safe_start:.6f}"
    t_end = f"{end:.6f}"
    t_target = f"{safe_target:.6f}"
    return f"atrim={t_start}:{t_end},asetpts=PTS-STARTPTS,apad=whole_dur={t_target}"


async def pad_or_trim_audio(
    audio_path: str,
    target_seconds: float,
    output_path: str,
    *,
    start_seconds: float = 0.0,
) -> str:
    """Trim or pad audio to exactly target_seconds (silence pad if shorter)."""
    af = build_audio_trim_filter(target_seconds, start_seconds)
    args = [
        "-i", audio_path,
        "-af", af,
        "-map", "0:a",
        "-c:a", "libmp3lame", "-q:a", "2",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


def normalize_transition(name: str | None) -> str:
    """Map LLM/UI variants to canonical ids used by create_image_clip and xfade."""
    if not name or not isinstance(name, str):
        return "fade"
    n = name.strip().lower().replace(" ", "_").replace("-", "_")
    aliases: dict[str, str] = {
        "wipe_left": "wipeleft",
        "wipe_right": "wiperight",
        "wipe_up": "wipeup",
        "wipe_down": "wipedown",
        "slide_up": "slideup",
        "slide_down": "slidedown",
        "slide_left": "slideleft",
        "slide_right": "slideright",
        "cross_fade": "crossfade",
        "fade_in_out": "fade_in_fade_out",
        "fadein_fadeout": "fade_in_fade_out",
        "fade_out_in": "fade_in_fade_out",
        "zoom_in_out": "zoom_in_zoom_out",
        "zoomin_zoomout": "zoom_in_zoom_out",
        "zoom_out_in": "zoom_in_zoom_out",
        "circle_open": "circleopen",
        "circle_close": "circleclose",
        "zoomin": "zoom_in",
        "zoomout": "zoom_out",
        "ken_burns_in": "zoom_in",
        "ken_burns_out": "zoom_out",
        "pan": "pan_left",
        "none": "none",
    }
    return aliases.get(n, n)


def resolve_scene_transition(name: str | None, *, scene_index: int = 0) -> str:
    """Resolve scene-level transition aliases, including alternating custom modes."""
    t = normalize_transition(name)
    if t == "zoom_in_zoom_out":
        return "zoom_in" if scene_index % 2 == 0 else "zoom_out"
    if t == "fade_in_fade_out":
        return "fade"
    return t


def clamp_xfade_duration(durations: list[float], requested: float = 0.5) -> float:
    """Avoid xfade longer than clips (short narration)."""
    if not durations:
        return max(0.05, min(requested, 0.5))
    m = min(durations)
    cap = max(0.05, min(m * 0.35, 0.8))
    return max(0.05, min(requested, cap))


async def concat_video_simple(clip_paths: list[str], output_path: str) -> str:
    """Concatenate video clips back-to-back (no xfade overlap; lengths sum for A/V sync)."""
    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return output_path

    inputs: list[str] = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    n = len(clip_paths)
    ins = "".join(f"[{i}:v]" for i in range(n))
    filter_complex = f"{ins}concat=n={n}:v=1:a=0[outv]"
    args = inputs + [
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    total_dur = sum(await asyncio.gather(*[get_duration(p) for p in clip_paths]))
    await run_ffmpeg(args, None, total_dur)
    return output_path


async def merge_audio_to_video_matched(
    video_path: str,
    audio_path: str,
    output_path: str,
) -> str:
    """Mux audio to video; trim or pad audio to the video duration (no -shortest cut)."""
    vd = await get_duration(video_path)
    if vd <= 0:
        vd = await get_duration(audio_path)
    t = f"{max(vd, 0.01):.6f}"
    args = [
        "-i", video_path,
        "-i", audio_path,
        "-filter_complex", f"[1:a]atrim=0:{t},apad=whole_dur={t}[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


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
    motion_effect: str | None = None,
    ken_burns_enabled: bool = False,
    ken_burns_zoom_percent: float = 2.5,
    breathing_enabled: bool = False,
    breathing_amplitude: float = 1.5,
    breathing_speed: float = 0.25,
) -> str:
    """Create a video clip from a still image with optional Ken Burns and breathing effects."""
    transition = normalize_transition(transition)
    motion = normalize_transition(motion_effect or "")
    if motion not in ("zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"):
        if transition in ("zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"):
            motion = transition
        elif ken_burns_enabled:
            motion = "zoom_in"
    zoom_gain = max(0.0, min(float(ken_burns_zoom_percent or 0.0), 8.0)) / 100.0
    breath_amp = max(0.0, min(float(breathing_amplitude or 0.0), 5.0)) / 100.0
    breath_freq = max(0.05, min(float(breathing_speed or 0.25), 1.0))

    filter_parts = [f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                    f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"]

    if motion in ("zoom_in", "zoom_out"):
        zoom_end_value = max(1.01, 1.0 + zoom_gain)
        zoom_start = "1" if motion == "zoom_in" else f"{zoom_end_value:.4f}"
        zoom_end = f"{zoom_end_value:.4f}" if motion == "zoom_in" else "1"
        total_frames = int(duration * fps)
        if breathing_enabled:
            # Ken Burns zoom/pan + breathing pulse layered together
            breath_expr = f"+{breath_amp}*sin(2*PI*{breath_freq}*on/{fps})"
            zoom_expr = f"if(eq(on,0),{zoom_start},{zoom_start}+(({zoom_end}-{zoom_start})*on/{total_frames}){breath_expr})"
        else:
            zoom_expr = f"if(eq(on,0),{zoom_start},{zoom_start}+(({zoom_end}-{zoom_start})*on/{total_frames}))"
        filter_parts = [
            f"scale={width*2}:{height*2}:force_original_aspect_ratio=decrease",
            f"pad={width*2}:{height*2}:(ow-iw)/2:(oh-ih)/2:black",
            f"zoompan=z='{zoom_expr}'"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={total_frames}:s={width}x{height}:fps={fps}",
        ]
    elif motion in ("pan_left", "pan_right"):
        direction = "on" if motion == "pan_right" else f"({int(duration*fps)}-on)"
        total_frames = int(duration * fps)
        if breathing_enabled:
            # Breathing adds a subtle zoom pulse on top of the pan
            breath_factor = 1.0 + breath_amp
            filter_parts = [
                f"scale={int(width*1.3*breath_factor)}:{int(height*breath_factor)}:force_original_aspect_ratio=decrease",
                f"pad={int(width*1.3*breath_factor)}:{int(height*breath_factor)}:(ow-iw)/2:(oh-ih)/2:black",
                f"zoompan=z='if(eq(on,0),{breath_factor},{breath_factor}+{breath_amp}*sin(2*PI*{breath_freq}*on/{fps})/{breath_factor})'"
                f":x='{direction}*{int(width*0.3)}/{total_frames}'"
                f":y='ih/2-(ih/zoom/2)':d={total_frames}:s={width}x{height}:fps={fps}",
            ]
        else:
            filter_parts = [
                f"scale={int(width*1.3)}:{height}:force_original_aspect_ratio=decrease",
                f"pad={int(width*1.3)}:{height}:(ow-iw)/2:(oh-ih)/2:black",
                f"zoompan=z=1:x='{direction}*{int(width*0.3)}/{int(duration*fps)}'"
                f":y='0':d={int(duration*fps)}:s={width}x{height}:fps={fps}",
            ]
    elif motion in ("pan_up", "pan_down"):
        direction = "on" if motion == "pan_down" else f"({int(duration*fps)}-on)"
        total_frames = int(duration * fps)
        if breathing_enabled:
            breath_factor = 1.0 + breath_amp
            filter_parts = [
                f"scale={int(width*breath_factor)}:{int(height*1.3*breath_factor)}:force_original_aspect_ratio=decrease",
                f"pad={int(width*breath_factor)}:{int(height*1.3*breath_factor)}:(ow-iw)/2:(oh-ih)/2:black",
                f"zoompan=z='if(eq(on,0),{breath_factor},{breath_factor}+{breath_amp}*sin(2*PI*{breath_freq}*on/{fps})/{breath_factor})'"
                f":x='iw/2-(iw/zoom/2)'"
                f":y='{direction}*{int(height*0.3)}/{total_frames}'"
                f":d={total_frames}:s={width}x{height}:fps={fps}",
            ]
        else:
            filter_parts = [
                f"scale={width}:{int(height*1.3)}:force_original_aspect_ratio=decrease",
                f"pad={width}:{int(height*1.3)}:(ow-iw)/2:(oh-ih)/2:black",
                f"zoompan=z=1:x='0'"
                f":y='{direction}*{int(height*0.3)}/{int(duration*fps)}'"
                f":d={int(duration*fps)}:s={width}x{height}:fps={fps}",
            ]
    elif breathing_enabled:
        # No Ken Burns motion, just breathing pulse on static image
        breath_base = 1.0 + breath_amp
        total_frames = int(duration * fps)
        zoom_expr = f"{breath_base}+{breath_amp}*sin(2*PI*{breath_freq}*on/{fps})"
        filter_parts = [
            f"scale={width*2}:{height*2}:force_original_aspect_ratio=decrease",
            f"pad={width*2}:{height*2}:(ow-iw)/2:(oh-ih)/2:black",
            f"zoompan=z='{zoom_expr}'"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={total_frames}:s={width}x{height}:fps={fps}",
        ]
    else:
        # Static hold; fade/dissolve/wipe/etc. are applied between clips (xfade), not on the still.
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
    try:
        await run_ffmpeg(args)
    except Exception:
        if motion_effect or ken_burns_enabled:
            fallback = [
                "-loop", "1", "-i", image_path,
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,fps={fps}",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-pix_fmt", "yuv420p",
                output_path,
            ]
            await run_ffmpeg(fallback)
        else:
            raise
    return output_path


async def concat_with_transitions(
    clip_paths: list[str],
    transition_types: list[str],
    output_path: str,
    transition_duration: float | list[float] = 0.5,
    on_progress: Callable[[float], Coroutine[Any, Any, None]] | None = None,
) -> str:
    """Concatenate video clips with xfade transitions using filter_complex."""
    if len(clip_paths) == 1:
        import shutil as _shutil
        _shutil.copy2(clip_paths[0], output_path)
        return output_path

    durations = [await get_duration(p) for p in clip_paths]
    n = len(clip_paths)
    if isinstance(transition_duration, list):
        boundary_durations = [
            max(0.0, min(float(transition_duration[i]), 2.0))
            if i < len(transition_duration)
            else 0.0
            for i in range(n - 1)
        ]
    else:
        t_dur = clamp_xfade_duration(durations, float(transition_duration))
        boundary_durations = [t_dur for _ in range(n - 1)]
    total_dur = max(0.1, sum(durations) - sum(boundary_durations))

    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    filter_parts = []
    current = "[0:v]"
    for i in range(1, n):
        trans = transition_types[i - 1] if i - 1 < len(transition_types) else "fade"
        xfade_trans = map_transition_to_xfade(trans, boundary_index=i - 1)
        d_i = boundary_durations[i - 1]
        offset = sum(durations[:i]) - sum(boundary_durations[:i])
        out_label = f"[v{i}]"
        next_input = f"[{i}:v]"
        if d_i <= 0:
            filter_parts.append(f"{current}{next_input}concat=n=2:v=1:a=0{out_label}")
        else:
            filter_parts.append(
                f"{current}{next_input}xfade=transition={xfade_trans}"
                f":duration={d_i:.4f}:offset={offset:.4f}{out_label}"
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


def map_transition_to_xfade(name: str | None, *, boundary_index: int = 0) -> str:
    """Map scene transition id to FFmpeg xfade transition name."""
    t = normalize_transition(name)
    if t == "fade_in_fade_out":
        # Alternate blend style on every boundary for a more rhythmic handoff.
        return "fadeblack" if boundary_index % 2 == 0 else "fade"
    mapping = {
        "fade": "fade",
        "dissolve": "dissolve",
        "wipeleft": "wipeleft",
        "wiperight": "wiperight",
        "wipeup": "wipeup",
        "wipedown": "wipedown",
        "slideup": "slideup",
        "slidedown": "slidedown",
        "slideleft": "slideleft",
        "slideright": "slideright",
        "circleopen": "circleopen",
        "circleclose": "circleclose",
        "circlecrop": "circlecrop",
        "crossfade": "fade",
        "glitch": "fade",
        # Ken Burns / pan: blend with a directional crossfade (motion is already in the clip)
        "zoom_in": "fade",
        "zoom_out": "fade",
        "zoom_in_zoom_out": "fade",
        "pan_left": "slideleft",
        "pan_right": "slideright",
        "pan_up": "slideup",
        "pan_down": "slidedown",
        "none": "fade",
        "cut": "fade",
    }
    return mapping.get(t, "fade")


async def concat_audio_with_crossfade(
    audio_paths: list[str],
    output_path: str,
    crossfade_duration: float | list[float],
) -> str:
    """Chain scene audio with acrossfade so total length matches xfade video concat."""
    if len(audio_paths) == 1:
        shutil.copy2(audio_paths[0], output_path)
        return output_path

    inputs: list[str] = []
    for p in audio_paths:
        inputs.extend(["-i", p])

    n = len(audio_paths)
    if isinstance(crossfade_duration, list):
        boundary_durations = [
            max(0.0, min(float(crossfade_duration[i]), 2.0))
            if i < len(crossfade_duration)
            else 0.0
            for i in range(n - 1)
        ]
    else:
        d = max(0.001, min(float(crossfade_duration), 2.0))
        boundary_durations = [d for _ in range(n - 1)]
    if n == 2:
        d = boundary_durations[0]
        if d <= 0:
            fc = "[0:a][1:a]concat=n=2:v=0:a=1[aout]"
        else:
            fc = f"[0:a][1:a]acrossfade=d={d:.4f}:c1=tri:c2=tri[aout]"
    else:
        parts: list[str] = []
        cur = "[0:a]"
        for i in range(1, n):
            nxt = f"[{i}:a]"
            out = f"[a{i}]" if i < n - 1 else "[aout]"
            d = boundary_durations[i - 1]
            if d <= 0:
                parts.append(f"{cur}{nxt}concat=n=2:v=0:a=1{out}")
            else:
                parts.append(f"{cur}{nxt}acrossfade=d={d:.4f}:c1=tri:c2=tri{out}")
            cur = out
        fc = ";".join(parts)

    args = inputs + [
        "-filter_complex", fc,
        "-map", "[aout]",
        "-c:a", "libmp3lame", "-q:a", "2",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


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
    ducking_enabled: bool = False,
    ducking_amount: float = -12.0,
) -> str:
    duck_gain = max(-30.0, min(-1.0, float(ducking_amount)))
    threshold = max(0.003, min(0.12, 10 ** (duck_gain / 20.0) * 0.12))
    filter_complex = (
        f"[1:a]volume={music_volume}[bg];"
        f"[bg][0:a]sidechaincompress=threshold={threshold:.4f}:ratio=10:attack=20:release=250[ducked];"
        f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
        if ducking_enabled
        else f"[1:a]volume={music_volume}[bg];[0:a][bg]amix=inputs=2:duration=first[aout]"
    )
    args = [
        "-i", video_path, "-i", music_path,
        "-filter_complex",
        filter_complex,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    await run_ffmpeg(args)
    return output_path


async def apply_visual_overlays(
    video_path: str,
    output_path: str,
    *,
    film_grain_enabled: bool = False,
    film_grain_intensity: float = 0.05,
    vignette_enabled: bool = False,
    vignette_intensity: float = 0.15,
) -> str:
    filter_parts: list[str] = []
    if film_grain_enabled:
        noise_strength = max(1, min(30, int(round(float(film_grain_intensity) * 255))))
        filter_parts.append(f"noise=alls={noise_strength}:allf=t+u")
    if vignette_enabled:
        angle = max(0.05, min(1.2, float(vignette_intensity) * 3.0))
        filter_parts.append(f"vignette=angle={angle:.3f}")
    if not filter_parts:
        shutil.copy2(video_path, output_path)
        return output_path
    args = [
        "-i", video_path,
        "-vf", ",".join(filter_parts),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
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


def _is_video_overlay_asset(overlay_path: str) -> bool:
    ext = Path(overlay_path).suffix.lower()
    return ext in (".webm", ".mov", ".mp4", ".mkv", ".gif")


async def overlay_asset_on_video(
    video_path: str,
    overlay_path: str,
    output_path: str,
    width: int,
    height: int,
) -> str:
    """Composite a full-frame image or looping video (e.g. alpha WebM) over the main video."""
    w, h = max(width, 1), max(height, 1)
    if _is_video_overlay_asset(overlay_path):
        inputs = [
            "-i", video_path,
            "-stream_loop", "-1",
            "-i", overlay_path,
        ]
        fc = (
            f"[1:v]scale={w}:{h}:flags=lanczos[ov];"
            f"[0:v][ov]overlay=0:0:shortest=1:format=auto[outv]"
        )
    else:
        inputs = ["-i", video_path, "-i", overlay_path]
        ext = Path(overlay_path).suffix.lower()
        scale = (
            f"[1:v]scale={w}:{h}:flags=lanczos,format=rgba[ov]"
            if ext in (".png", ".webp")
            else f"[1:v]scale={w}:{h}:flags=lanczos[ov]"
        )
        fc = f"{scale};[0:v][ov]overlay=0:0:format=auto[outv]"
    args = inputs + [
        "-filter_complex", fc,
        "-map", "[outv]",
        "-map", "0:a?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
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
