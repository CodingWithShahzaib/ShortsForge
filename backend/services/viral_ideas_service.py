from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from backend.config import get_settings
from backend.providers.tts.kokoro_provider import normalize_kokoro_voice_id
from backend.services.ai_client import chat_completion
from backend.services.story_structure import normalize_story_type_value
from backend.services.script_service import (
    STORY_TEMPLATE_IDS,
    STORY_TYPES,
    sanitize_speaker_tagged_dialogue,
)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_STYLES = frozenset(
    {"realistic", "anime", "3d_render", "oil_painting", "watercolor", "cinematic"}
)
ALLOWED_SUBTITLE_SOURCES = frozenset({"llm", "transcription"})
ALLOWED_DIALOGUE_STYLE_PRESETS = frozenset(
    {
        "comic_book",
        "political_cartoon",
        "graphic_novel",
        "anime",
        "photorealistic",
        "documentary",
        "cinematic",
        "cinematic_noir",
        "epic_blockbuster",
        "watercolor",
    }
)
ALLOWED_SHOT_TYPES = frozenset({"medium", "closeup", "two-shot", "reaction"})


def _normalize_generation_mode(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in {"standard", "dialogue"}:
        return s
    return "standard"


def _normalize_dialogue_style_preset(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in ALLOWED_DIALOGUE_STYLE_PRESETS:
        return s
    return "comic_book"


def _normalize_shot_type(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in ALLOWED_SHOT_TYPES:
        return s
    return "medium"


def _normalize_dialogue_characters(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    characters: list[dict[str, Any]] = []
    for index, item in enumerate(raw[:4]):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        if not name or not description:
            continue
        characters.append(
            {
                "id": f"idea_character_{index + 1}",
                "name": name[:80],
                "description": description[:500],
                "voice_profile": normalize_kokoro_voice_id(
                    str(item.get("voice_profile") or "").strip() or None,
                    fallback="",
                ) or None,
                "reference_image_url": None,
                "style_prompt": (
                    str(item.get("style_prompt") or "").strip()
                    or "comic book illustration, bold black outlines, dramatic shading, graphic novel style, political cartoon aesthetic"
                )[:400],
                "color_palette": None,
            }
        )
    return characters


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
    normalized = normalize_story_type_value(v)
    return normalized if normalized in STORY_TYPES else "general"


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
    out["subtitle_source"] = "transcription"
    out["subtitle_enabled"] = bool(raw.get("subtitle_enabled", True))
    out["generate_subtitles"] = bool(raw.get("generate_subtitles", True))
    res = _pick_resolution(raw.get("resolution"), resolution_ids)
    if res:
        out["resolution"] = res
    tr = _pick_transition(raw.get("transition"), transition_ids)
    if tr:
        out["transition"] = tr
    out["generation_mode"] = _normalize_generation_mode(raw.get("generation_mode"))
    out["dialogue_style_preset"] = _normalize_dialogue_style_preset(raw.get("dialogue_style_preset"))
    out["default_shot_type"] = _normalize_shot_type(raw.get("default_shot_type"))
    out["character_consistency_enabled"] = bool(raw.get("character_consistency_enabled", True))
    out["speaker_labels_in_subtitles"] = bool(raw.get("speaker_labels_in_subtitles", True))
    out["dialogue_characters"] = _normalize_dialogue_characters(raw.get("dialogue_characters"))
    starter_script = sanitize_speaker_tagged_dialogue(str(raw.get("starter_script") or "").strip())
    if starter_script:
        out["starter_script"] = starter_script[:12000]
    story_brief = raw.get("story_brief")
    if isinstance(story_brief, dict):
        out["story_brief"] = story_brief
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
    idea_type: str = "any",
    tone: str = "any",
    hook_style: str = "any",
    virality_angle: str = "any",
    duration_target_seconds: int | None = None,
    character_mode: str = "optional",
    cast_size: int | None = None,
    avoid_topics: str | None = None,
    resolution_ids: list[str],
    transition_ids: list[str],
) -> list[dict[str, Any]]:
    """Ask the LLM for short-form video angles that could perform well now; return cards + suggested settings."""
    settings = get_settings()
    requested_idea_type = idea_type if idea_type in {"any", "faceless", "dialogue"} else "any"
    requested_character_mode = character_mode if character_mode in {"off", "optional", "required"} else "optional"
    if requested_idea_type == "dialogue" or requested_character_mode == "required":
        n = max(2, min(5, count))
    else:
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
    tone_label = tone.replace("_", " ") if tone and tone != "any" else ""
    hook_style_label = hook_style.replace("_", " ") if hook_style and hook_style != "any" else ""
    virality_angle_label = virality_angle.replace("_", " ") if virality_angle and virality_angle != "any" else ""
    requested_cast_size = max(2, min(4, cast_size or 2))
    duration_hint = max(15, min(60, duration_target_seconds)) if duration_target_seconds else None

    configuration_lines: list[str] = []
    if requested_idea_type == "faceless":
        configuration_lines.append("Return only faceless / standard-mode concepts. Do not use dialogue mode.")
    elif requested_idea_type == "dialogue":
        configuration_lines.append("Return only dialogue-first concepts with recurring characters.")
    if tone_label:
        configuration_lines.append(f"Preferred tone: {tone_label}.")
    if hook_style_label:
        configuration_lines.append(f"Preferred hook style: {hook_style_label}.")
    if virality_angle_label:
        configuration_lines.append(f"Preferred virality angle: {virality_angle_label}.")
    if duration_hint is not None:
        configuration_lines.append(
            f"Target overall runtime per video: about {duration_hint} seconds. Align scene_count, word_count, and scene_duration to that runtime."
        )
    if requested_character_mode == "off":
        configuration_lines.append("Do not include starter characters or dialogue scripts.")
    elif requested_character_mode == "required":
        configuration_lines.append(
            f"Every idea must use dialogue mode and include exactly {requested_cast_size} starter characters."
        )
    elif cast_size:
        configuration_lines.append(
            f"When a dialogue idea is used, prefer exactly {requested_cast_size} starter characters."
        )
    if avoid_topics and avoid_topics.strip():
        configuration_lines.append(f"Avoid these topics or angles entirely: {avoid_topics.strip()}.")
    configuration_brief = " ".join(configuration_lines)

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
        f"{configuration_brief} "
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
        '        "scene_count": 4-12,\n'
        '        "word_count": 500-800,\n'
        '        "scene_narration_style": "short, balanced, or long",\n'
        '        "scene_duration": 4-6,\n'
        '        "image_style": "one of: realistic, anime, 3d_render, oil_painting, watercolor, cinematic",\n'
        '        "subtitle_enabled": true/false,\n'
        '        "subtitle_source": "transcription",\n'
        '        "generate_subtitles": true/false,\n'
        f'        "resolution": "prefer one of: {res_hint}",\n'
        f'        "transition": "prefer one of: {trans_hint}",\n'
        '        "generation_mode": "standard or dialogue",\n'
        '        "dialogue_style_preset": "comic_book, political_cartoon, graphic_novel, anime, photorealistic, documentary, cinematic, cinematic_noir, epic_blockbuster, or watercolor when generation_mode is dialogue",\n'
        '        "default_shot_type": "medium, closeup, two-shot, or reaction when generation_mode is dialogue",\n'
        '        "character_consistency_enabled": true/false,\n'
        '        "speaker_labels_in_subtitles": true/false,\n'
        '        "dialogue_characters": [\n'
        '          {\n'
        '            "name": "character name",\n'
        '            "description": "physical look, outfit, silhouette, expression style",\n'
        '            "voice_profile": "optional kokoro voice id",\n'
        '            "style_prompt": "optional extra art direction"\n'
        '          }\n'
        '        ],\n'
        '        "starter_script": "CRITICAL: highly detailed speaker-tagged script with AT LEAST 25-40 lines of dialogue. It MUST be long enough for a rich 60-second animated short. DO NOT write short scripts when generation_mode is dialogue. Use plain spoken lines only after each Character Name: label, with no parenthetical acting cues or bracketed stage directions."\n'
        "      }\n"
        "    }\n"
        "  ]\n"
        "}\n"
        f"Return exactly {n} ideas in the ideas array, diverse angles. "
        f"For dialogue ideas, provide exactly {requested_cast_size} starter characters and a highly substantive, EXTREMELY LONG speaker-tagged starter_script with a STRICT MINIMUM of 30 alternating lines. Establish deep conflict, tension, or rich conversation, and provide enough robust narrative content to comfortably fill out a high-retention 60-second video. Short scripts are strictly prohibited. After each `Character Name:` label, write only plain speakable dialogue. Never include parenthetical acting cues or bracketed stage directions such as `(smirking)`, `(whispers)`, or `[pause]`. "
        "For non-dialogue ideas, set generation_mode to standard and omit or leave dialogue fields empty. "
        "Honor the requested filters unless a filter would make the result unsafe or impossible."
    )

    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                f"CURRENT_RESEARCH:\n{research_brief}\n\n" if research_brief else ""
            )
            + (
                f"Generate {n} viral-style short video ideas for today. "
                f"Requested configuration: {configuration_brief if configuration_brief else 'Balanced mix of faceless and dialogue-ready ideas.'}"
            ),
        },
    ]
    raw_text = await chat_completion(
        messages,
        effective_provider,
        generation_model,
        max_tokens=8192,
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


def _build_viral_idea_card(
    item: dict[str, Any],
    *,
    resolution_ids: list[str],
    transition_ids: list[str],
) -> dict[str, Any] | None:
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
    return {
        "id": str(uuid.uuid4()),
        "title": title[:120],
        "hook": hook[:300],
        "angle": angle[:400],
        "suggested_concept": concept[:2000],
        "settings": settings,
    }


async def stream_viral_ideas(
    *,
    niche: str | None,
    count: int,
    llm_provider: str | None,
    llm_model: str | None,
    idea_type: str = "any",
    tone: str = "any",
    hook_style: str = "any",
    virality_angle: str = "any",
    duration_target_seconds: int | None = None,
    character_mode: str = "optional",
    cast_size: int | None = None,
    avoid_topics: str | None = None,
    resolution_ids: list[str],
    transition_ids: list[str],
) -> AsyncIterator[dict[str, Any]]:
    settings = get_settings()
    requested_idea_type = idea_type if idea_type in {"any", "faceless", "dialogue"} else "any"
    requested_character_mode = character_mode if character_mode in {"off", "optional", "required"} else "optional"
    if requested_idea_type == "dialogue" or requested_character_mode == "required":
        n = max(2, min(5, count))
    else:
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
    tone_label = tone.replace("_", " ") if tone and tone != "any" else ""
    hook_style_label = hook_style.replace("_", " ") if hook_style and hook_style != "any" else ""
    virality_angle_label = virality_angle.replace("_", " ") if virality_angle and virality_angle != "any" else ""
    requested_cast_size = max(2, min(4, cast_size or 2))
    duration_hint = max(15, min(60, duration_target_seconds)) if duration_target_seconds else None

    configuration_lines: list[str] = []
    if requested_idea_type == "faceless":
        configuration_lines.append("Return only faceless / standard-mode concepts. Do not use dialogue mode.")
    elif requested_idea_type == "dialogue":
        configuration_lines.append("Return only dialogue-first concepts with recurring characters.")
    if tone_label:
        configuration_lines.append(f"Preferred tone: {tone_label}.")
    if hook_style_label:
        configuration_lines.append(f"Preferred hook style: {hook_style_label}.")
    if virality_angle_label:
        configuration_lines.append(f"Preferred virality angle: {virality_angle_label}.")
    if duration_hint is not None:
        configuration_lines.append(
            f"Target overall runtime per video: about {duration_hint} seconds. Align scene_count, word_count, and scene_duration to that runtime."
        )
    if requested_character_mode == "off":
        configuration_lines.append("Do not include starter characters or dialogue scripts.")
    elif requested_character_mode == "required":
        configuration_lines.append(
            f"Every idea must use dialogue mode and include exactly {requested_cast_size} starter characters."
        )
    elif cast_size:
        configuration_lines.append(
            f"When a dialogue idea is used, prefer exactly {requested_cast_size} starter characters."
        )
    if avoid_topics and avoid_topics.strip():
        configuration_lines.append(f"Avoid these topics or angles entirely: {avoid_topics.strip()}.")
    configuration_brief = " ".join(configuration_lines)

    yield {"type": "status", "message": "Researching angles..."}
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
        f"{configuration_brief} "
        "Avoid medical claims, hate, harassment, or instructions for wrongdoing. No slurs. "
        "Return valid JSON ONLY with this exact shape:\n"
        "{\n"
        '  "title": "short card headline (max 8 words)",\n'
        '  "hook": "one-line viewer hook",\n'
        '  "angle": "one sentence: why this could spread",\n'
        '  "suggested_concept": "2-4 sentences: what the video should cover; this becomes the user concept/title",\n'
        '  "settings": {\n'
        f'    "story_type": "one of: {story_types_csv}",\n'
        f'    "story_template": "one of: {templates_csv}",\n'
        '    "scene_count": 4-12,\n'
        '    "word_count": 500-800,\n'
        '    "scene_narration_style": "short, balanced, or long",\n'
        '    "scene_duration": 4-6,\n'
        '    "image_style": "one of: realistic, anime, 3d_render, oil_painting, watercolor, cinematic",\n'
        '    "subtitle_enabled": true/false,\n'
        '    "subtitle_source": "transcription",\n'
        '    "generate_subtitles": true/false,\n'
        f'    "resolution": "prefer one of: {res_hint}",\n'
        f'    "transition": "prefer one of: {trans_hint}",\n'
        '    "generation_mode": "standard or dialogue",\n'
        '    "dialogue_style_preset": "comic_book, political_cartoon, graphic_novel, anime, photorealistic, documentary, cinematic, cinematic_noir, epic_blockbuster, or watercolor when generation_mode is dialogue",\n'
        '    "default_shot_type": "medium, closeup, two-shot, or reaction when generation_mode is dialogue",\n'
        '    "character_consistency_enabled": true/false,\n'
        '    "speaker_labels_in_subtitles": true/false,\n'
        '    "dialogue_characters": [{"name": "character name", "description": "physical look, outfit, silhouette, expression style", "voice_profile": "optional kokoro voice id", "style_prompt": "optional extra art direction"}],\n'
        '    "starter_script": "for dialogue mode, highly detailed speaker-tagged script with at least 25-40 lines, using plain spoken lines only after each Character Name: label and no parenthetical stage directions"\n'
        "  }\n"
        "}\n"
        "Return exactly one idea object. Do not wrap it in an array. Do not use markdown."
    )

    previous_summaries: list[str] = []
    yielded = 0
    for index in range(n):
        yield {"type": "status", "message": f"Generating idea {index + 1} of {n}..."}
        prior_ideas_text = (
            "Already generated ideas to avoid duplicating:\n- " + "\n- ".join(previous_summaries)
            if previous_summaries
            else "No previous ideas yet."
        )
        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"CURRENT_RESEARCH:\n{research_brief}\n\n" if research_brief else ""
                )
                + (
                    f"Generate idea {index + 1} of {n}. "
                    f"Requested configuration: {configuration_brief if configuration_brief else 'Balanced mix of faceless and dialogue-ready ideas.'}\n\n"
                    f"{prior_ideas_text}"
                ),
            },
        ]
        raw_text = await chat_completion(
            messages,
            effective_provider,
            generation_model,
            max_tokens=3000,
        )
        data = _parse_llm_json(raw_text)
        if not isinstance(data, dict):
            continue
        card = _build_viral_idea_card(
            data,
            resolution_ids=resolution_ids,
            transition_ids=transition_ids,
        )
        if not card:
            continue
        previous_summaries.append(
            f"{card['title']}: {card.get('hook') or card.get('angle') or card.get('suggested_concept')}"
        )
        yielded += 1
        yield {"type": "idea", "idea": card}

    if yielded < 3:
        raise ValueError("Too few valid ideas in streamed LLM response")
    yield {"type": "done", "count": yielded}
