from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from backend.services.ai_client import transcribe_audio

logger = logging.getLogger(__name__)


def _time_to_ass(seconds: float) -> str:
    """Convert seconds to ASS timestamp (H:MM:SS.CC)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


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
) -> str:
    """Generate ASS subtitle content with word-level highlighting."""
    alignment = "2" if position == "bottom" else "8" if position == "top" else "5"
    margin_v = "80" if position == "bottom" else "60" if position == "top" else "0"

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
        f"{outline_color},&H80000000,-1,0,0,0,100,100,0,0,1,3,1,"
        f"{alignment},20,20,{margin_v},1\n"
        f"Style: Highlight,{font_name},{font_size},{highlight_color},&H000000FF,"
        f"{outline_color},&H80000000,-1,0,0,0,100,100,0,0,1,3,1,"
        f"{alignment},20,20,{margin_v},1\n\n"
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


def generate_ass_from_scene_texts(
    scenes: list[dict[str, Any]],
    font_name: str = "Arial",
    font_size: int = 18,
    primary_color: str = "&H00FFFFFF",
    position: str = "bottom",
    video_width: int = 1080,
    video_height: int = 1920,
) -> str:
    """Generate ASS subtitle content from pre-defined scene texts and durations.
    Each scene's caption uses narration (spoken text) when present, else subtitle.
    Used when subtitle_source=llm."""
    alignment = "2" if position == "bottom" else "8" if position == "top" else "5"
    margin_v = "80" if position == "bottom" else "60" if position == "top" else "0"

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
        "&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,"
        f"{alignment},20,20,{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events = []
    current_time = 0.0
    for sc in scenes:
        text = (sc.get("narration") or "").strip() or (sc.get("subtitle") or "").strip()
        duration = float(sc.get("duration", 5.0))
        if not text or duration <= 0:
            current_time += duration
            continue
        start_ts = _time_to_ass(current_time)
        end_ts = _time_to_ass(current_time + duration)
        # Escape ASS special chars: \ and { }
        text_escaped = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        line = f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text_escaped}"
        events.append(line)
        current_time += duration

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
    )

    Path(output_path).write_text(ass_content, encoding="utf-8")
    return output_path
