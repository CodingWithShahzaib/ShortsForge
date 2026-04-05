from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.config import get_settings
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


def _normalize_scene_narration_style(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in {"short", "balanced", "long"}:
        return s
    return "balanced"


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
    out["scene_count"] = _clamp_int(raw.get("scene_count"), 2, 100, 5)
    out["word_count"] = _clamp_int(raw.get("word_count"), 150, 800, 400)
    out["scene_narration_style"] = _normalize_scene_narration_style(raw.get("scene_narration_style"))
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


def _resolve_openai_research_model(model: str | None) -> str:
    normalized = (model or "").strip().lower()
    if normalized == "gpt-4o-search-preview":
        return "gpt-4o-search-preview"
    if normalized in {"gpt-4o-mini-search-preview", "", "gpt-4o-mini"}:
        return "gpt-4o-mini-search-preview"
    if normalized.startswith("gpt-4o-mini"):
        return "gpt-4o-mini-search-preview"
    if normalized.startswith("gpt-4o"):
        return "gpt-4o-search-preview"
    return "gpt-4o-mini-search-preview"


def _resolve_openai_generation_model(model: str | None) -> str | None:
    normalized = (model or "").strip().lower()
    if normalized == "gpt-4o-search-preview":
        return "gpt-4o"
    if normalized == "gpt-4o-mini-search-preview":
        return "gpt-4o-mini"
    return model


async def _fetch_current_research(
    *,
    niche: str | None,
    count: int,
    provider: str,
    model: str,
) -> str:
    audience = niche.strip() if niche and niche.strip() else "broad general-interest viewers"
    messages = [
        {
            "role": "system",
            "content": (
                "You are a short-form trend researcher with live web access. "
                "Find current, safe, non-defamatory angles that a faceless short video could cover today. "
                "Prefer broad-interest topics, recurring cultural moments, product/news buzz, sports, entertainment, "
                "science, consumer tech, internet culture, and seasonal hooks. "
                "Return a concise research brief with numbered items. Each item must include: topic, why it is timely, "
                "a suggested hook, and one or two source URLs."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Find {count} current viral short-video opportunities for {audience}. "
                "Focus on ideas that can be explained quickly in a faceless vertical video."
            ),
        },
    ]
    return await chat_completion(
        messages,
        provider,
        model,
        max_tokens=2500,
        web_search=True,
    )


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
    settings = get_settings()
    n = max(3, min(12, count))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d (UTC)")
    niche_line = f"Focus niche / audience bias: {niche.strip()}. " if niche and niche.strip() else ""
    effective_provider = (llm_provider or settings.default_llm_provider or "openai").strip().lower()
    requested_model = llm_model or settings.default_llm_model
    research_brief = ""
    generation_model = requested_model

    story_types_csv = ", ".join(STORY_TYPES)
    templates_csv = ", ".join(STORY_TEMPLATE_IDS)
    res_hint = ", ".join(resolution_ids[:6]) if resolution_ids else "1080x1920, 720x1280"
    trans_hint = ", ".join(transition_ids[:12]) if transition_ids else "fade, dissolve, zoom_in"

    if effective_provider == "openai":
        research_model = _resolve_openai_research_model(requested_model)
        generation_model = _resolve_openai_generation_model(requested_model)
        research_brief = await _fetch_current_research(
            niche=niche,
            count=n,
            provider=effective_provider,
            model=research_model,
        )

    timing_guidance = (
        "Use the supplied CURRENT_RESEARCH brief as the source of timely context. "
        "Do not invent news events that are not supported by that brief. "
        if research_brief
        else "You do NOT have live web access, so rely on recurring cultural, seasonal, and evergreen curiosity patterns. "
    )
    system = (
        "You are a short-form video strategist for faceless YouTube Shorts / TikTok / Reels. "
        f"Today's date is {today}. {niche_line}"
        f"Propose ideas that feel timely and shareable. {timing_guidance}"
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
        '        "scene_narration_style": "short, balanced, or long",\n'
        '        "scene_duration": 4-6,\n'
        '        "image_style": "one of: realistic, anime, 3d_render, oil_painting, watercolor, cinematic",\n'
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
            "content": (
                f"CURRENT_RESEARCH:\n{research_brief}\n\n" if research_brief else ""
            )
            + f"Generate {n} viral-style faceless short video ideas for today. Vary tone and format.",
        },
    ]
    raw_text = await chat_completion(
        messages,
        effective_provider,
        generation_model,
        max_tokens=4096,
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
