from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from backend.schemas.video_settings import SafeZoneConfig, default_safe_zone_presets
from backend.services.ai_client import transcribe_audio

logger = logging.getLogger(__name__)


def _time_to_ass(seconds: float) -> str:
    """Convert seconds to ASS timestamp (H:MM:SS.CC)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_alpha_from_opacity(opacity: float) -> str:
    clamped = max(0.0, min(1.0, float(opacity)))
    alpha = int(round((1.0 - clamped) * 255))
    return f"{alpha:02X}"


def _resolve_safe_zone_config(
    *,
    safe_zone_platform: str,
    safe_zone_config: dict[str, Any] | None = None,
) -> SafeZoneConfig:
    presets = default_safe_zone_presets()
    preset = presets.get(safe_zone_platform, presets["tiktok"])
    if not safe_zone_config:
        return preset
    payload = dict(safe_zone_config)
    payload["platform"] = preset.platform
    return SafeZoneConfig.model_validate(payload)


def _subtitle_ass_margins(
    *,
    position: str,
    video_width: int,
    video_height: int,
    safe_zone_enabled: bool,
    safe_zone_platform: str,
    safe_zone_config: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    if position == "center":
        return ("20", "20", "0")
    if not safe_zone_enabled:
        return ("20", "20", "80" if position == "bottom" else "60")
    preset = _resolve_safe_zone_config(
        safe_zone_platform=safe_zone_platform,
        safe_zone_config=safe_zone_config,
    )
    margin_l = str(max(20, int(video_width * preset.caption_band_left_pct)))
    margin_r = str(max(20, int(video_width * preset.caption_band_right_pct)))
    if position == "top":
        return (
            margin_l,
            margin_r,
            str(int(max(24, video_height * preset.caption_band_top_pct))),
        )
    band_bottom = int(video_height * preset.caption_band_bottom_pct)
    return (margin_l, margin_r, str(max(36, video_height - band_bottom)))


def generate_ass_subtitles(
    words: list[dict[str, Any]],
    font_name: str = "Arial",
    font_size: int = 18,
    primary_color: str = "&H00FFFFFF",
    highlight_color: str = "&H0000FFFF",
    outline_color: str = "&H00000000",
    position: str = "bottom",
    video_width: int = 1080,
    video_height: int = 1920,
    words_per_group: int = 4,
    background_opacity: float = 0.65,
    shadow_enabled: bool = True,
    shadow_strength: float = 0.85,
    safe_zone_enabled: bool = True,
    safe_zone_platform: str = "tiktok",
    safe_zone_config: dict[str, Any] | None = None,
    word_pop_enabled: bool = False,
) -> str:
    """Generate ASS subtitle content with word-level highlighting."""
    alignment = "2" if position == "bottom" else "8" if position == "top" else "5"
    margin_l, margin_r, margin_v = _subtitle_ass_margins(
        position=position,
        video_width=video_width,
        video_height=video_height,
        safe_zone_enabled=safe_zone_enabled,
        safe_zone_platform=safe_zone_platform,
        safe_zone_config=safe_zone_config,
    )
    background_alpha = _ass_alpha_from_opacity(background_opacity)
    highlight_size = int(round(font_size * (1.08 if word_pop_enabled else 1.0)))
    shadow_value = max(0, min(4, int(round(shadow_strength * 2)))) if shadow_enabled else 0

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {video_width}\n"
        f"PlayResY: {video_height}\n"
        "WrapStyle: 0\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{font_name},{font_size},{primary_color},&H000000FF,"
        f"{outline_color},&H{background_alpha}000000,-1,0,0,0,100,100,0,0,3,1.8,{shadow_value},"
        f"{alignment},{margin_l},{margin_r},{margin_v},1\n"
        f"Style: Highlight,{font_name},{highlight_size},{highlight_color},&H000000FF,"
        f"{outline_color},&H{background_alpha}000000,-1,0,0,0,100,100,0,0,3,2.2,{shadow_value},"
        f"{alignment},{margin_l},{margin_r},{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events = []
    groups = _group_words(words, words_per_group)

    for group in groups:
        if not group:
            continue
        start = group[0].get("start", 0)
        end = group[-1].get("end", start + 1)
        start_ts = _time_to_ass(start)
        end_ts = _time_to_ass(end)

        for i, word_info in enumerate(group):
            text_parts = []
            for j, w in enumerate(group):
                word_text = w.get("word", w.get("text", ""))
                if j == i:
                    text_parts.append(r"{\rHighlight}" + word_text + r"{\rDefault}")
                else:
                    text_parts.append(word_text)

            w_start = word_info.get("start", start)
            w_end = word_info.get("end", w_start + 0.3)
            line = (
                f"Dialogue: 0,{_time_to_ass(w_start)},{_time_to_ass(w_end)},"
                f"Default,,0,0,0,,{' '.join(text_parts)}"
            )
            events.append(line)

    return header + "\n".join(events) + "\n"


def _group_words(words: list[dict], size: int) -> list[list[dict]]:
    return [words[i : i + size] for i in range(0, len(words), size)]


def _escape_ass_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def generate_ass_from_scene_texts(
    scenes: list[dict[str, Any]],
    font_name: str = "Arial",
    font_size: int = 18,
    primary_color: str = "&H00FFFFFF",
    position: str = "bottom",
    video_width: int = 1080,
    video_height: int = 1920,
    words_per_group: int = 4,
    scene_starts: list[float] | None = None,
    background_opacity: float = 0.65,
    shadow_enabled: bool = True,
    shadow_strength: float = 0.85,
    safe_zone_enabled: bool = True,
    safe_zone_platform: str = "tiktok",
    safe_zone_config: dict[str, Any] | None = None,
) -> str:
    """Generate ASS subtitle content from pre-defined scene texts and durations.
    Each scene's caption uses narration (spoken text) when present, else subtitle.
    Used when subtitle_source=llm."""
    alignment = "2" if position == "bottom" else "8" if position == "top" else "5"
    margin_l, margin_r, margin_v = _subtitle_ass_margins(
        position=position,
        video_width=video_width,
        video_height=video_height,
        safe_zone_enabled=safe_zone_enabled,
        safe_zone_platform=safe_zone_platform,
        safe_zone_config=safe_zone_config,
    )
    background_alpha = _ass_alpha_from_opacity(background_opacity)
    shadow_value = max(0, min(4, int(round(shadow_strength * 2)))) if shadow_enabled else 0

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {video_width}\n"
        f"PlayResY: {video_height}\n"
        "WrapStyle: 0\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{font_name},{font_size},{primary_color},&H000000FF,"
        f"&H00000000,&H{background_alpha}000000,-1,0,0,0,100,100,0,0,3,1.8,{shadow_value},"
        f"{alignment},{margin_l},{margin_r},{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events = []
    current_time = 0.0
    for idx, sc in enumerate(scenes):
        text = (sc.get("narration") or "").strip() or (sc.get("subtitle") or "").strip()
        duration = float(sc.get("duration", 5.0))
        scene_start = (
            float(scene_starts[idx])
            if scene_starts is not None and idx < len(scene_starts)
            else current_time
        )
        if not text or duration <= 0:
            current_time = scene_start + duration
            continue
        raw_words = re.findall(r"\S+", text)
        if not raw_words:
            current_time = scene_start + duration
            continue
        group_size = max(2, int(words_per_group or 4))
        groups = [raw_words[i : i + group_size] for i in range(0, len(raw_words), group_size)]
        chunk_duration = duration / max(1, len(groups))
        for group_idx, group in enumerate(groups):
            chunk_start = scene_start + group_idx * chunk_duration
            chunk_end = scene_start + (group_idx + 1) * chunk_duration
            start_ts = _time_to_ass(chunk_start)
            end_ts = _time_to_ass(chunk_end)
            text_escaped = _escape_ass_text(" ".join(group))
            line = f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text_escaped}"
            events.append(line)
        current_time = scene_start + duration

    return header + "\n".join(events) + "\n"


async def generate_subtitles_from_audio(
    audio_path: str,
    output_path: str,
    font_name: str = "Arial",
    font_size: int = 18,
    primary_color: str = "&H00FFFFFF",
    highlight_color: str = "&H0000FFFF",
    position: str = "bottom",
    video_width: int = 1080,
    video_height: int = 1920,
    transcription_provider: str | None = None,
    transcription_language: str = "en",
    words_per_group: int = 4,
    background_opacity: float = 0.65,
    shadow_enabled: bool = True,
    shadow_strength: float = 0.85,
    safe_zone_enabled: bool = True,
    safe_zone_platform: str = "tiktok",
    safe_zone_config: dict[str, Any] | None = None,
    word_pop_enabled: bool = False,
) -> str:
    """Transcribe audio and generate ASS subtitle file."""
    result = await transcribe_audio(
        audio_path,
        provider=transcription_provider,
        language=transcription_language,
    )
    words = result.get("words", [])
    if not words and result.get("segments"):
        for seg in result["segments"]:
            if seg.get("words"):
                words.extend(seg["words"])

    if not words:
        logger.warning("No word-level timestamps found, falling back to segments")
        for seg in result.get("segments", []):
            words.append({
                "word": seg.get("text", ""),
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
            })

    ass_content = generate_ass_subtitles(
        words=words,
        font_name=font_name,
        font_size=font_size,
        primary_color=primary_color,
        highlight_color=highlight_color,
        position=position,
        video_width=video_width,
        video_height=video_height,
        words_per_group=words_per_group,
        background_opacity=background_opacity,
        shadow_enabled=shadow_enabled,
        shadow_strength=shadow_strength,
        safe_zone_enabled=safe_zone_enabled,
        safe_zone_platform=safe_zone_platform,
        safe_zone_config=safe_zone_config,
        word_pop_enabled=word_pop_enabled,
    )

    Path(output_path).write_text(ass_content, encoding="utf-8")
    return output_path


def _words_from_transcription_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    words = list(result.get("words", []) or [])
    if not words and result.get("segments"):
        for seg in result["segments"]:
            if seg.get("words"):
                words.extend(seg["words"])
    if not words:
        for seg in result.get("segments", []):
            words.append({
                "word": seg.get("text", ""),
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
            })
    return words


async def generate_subtitles_from_scene_audios(
    audio_paths: list[str],
    scene_durations: list[float],
    output_path: str,
    font_name: str = "Arial",
    font_size: int = 18,
    primary_color: str = "&H00FFFFFF",
    highlight_color: str = "&H0000FFFF",
    position: str = "bottom",
    video_width: int = 1080,
    video_height: int = 1920,
    transcription_provider: str | None = None,
    transcription_language: str = "en",
    words_per_group: int = 4,
    scene_starts: list[float] | None = None,
    background_opacity: float = 0.65,
    shadow_enabled: bool = True,
    shadow_strength: float = 0.85,
    safe_zone_enabled: bool = True,
    safe_zone_platform: str = "tiktok",
    safe_zone_config: dict[str, Any] | None = None,
    word_pop_enabled: bool = False,
) -> str:
    """
    Generate ASS subtitles by transcribing each scene audio independently.

    This guarantees word timestamps are constrained to each scene time window and
    prevents next-scene captions from appearing during the previous scene.
    """
    all_words: list[dict[str, Any]] = []
    current_time = 0.0

    for idx, audio_path in enumerate(audio_paths):
        scene_duration = float(scene_durations[idx]) if idx < len(scene_durations) else 0.0
        if scene_duration <= 0:
            continue
        result = await transcribe_audio(
            audio_path,
            provider=transcription_provider,
            language=transcription_language,
        )
        scene_words = _words_from_transcription_result(result)
        if not scene_words:
            logger.warning("No timestamps found for scene audio index %s", idx)
            current_time += scene_duration
            continue

        scene_start = (
            float(scene_starts[idx])
            if scene_starts is not None and idx < len(scene_starts)
            else current_time
        )
        scene_end = current_time + scene_duration
        if scene_starts is not None and idx < len(scene_starts):
            scene_end = scene_start + scene_duration
        for w in scene_words:
            word_text = (w.get("word") or w.get("text") or "").strip()
            if not word_text:
                continue
            w_start = max(0.0, float(w.get("start", 0.0)))
            w_end = max(w_start, float(w.get("end", w_start + 0.2)))
            abs_start = min(scene_end, scene_start + w_start)
            abs_end = min(scene_end, scene_start + w_end)
            if abs_end <= abs_start:
                abs_end = min(scene_end, abs_start + 0.12)
            if abs_end <= abs_start:
                continue
            all_words.append({
                "word": word_text,
                "start": abs_start,
                "end": abs_end,
            })
        current_time = scene_end

    ass_content = generate_ass_subtitles(
        words=all_words,
        font_name=font_name,
        font_size=font_size,
        primary_color=primary_color,
        highlight_color=highlight_color,
        position=position,
        video_width=video_width,
        video_height=video_height,
        words_per_group=words_per_group,
        background_opacity=background_opacity,
        shadow_enabled=shadow_enabled,
        shadow_strength=shadow_strength,
        safe_zone_enabled=safe_zone_enabled,
        safe_zone_platform=safe_zone_platform,
        safe_zone_config=safe_zone_config,
        word_pop_enabled=word_pop_enabled,
    )
    Path(output_path).write_text(ass_content, encoding="utf-8")
    return output_path
