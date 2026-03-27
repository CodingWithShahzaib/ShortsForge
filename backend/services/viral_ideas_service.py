from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.services.ai_client import chat_completion
from backend.services.script_service import STORY_TEMPLATE_IDS, STORY_TYPES

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_STYLES = frozenset(
    {"realistic", "anime", "3d_render", "oil_painting", "watercolor", "cinematic"}
)
ALLOWED_SUBTITLE_SOURCES = frozenset({"llm", "transcription"})


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def _parse_llm_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_code_fence(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
        raise ValueError("Failed to parse JSON from LLM response") from None


def _clamp_int(v: Any, lo: int, hi: int, default: int) -> int:
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _clamp_float(v: Any, lo: float, hi: float, default: float) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, x))


def _normalize_story_type(v: Any) -> str:
    s = str(v or "").strip().lower().replace(" ", "_").replace("-", "_")
    if s in STORY_TYPES:
        return s
    return "general"


def _normalize_story_template(v: Any) -> str:
    s = str(v or "").strip()
    if s in STORY_TEMPLATE_IDS:
        return s
    return "default"


def _pick_resolution(v: Any, allowed: list[str]) -> str | None:
    if not allowed:
        return None
    s = str(v or "").strip()
    if s in allowed:
        return s
    # common aliases
    if "1080" in s:
        hit = next((a for a in allowed if "1080" in a), None)
        if hit:
            return hit
    if "720" in s:
        hit = next((a for a in allowed if "720" in a), None)
        if hit:
            return hit
    return None


def _pick_transition(v: Any, allowed: list[str]) -> str | None:
    if not allowed:
        return None
    s = str(v or "").strip()
    if s in allowed:
        return s
    return None


def normalize_viral_idea_settings(
    raw: dict[str, Any] | None,
    *,
    resolution_ids: list[str],
    transition_ids: list[str],
) -> dict[str, Any]:
    """Keep only fields safe to apply on the Create form; clamp to app limits."""
    if not raw or not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    st = _normalize_story_type(raw.get("story_type"))
    out["story_type"] = st
    out["story_template"] = _normalize_story_template(raw.get("story_template"))
    out["scene_count"] = _clamp_int(raw.get("scene_count"), 2, 15, 5)
    out["word_count"] = _clamp_int(raw.get("word_count"), 150, 800, 400)
    out["scene_duration"] = _clamp_float(raw.get("scene_duration"), 1.0, 60.0, 5.0)
    img = str(raw.get("image_style") or "").strip()
    out["image_style"] = img if img in ALLOWED_IMAGE_STYLES else "cinematic"
    sub_src = str(raw.get("subtitle_source") or "llm").strip()
    out["subtitle_source"] = sub_src if sub_src in ALLOWED_SUBTITLE_SOURCES else "llm"
    out["subtitle_enabled"] = bool(raw.get("subtitle_enabled", True))
    out["generate_subtitles"] = bool(raw.get("generate_subtitles", True))
    res = _pick_resolution(raw.get("resolution"), resolution_ids)
    if res:
        out["resolution"] = res
    tr = _pick_transition(raw.get("transition"), transition_ids)
    if tr:
        out["transition"] = tr
    return out


async def fetch_viral_ideas(
    *,
    niche: str | None,
    count: int,
    llm_provider: str | None,
    llm_model: str | None,
    resolution_ids: list[str],
    transition_ids: list[str],
) -> list[dict[str, Any]]:
    """Ask the LLM for short-form video angles that could perform well now; return cards + suggested settings."""
    n = max(3, min(12, count))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d (UTC)")
    niche_line = f"Focus niche / audience bias: {niche.strip()}. " if niche and niche.strip() else ""

    story_types_csv = ", ".join(STORY_TYPES)
    templates_csv = ", ".join(STORY_TEMPLATE_IDS)
    res_hint = ", ".join(resolution_ids[:6]) if resolution_ids else "1080x1920, 720x1280"
    trans_hint = ", ".join(transition_ids[:12]) if transition_ids else "fade, dissolve, zoom_in"

    system = (
        "You are a short-form video strategist for faceless YouTube Shorts / TikTok / Reels. "
        f"Today's date is {today}. {niche_line}"
        "Propose ideas that feel timely and shareable. You do NOT have live web access—use well-known recurring "
        "patterns (news cycles, seasonal moments, evergreen curiosity hooks) and phrase them as if they are relevant now. "
        "Avoid medical claims, hate, harassment, or instructions for wrongdoing. No slurs. "
        "Return valid JSON ONLY with this shape:\n"
        "{\n"
        '  "ideas": [\n'
        "    {\n"
        '      "title": "short card headline (max 8 words)",\n'
        '      "hook": "one-line viewer hook",\n'
        '      "angle": "one sentence: why this could spread",\n'
        '      "suggested_concept": "2-4 sentences: what the video should cover; this becomes the user\'s concept/title field",\n'
        '      "settings": {\n'
        f'        "story_type": "one of: {story_types_csv}",\n'
        f'        "story_template": "one of: {templates_csv}",\n'
        '        "scene_count": 4-8,\n'
        '        "word_count": 280-520,\n'
        '        "scene_duration": 4-6,\n'
        f'        "image_style": "one of: realistic, anime, 3d_render, oil_painting, watercolor, cinematic",\n'
        '        "subtitle_enabled": true/false,\n'
        '        "subtitle_source": "llm or transcription",\n'
        '        "generate_subtitles": true/false,\n'
        f'        "resolution": "prefer one of: {res_hint}",\n'
        f'        "transition": "prefer one of: {trans_hint}"\n'
        "      }\n"
        "    }\n"
        "  ]\n"
        "}\n"
        f"Return exactly {n} ideas in the ideas array, diverse angles."
    )

    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": f"Generate {n} viral-style faceless short video ideas for today. Vary tone and format.",
        },
    ]
    raw_text = await chat_completion(
        messages, llm_provider, llm_model, max_tokens=4096
    )
    data = _parse_llm_json(raw_text)
    ideas_raw = data.get("ideas")
    if not isinstance(ideas_raw, list):
        raise ValueError("LLM response missing 'ideas' array")

    cards: list[dict[str, Any]] = []
    for item in ideas_raw[:n]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip() or "Untitled idea"
        hook = str(item.get("hook") or "").strip()
        angle = str(item.get("angle") or "").strip()
        concept = str(item.get("suggested_concept") or "").strip() or hook or title
        settings_in = item.get("settings")
        settings: dict[str, Any] = {}
        if isinstance(settings_in, dict):
            settings = normalize_viral_idea_settings(
                settings_in,
                resolution_ids=resolution_ids,
                transition_ids=transition_ids,
            )
        cards.append(
            {
                "id": str(uuid.uuid4()),
                "title": title[:120],
                "hook": hook[:300],
                "angle": angle[:400],
                "suggested_concept": concept[:2000],
                "settings": settings,
            }
        )
    if len(cards) < 3:
        raise ValueError("Too few valid ideas in LLM response")
    return cards
