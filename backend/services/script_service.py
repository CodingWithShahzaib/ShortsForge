from __future__ import annotations

import json
import logging
import math
import re
from typing import Any

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)

STORY_TYPES = [
    "scary", "mystery", "bedtime", "philosophy", "life_pro_tips",
    "fun_facts", "motivational", "science", "history", "general",
]

STORY_TEMPLATES_META: list[dict[str, str]] = [
    {
        "id": "default",
        "name": "Standard",
        "description": "Balanced opening and pacing for most short videos.",
    },
    {
        "id": "political_commentary",
        "name": "Political commentary",
        "description": "Strong hook, examples, insight, and a forward-looking close.",
    },
    {
        "id": "corporate_expose",
        "name": "Corporate exposé",
        "description": "Focuses on what is hidden, who benefits, and why it matters to viewers.",
    },
    {
        "id": "historical_parallel",
        "name": "Historical parallel",
        "description": "Connects a past pattern to today, then ends with a lesson or warning.",
    },
    {
        "id": "satirical_irony",
        "name": "Satirical irony",
        "description": "Uses irony and contrast in a witty, non-personal tone.",
    },
    {
        "id": "urgent_warning",
        "name": "Urgent warning",
        "description": "Highlights the stakes and what to watch next without fear-driven language.",
    },
]

STORY_TEMPLATE_IDS: tuple[str, ...] = tuple(m["id"] for m in STORY_TEMPLATES_META)

STORY_HOOK_TEMPLATES: dict[str, str] = {
    "scary": "Start with an unsettling question or hidden danger nobody sees coming.",
    "mystery": "Open with an unexplained event that demands answers.",
    "motivational": "Begin with a relatable struggle followed by an unexpected turnaround.",
    "science": "Lead with a counterintuitive fact that challenges common belief.",
    "history": "Connect a forgotten past event to something happening right now.",
    "corporate_expose": "Reveal what's hidden in plain sight that affects the viewer directly.",
    "urgent_warning": "State the stakes in one line—what could be lost if ignored.",
}

SCENE_EMOTION_MAP = {
    "hook": "tense",
    "pattern": "neutral",
    "revelation": "urgent",
    "close": "hopeful",
}

MIN_IMAGE_PROMPT_WORDS = 400
MAX_SCENE_COUNT = 100


def validate_story_template_field(value: str) -> str:
    if value not in STORY_TEMPLATE_IDS:
        raise ValueError(
            f"Invalid story_template '{value}'. Allowed: {', '.join(STORY_TEMPLATE_IDS)}"
        )
    return value


def normalize_scene_narration_style(value: str | None) -> str:
    style = str(value or "").strip().lower()
    return style if style in {"short", "balanced", "long"} else "balanced"


def resolve_scene_pacing_bounds(
    scene_narration_style: str | None,
    *,
    min_duration: int,
    max_duration: int,
) -> tuple[int, int]:
    """
    Keep explicit duration settings, but ensure narration style can widen overly tight defaults.

    Without this, the default 2-4 second pacing window effectively forces every scene down to
    roughly 9-10 spoken words, which defeats the purpose of the "long" narration style.
    """
    style = normalize_scene_narration_style(scene_narration_style)
    safe_min = max(1, int(min_duration) if min_duration else 1)
    safe_max = max(safe_min, int(max_duration) if max_duration else safe_min)
    style_min_floors = {"short": 2, "balanced": 3, "long": 4}
    style_max_floors = {"short": 4, "balanced": 6, "long": 10}
    return (
        max(safe_min, style_min_floors[style]),
        max(safe_max, style_max_floors[style]),
    )


def _scene_narration_style_note(scene_narration_style: str) -> str:
    style = normalize_scene_narration_style(scene_narration_style)
    if style == "short":
        return (
            "SCENE NARRATION PACING:\n"
            "- Keep each scene's narration brief and punchy.\n"
            "- Prefer one tight beat per scene, usually 1-2 short sentences.\n"
            "- Use quicker cuts and avoid overloading a single scene with too much spoken copy.\n"
        )
    if style == "long":
        return (
            "SCENE NARRATION PACING:\n"
            "- Let each scene carry a fuller spoken thought before cutting.\n"
            "- Prefer richer narration chunks, usually 2-4 sentences when the script allows.\n"
            "- Avoid fragmenting one idea across too many tiny scenes.\n"
        )
    return (
        "SCENE NARRATION PACING:\n"
        "- Keep per-scene narration balanced: not too clipped, not too dense.\n"
        "- Prefer one complete idea per scene with natural sentence grouping.\n"
    )

STORY_TEMPLATE_SCRIPT_GUIDES: dict[str, str] = {
    "political_commentary": (
        "Structure the script in four beats (do NOT label them in the output): "
        "(1) Open with one bold, specific hook that names the topic. "
        "(2) Three or four short parallel examples showing a pattern, escalation, or contrast—use rhetorical questions where natural. "
        "(3) Two sentences that reframe: motive, incentive, or strategy—stay analytical, avoid dehumanizing language. "
        "(4) One closing line that points forward or leaves tension—no call for violence or harassment. "
        "Tone: confident, clear; sentences mostly under 15 words. "
        "Target length: about {word_count} words (±10%). Story tone category: {story_type}."
    ),
    "corporate_expose": (
        "Structure: (1) Hook—what they don’t emphasize. (2) Pattern—2–4 concrete behaviors or moves. "
        "(3) Revelation—who gains, who bears cost. (4) Close—what to watch next or verify. "
        "Analytical, non-sensational; no fabricated quotes or statistics. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
    "historical_parallel": (
        "Structure: (1) Hook—tie present to a recognizable past pattern. (2) Brief context from history. "
        "(3) Parallel—how it rhymes with today. (4) Close—lesson or open question. "
        "Be accurate; avoid false equivalences stated as fact. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
    "satirical_irony": (
        "Structure: (1) Deadpan hook. (2) Escalating absurdities or contrasts. (3) Twist that lands the point. "
        "(4) Short ironic kicker. No slurs; punch up systems and behaviors, not private individuals. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
    "urgent_warning": (
        "Structure: (1) Stakes in one line. (2) What is changing and why it matters. "
        "(3) Plausible outcomes—avoid panic rhetoric. (4) What the viewer can verify or do that is constructive. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
}


def list_story_templates() -> list[dict[str, str]]:
    """Metadata for Create UI: id, name, description."""
    return list(STORY_TEMPLATES_META)


def _storyboard_arc_addon(scene_count: int, image_style: str, story_template: str) -> str:
    """Extra instructions when using a non-default story_template."""
    n = max(2, min(MAX_SCENE_COUNT, int(scene_count)))
    template_visual_notes = {
        "political_commentary": "Use symbolic imagery (scales, documents, crowds) not individual faces.",
        "corporate_expose": "Show systems, buildings, documents, data visualizations—professional aesthetic.",
        "historical_parallel": "Split between archival-style and modern imagery for contrast.",
        "urgent_warning": "High contrast, urgent colors (red/orange accents), clear stakes visualization.",
        "satirical_irony": "Visual contrast between stated claim and actual reality (split composition).",
    }
    visual_note = template_visual_notes.get(story_template, "Match imagery to narration emotion.")
    lines = [
        "",
        f"NARRATIVE ARC ({story_template} template):",
        f"- Split the script into exactly {n} scenes. narration for each scene must be copied verbatim from the script in order—no paraphrase.",
        f"- Visual note: {visual_note}",
        f"- image_prompt: detailed, in {image_style} style; vary composition and mood per beat.",
        "- Choose transition to match emotional shifts (e.g. dissolve or zoom_in for revelation; wipeleft/pan for pattern sequences).",
        "- Scene roles:",
        "- Scene 1: Hook—bold focal imagery, high clarity, symbolic or striking composition.",
    ]
    if n == 2:
        lines.append(
            "- Scene 2: Deliver pattern, revelation, and forward close in one continuous narration slice; strong lighting shift in imagery."
        )
    elif n == 3:
        lines.append("- Scene 2: Pattern or escalation.")
        lines.append("- Scene 3: Revelation and forward-looking close; shift mood in the image.")
    else:
        for i in range(2, n - 1):
            lines.append(f"- Scene {i}: Pattern or escalation (build stakes).")
        lines.append(f"- Scene {n - 1}: Revelation or turning point; shift lighting or tone in image_prompt.")
        lines.append(f"- Scene {n}: Forward-looking close; tension or horizon—no text in image.")
    return "\n".join(lines)


def _fallback_storyboard_scenes(
    script: str,
    *,
    scene_count: int,
    image_style: str,
) -> list[dict[str, str]]:
    """Create a minimal storyboard when the LLM returns no scenes."""
    target = max(1, min(MAX_SCENE_COUNT, int(scene_count) if scene_count else 5))
    cleaned = (script or "").strip()
    if not cleaned:
        cleaned = "A concise narration about the concept."
    buckets = _chunk_sentences_contiguous(cleaned, target)
    scenes: list[dict[str, str]] = []
    for chunk in buckets:
        narration = " ".join(chunk).strip() or cleaned
        prompt_hint = narration.split(".")[0].strip() or narration[:140]
        scenes.append(
            {
                "narration": narration,
                "image_prompt": f"{image_style} cinematic still, {prompt_hint}",
                "transition": "fade",
            }
        )
    return scenes


def _ensure_scene_count_exact(
    scenes: Any,
    *,
    scene_count: int,
    fallback_script: str,
    image_style: str,
) -> list[dict[str, Any]]:
    """Coerce LLM output to the requested scene count."""
    target = max(1, min(MAX_SCENE_COUNT, int(scene_count) if scene_count else 1))
    fallback = _fallback_storyboard_scenes(
        fallback_script,
        scene_count=target,
        image_style=image_style,
    )
    if not isinstance(scenes, list) or not scenes:
        return fallback
    if len(scenes) == target:
        return [dict(sc or {}) for sc in scenes]
    logger.warning("Adjusting storyboard scene count from %s to requested %s", len(scenes), target)
    coerced = [dict(sc or {}) for sc in scenes[:target]]
    if len(coerced) < target:
        coerced.extend(fallback[len(coerced):target])
    return coerced


def _chunk_sentences_contiguous(text: str, target: int) -> list[list[str]]:
    """
    Split text into contiguous sentence buckets.

    This avoids round-robin distribution that can leak later story beats into early scenes.
    """
    safe_target = max(1, int(target) if target else 1)
    cleaned = (text or "").strip()
    if not cleaned:
        return [[f"Scene {i + 1} narration."] for i in range(safe_target)]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    if not sentences:
        sentences = [cleaned]

    total = len(sentences)
    buckets: list[list[str]] = []
    for i in range(safe_target):
        start = (i * total) // safe_target
        end = ((i + 1) * total) // safe_target
        chunk = sentences[start:end]
        buckets.append(chunk if chunk else [sentences[min(start, total - 1)]])
    return buckets


def _derive_narration_chunks(script: str, scene_count: int) -> list[str]:
    """Split script text into non-empty chunks for scene narration fallback."""
    target = max(1, int(scene_count) if scene_count else 1)
    cleaned = (script or "").strip()
    if not cleaned:
        return [f"Scene {i + 1} narration." for i in range(target)]
    buckets = _chunk_sentences_contiguous(cleaned, target)
    chunks = [" ".join(chunk).strip() for chunk in buckets]

    fallback = cleaned
    return [chunk or fallback for chunk in chunks]


def normalize_scene_narration(
    scenes: list[dict[str, Any]],
    *,
    script: str | None = None,
) -> list[dict[str, Any]]:
    """
    Guarantee non-empty narration/subtitle/script text for each scene dict.

    Priority per scene: narration -> subtitle -> script -> derived chunk from full script.
    """
    if not isinstance(scenes, list):
        return []
    fallback_chunks = _derive_narration_chunks(script or "", len(scenes))
    out: list[dict[str, Any]] = []
    for i, raw in enumerate(scenes):
        sc = dict(raw or {})
        narr = (
            (sc.get("narration") or "").strip()
            or (sc.get("subtitle") or "").strip()
            or (sc.get("script") or "").strip()
            or fallback_chunks[i]
        )
        sc["narration"] = narr
        sc["subtitle"] = (sc.get("subtitle") or "").strip() or narr
        sc["script"] = (sc.get("script") or "").strip() or narr
        out.append(sc)
    return out


def _scene_emotion_for_index(idx: int, total: int) -> str:
    if total <= 1:
        return SCENE_EMOTION_MAP["hook"]
    if idx == 0:
        return SCENE_EMOTION_MAP["hook"]
    if idx == total - 1:
        return SCENE_EMOTION_MAP["close"]
    if idx == total - 2:
        return SCENE_EMOTION_MAP["revelation"]
    return SCENE_EMOTION_MAP["pattern"]


def _resolution_prompt_context(resolution: str | None) -> tuple[str, str]:
    raw = (resolution or "").strip().lower()
    m = re.match(r"^(\d{2,5})x(\d{2,5})$", raw)
    if not m:
        return ("Vertical frame optimized for shorts", "9:16")
    width = max(1, int(m.group(1)))
    height = max(1, int(m.group(2)))
    gcd = math.gcd(width, height) or 1
    aspect = f"{width // gcd}:{height // gcd}"
    if height > width:
        frame = "Vertical portrait frame"
    elif width > height:
        frame = "Horizontal cinematic frame"
    else:
        frame = "Square frame"
    return frame, aspect


def _composition_hint_for_scene(scene_index: int, total_scenes: int) -> str:
    if total_scenes <= 1:
        return "medium shot at eye level with clear subject separation from the background"
    plan = [
        "wide establishing shot with strong foreground-to-background depth",
        "medium shot with environmental context and directional leading lines",
        "close-up with expressive details, selective focus, and emotional texture",
        "low-angle medium-wide shot to increase dramatic weight",
        "high-angle medium shot to reveal situational pressure and context",
    ]
    return plan[scene_index % len(plan)]


def _count_words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def _estimate_scene_duration_seconds(text: str) -> float:
    return max(1.0, round(_count_words(text) / 2.6, 1))


def _split_long_scene(scene: dict[str, Any], *, min_duration: int, max_duration: int) -> list[dict[str, Any]]:
    narration = (scene.get("narration") or scene.get("script") or scene.get("subtitle") or "").strip()
    if not narration:
        scene["duration"] = max(min_duration, scene.get("duration") or min_duration)
        return [scene]
    estimated = _estimate_scene_duration_seconds(narration)
    if estimated <= max_duration:
        scene["duration"] = max(min_duration, min(max_duration, estimated))
        return [scene]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", narration) if s.strip()]
    if len(sentences) < 2:
        midpoint = max(1, len(narration) // 2)
        sentences = [narration[:midpoint].strip(), narration[midpoint:].strip()]
    chunks = _chunk_sentences_contiguous(" ".join(sentences), max(2, math.ceil(estimated / max_duration)))
    result: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks):
        text = " ".join(chunk).strip() or narration
        cloned = dict(scene)
        cloned["narration"] = text
        cloned["subtitle"] = text
        cloned["script"] = text
        cloned["duration"] = max(min_duration, min(max_duration, _estimate_scene_duration_seconds(text)))
        if index > 0 and not (cloned.get("transition") or "").strip():
            cloned["transition"] = "fade"
        result.append(cloned)
    return result


def enforce_scene_pacing(
    scenes: list[dict[str, Any]],
    *,
    min_duration: int = 2,
    max_duration: int = 4,
) -> list[dict[str, Any]]:
    paced: list[dict[str, Any]] = []
    for scene in scenes:
        paced.extend(_split_long_scene(dict(scene), min_duration=min_duration, max_duration=max_duration))
    return paced


def apply_ai_scene_bridges(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    bridged: list[dict[str, Any]] = []
    for scene in scenes:
        current = dict(scene)
        bridge_text = (
            (current.get("bridge_line") or "").strip()
            or (current.get("bridge_narration") or "").strip()
        )
        narration = (current.get("narration") or current.get("script") or "").strip()
        if bridge_text and narration and not narration.startswith(bridge_text):
            combined = f"{bridge_text} {narration}".strip()
            current["narration"] = combined
            current["subtitle"] = combined
            current["script"] = combined
        bridged.append(current)
    return bridged


def _first_sentence(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)
    return parts[0].strip() if parts else cleaned


async def analyze_hook_quality(
    *,
    script_text: str,
    concept: str,
    story_type: str,
    llm_provider: str | None,
    llm_model: str | None,
) -> dict[str, Any]:
    source = (script_text or concept or story_type or "the topic").strip()
    first_line = _first_sentence(source)
    messages = [
        {
            "role": "system",
            "content": (
                "You evaluate and improve short-form video hooks. "
                "Return strict JSON only with keys: weak (boolean), reason (string), suggestions (array of 0-3 strings). "
                "Judge the opening only from the actual script/context provided, not from generic checklists. "
                "Only mark weak=true when the opening likely fails to create curiosity, tension, surprise, novelty, or clear stakes."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Topic: {concept or story_type}\n"
                f"Current opening: {first_line or source}\n"
                f"Script excerpt:\n{(script_text or source)[:900]}"
            ),
        },
    ]
    try:
        raw = await chat_completion(messages, llm_provider, llm_model, 0.7, max_tokens=180)
    except Exception:
        return {"weak": False, "reason": "", "suggestions": []}
    raw = raw.strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                payload = json.loads(raw[start:end])
            except json.JSONDecodeError:
                return {"weak": False, "reason": "", "suggestions": []}
        else:
            return {"weak": False, "reason": "", "suggestions": []}
    suggestions = payload.get("suggestions")
    if not isinstance(suggestions, list):
        suggestions = []
    return {
        "weak": bool(payload.get("weak")),
        "reason": str(payload.get("reason") or "").strip(),
        "suggestions": [str(line).strip() for line in suggestions if str(line).strip()][:3],
    }


def _build_prompt_padding_blocks(
    *,
    narration: str,
    image_style: str,
    scene_emotion: str,
    visual_continuity: str | None,
    transition: str | None,
) -> list[str]:
    continuity = (visual_continuity or "").strip() or "repeatable motifs, unified grading, and stable character/environment identity"
    move = (transition or "").strip() or "fade"
    nar = (narration or "").strip() or "the core spoken line"
    return [
        (
            f"Layer in micro-details that support realism: surface wear, fabric texture, dust in the air, subtle reflections, "
            f"material response to light, and believable imperfections. Keep these details story-relevant and non-random. "
            f"Every prop should look intentionally placed to reinforce the spoken beat: {nar}."
        ),
        (
            f"Design spatial storytelling with three readable depth planes: foreground cues, primary midground action, and a contextual background. "
            f"Use overlap and perspective lines so the viewer instantly understands where to look first. Preserve {continuity} so scenes feel connected "
            f"in the same visual world, not as unrelated stock images."
        ),
        (
            f"Use lighting direction intentionally: define key, fill, and edge light behavior with physically plausible falloff. "
            f"Maintain a {scene_emotion} emotional signature through tonal contrast, highlight control, and shadow density. "
            f"Color should be expressive but not over-processed, with controlled saturation and realistic skin/environment rendering."
        ),
        (
            f"Apply composition discipline suitable for short-form viewing: readable center of interest, safe negative space for mobile crop tolerance, "
            f"and a clear silhouette around the main subject. Keep narrative momentum by visually implying a transition of type '{move}' into the next scene "
            f"through directional flow, gaze direction, or geometry."
        ),
        (
            f"Keep style consistency explicit: this scene is rendered in {image_style} style with coherent lens language, texture treatment, and grading logic. "
            f"Avoid random style drift between painterly, anime, or photoreal cues unless intentionally requested. Emphasize one dominant storytelling idea "
            f"and remove distracting secondary actions."
        ),
        (
            "Refine final polish with production-grade clarity: crisp focal detail where the eye should land, controlled blur elsewhere, "
            "balanced noise profile, realistic dynamic range, and cinematic yet truthful contrast. The frame should look publish-ready for a professional short, "
            "with no accidental text overlays, watermark artifacts, or malformed anatomy."
        ),
    ]


def _ensure_min_words(text: str, minimum_words: int, padding_blocks: list[str]) -> str:
    out = (text or "").strip()
    idx = 0
    while _count_words(out) < minimum_words and idx < len(padding_blocks):
        out = f"{out}\n\n{padding_blocks[idx]}".strip()
        idx += 1
    while _count_words(out) < minimum_words:
        out = (
            f"{out}\n\nAdd more concrete, physically plausible detail to wardrobe, materials, environment interaction, "
            "lighting gradients, and composition hierarchy while preserving narrative clarity and continuity."
        ).strip()
    return out


def enhance_image_prompt(
    base_prompt: str,
    narration: str,
    scene_emotion: str,
    image_style: str,
    *,
    resolution: str = "1080x1920",
    transition: str = "fade",
    visual_continuity: str | None = None,
    scene_index: int = 0,
    total_scenes: int = 1,
    min_words: int = MIN_IMAGE_PROMPT_WORDS,
) -> str:
    """Add specificity and emotional alignment to image prompts."""
    emotion_lighting = {
        "tense": "dramatic shadows, high contrast, cool tones",
        "hopeful": "warm golden light, soft diffusion, uplifting atmosphere",
        "mysterious": "low key lighting, fog or haze, muted colors",
        "urgent": "harsh lighting, saturated reds/oranges, dynamic angles",
        "calm": "natural light, balanced exposure, serene composition",
        "neutral": "balanced lighting, natural color grade, clear detail",
    }
    cleaned = (base_prompt or "").strip()
    narration_hint = (narration or "").strip()
    frame_hint, aspect = _resolution_prompt_context(resolution)
    composition = _composition_hint_for_scene(scene_index, total_scenes)
    continuity = (visual_continuity or "").strip()
    hints = [h for h in (cleaned, narration_hint) if h]
    content_hint = ". ".join(hints) if hints else "Clear focal subject and action aligned to narration."
    prompt = (
        f"{frame_hint} ({aspect}) in {image_style} style. "
        f"Scene {scene_index + 1} of {max(1, total_scenes)} uses {composition}. "
        f"Primary visual objective: {content_hint} "
        f"Lighting and mood should read as {scene_emotion}, using {emotion_lighting.get(scene_emotion, 'natural balanced lighting')}. "
        "Include a concrete subject, specific environment, believable textures, and a strong foreground/background relationship. "
        "Keep the focal point instantly readable on mobile and avoid clutter that competes with the story beat. "
        f"Imply a '{transition}' handoff into the next scene through directional composition and emotional flow. "
        "No on-screen text unless a story-critical sign is unavoidable. "
        "Do not depict real politicians, celebrities, or public figures; use anonymous or fictional stand-ins."
    )
    if continuity:
        prompt = (
            f"{prompt} Maintain visual continuity across scenes with this anchor: {continuity}. "
            "Carry that continuity through color palette, motifs, and recurring environmental cues."
        )
    return _ensure_min_words(
        prompt,
        max(120, int(min_words)),
        _build_prompt_padding_blocks(
            narration=narration_hint,
            image_style=image_style,
            scene_emotion=scene_emotion,
            visual_continuity=visual_continuity,
            transition=transition,
        ),
    )


def validate_storyboard_quality(storyboard: dict) -> list[str]:
    """Check for common quality issues."""
    issues = []
    scenes = storyboard.get("scenes", []) if isinstance(storyboard, dict) else []
    continuity = (storyboard.get("visual_continuity") or "").strip().lower()
    all_narration = " ".join((s.get("narration") or "") for s in scenes).lower()
    shot_markers: list[str] = []
    for i, scene in enumerate(scenes):
        prompt = (scene.get("image_prompt") or "").strip()
        narration = (scene.get("narration") or "").strip()
        duration = scene.get("duration") or scene.get("duration_seconds") or 5
        if len(prompt) < 50:
            issues.append(f"Scene {i + 1}: image_prompt too short ({len(prompt)} chars)")
        if narration and not any(word in narration.lower() for word in ["you", "we", "this", "the"]):
            issues.append(f"Scene {i + 1}: narration lacks engagement words")
        if len(narration) > 100 and float(duration) < 5:
            issues.append(f"Scene {i + 1}: narration too long for duration")
        prompt_l = prompt.lower()
        if any(x in prompt_l for x in ["wide", "establishing"]):
            shot_markers.append("wide")
        elif "close" in prompt_l:
            shot_markers.append("close")
        elif "medium" in prompt_l:
            shot_markers.append("medium")

    if continuity and continuity not in all_narration:
        issues.append("Visual continuity note not reflected in narration (check prompts).")
    if continuity:
        prompts_text = " ".join((s.get("image_prompt") or "") for s in scenes).lower()
        if continuity not in prompts_text:
            issues.append("Visual continuity note not reflected in image prompts.")
    if shot_markers:
        unique = set(shot_markers)
        if len(unique) < 2:
            issues.append("Limited shot variation detected; add wide/medium/close variety.")

    if scenes and not any(
        any(phrase in (s.get("narration") or "").lower() for phrase in ("why this matters", "matters to you", "this matters"))
        for s in scenes
    ):
        issues.append("Missing explicit 'why this matters' line in narration.")
    if scenes and not any(
        any(phrase in (s.get("narration") or "").lower() for phrase in ("takeaway", "lesson", "here's the point", "bottom line", "in short"))
        for s in scenes
    ):
        issues.append("Missing clear takeaway line in narration.")

    return issues


async def generate_script(
    concept: str,
    story_type: str = "general",
    word_count: int = 400,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.8,
    story_template: str = "default",
) -> str:
    if story_template not in STORY_TEMPLATE_IDS:
        story_template = "default"

    hook_template = STORY_HOOK_TEMPLATES.get(
        story_type, "Open with a curiosity gap that feels immediately relevant to the viewer."
    )
    critical_requirements = (
        "CRITICAL REQUIREMENTS:\n"
        "- OPENING HOOK: First sentence must create curiosity gap, shock, or immediate relevance "
        "(use 'you', 'what if', 'nobody tells you' where natural)\n"
        "- REALISM: Include specific numbers, names, dates, or verifiable details (not vague claims)\n"
        "- PACING: Vary sentence length (3–8 words for impact, 12–18 for explanation)\n"
        "- EMOTIONAL ARC: Build tension → revelation → resolution across the script\n"
        "- CONCRETE IMAGERY: Use sensory details that can be visualized\n"
        "- DEPTH: Add concrete context, causes, consequences, and at least one specific example\n"
        f"- HOOK TEMPLATE: {hook_template}\n"
    )

    if story_template == "default":
        system_prompt = (
            f"You are a professional short-form video scriptwriter. "
            f"Write a compelling, SUBSTANTIAL {story_type} script for a faceless video narration. "
            f"{critical_requirements}"
            f"CRITICAL: The script MUST be at least {word_count} words. Do NOT write a brief or short script. "
            f"Expand on the concept with detail, examples, and engaging content. "
            f"Write ONLY the narration text - no scene directions, no brackets, no stage directions. "
            f"Make it engaging, with a strong hook in the first sentence. "
            f"Use short, punchy sentences suitable for voice-over narration."
        )
        user_content = f"Create a script about: {concept}"
    else:
        guide = STORY_TEMPLATE_SCRIPT_GUIDES.get(story_template)
        if not guide:
            return await generate_script(
                concept, story_type, word_count, llm_provider, llm_model, temperature, "default"
            )
        system_prompt = (
            f"You are a professional short-form video scriptwriter. "
            f"Genre/tone category: {story_type}. "
            f"{critical_requirements}"
            f"CRITICAL: The script MUST be at least {word_count} words. Do NOT write a brief or short script. "
            f"Write ONLY speakable narration: no beat labels (no HOOK:, PATTERN:, etc.), no markdown headings, "
            f"no scene numbers, no stage directions, no brackets. "
            f"Use short, punchy sentences suitable for voice-over. "
            f"STRUCTURE AND STYLE:\n{guide.format(word_count=word_count, story_type=story_type)}"
        )
        user_content = (
            f"Create a script about:\n{concept}\n\n"
            "Follow the narrative structure in your instructions. Output plain narration only."
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    return await chat_completion(messages, llm_provider, llm_model, temperature)


async def rewrite_script(
    text: str,
    instruction: str,
    story_type: str = "general",
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
) -> str:
    """Rewrite narration text with a targeted editing instruction."""
    system_prompt = (
        "You are a professional short-form video script editor. "
        "Rewrite the provided narration to follow the instruction precisely. "
        "Keep the same language and output ONLY the rewritten narration text. "
        f"Story tone category: {story_type}."
    )
    user_content = f"Instruction: {instruction}\n\nText:\n{text}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    return await chat_completion(messages, llm_provider, llm_model, temperature)


async def generate_story_and_storyboard(
    concept: str | None = None,
    script: str | None = None,
    story_type: str = "general",
    scene_count: int = 5,
    image_style: str = "realistic",
    resolution: str = "1080x1920",
    transition: str = "fade",
    word_count: int = 400,
    scene_narration_style: str = "balanced",
    generate_subtitles: bool = True,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
    story_template: str = "default",
    visual_continuity: str | None = None,
    with_quality_gate: bool = True,
    scene_duration_min: int = 2,
    scene_duration_max: int = 4,
) -> dict:
    """Generate a full storyboard with title, script, and per-scene breakdown."""
    if story_template not in STORY_TEMPLATE_IDS:
        story_template = "default"
    paced_min_duration, paced_max_duration = resolve_scene_pacing_bounds(
        scene_narration_style,
        min_duration=scene_duration_min,
        max_duration=scene_duration_max,
    )

    if not script and concept:
        script = await generate_script(
            concept,
            story_type,
            word_count or 400,
            llm_provider,
            llm_model,
            temperature,
            story_template,
        )
    elif not script:
        raise ValueError("Either concept or script must be provided")

    caption_note = ""
    if generate_subtitles:
        caption_note = (
            "On-screen captions will use each scene's narration verbatim (full spoken text), "
            "so keep narration clear and well-punctuated for readability.\n"
        )
    narration_pacing_note = _scene_narration_style_note(scene_narration_style)

    continuity_note = ""
    if visual_continuity:
        continuity_note = (
            f"VISUAL CONTINUITY: Keep the following consistent across all scenes: {visual_continuity}. "
            "Apply it to color palette, mood, and recurring motifs.\n"
        )

    system_prompt = (
        f"You are a video storyboard planner for faceless short-form videos. "
        f"Given a narration script, split it into exactly {scene_count} scenes. "
        f"{caption_note}"
        f"MEANINGFUL NARRATIVE REQUIREMENTS:\n"
        f"- Ensure one scene explicitly answers why this matters to the viewer.\n"
        f"- End with a clear takeaway or forward-looking line (no CTA).\n"
        f"- Keep narration detailed and concrete in every scene; avoid generic filler lines.\n"
        f"- Preserve chronology: scene narration must follow the script order without jumping ahead.\n"
        f"- Aim for scenes that usually land around {paced_min_duration}-{paced_max_duration} seconds of spoken narration before any cut.\n"
        f"- If a scene changes time, cause, or perspective, write the transition naturally in that scene's narration or provide an optional bridge_line field.\n"
        f"{narration_pacing_note}"
        f"SHOT VARIATION:\n"
        f"- Alternate wide/medium/close framing across scenes to avoid repetition.\n"
        f"{continuity_note}"
        f"CRITICAL IMAGE PROMPT REQUIREMENTS:\n"
        f"- Each image_prompt must directly visualize the narration's key subject/action\n"
        f"- Include: subject, environment, lighting, mood, camera angle, color palette\n"
        f"- Match emotional tone of narration (tense=dark/shadows, hopeful=bright/warm)\n"
        f"- Use {image_style} style consistently but vary composition per scene\n"
        f"- Respect requested framing from frontend settings: {resolution}\n"
        f"- Respect default transition pacing from frontend settings: {transition}\n"
        f"- NO text in images unless signage is story-critical\n"
        f"- Avoid real politicians, celebrities, or public figures; use anonymous or fictional stand-ins instead\n"
        f"- Each image_prompt must be at least {MIN_IMAGE_PROMPT_WORDS} words\n"
        f"For each scene, provide:\n"
        f"- narration: The exact narration text for that scene (this is what is spoken and shown as captions)\n"
        f"- optional bridge_line: only when needed, a short natural transition that should be spoken before the main narration\n"
        f"- image_prompt: A detailed image generation prompt in {image_style} style. "
        f"  Describe the visual scene vividly: subject, composition, lighting, mood, colors.\n"
        f"- transition: One of: fade, dissolve, wipeleft, slideup, zoom_in, zoom_out, pan_left, pan_right\n\n"
        f"Return valid JSON with this structure:\n"
        f'{{"title": "...", "scenes": [{{"narration": "...", "image_prompt": "...", "transition": "..."}}]}}'
    )
    if story_template != "default":
        system_prompt += _storyboard_arc_addon(scene_count, image_style, story_template)

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Example good image_prompt: "
                "'Vertical 9:16 cinematic still, abandoned hospital corridor at dusk, flickering fluorescent light, "
                "peeling paint on walls, ominous shadows stretching toward camera, desaturated green-blue color grade, "
                "photorealistic, shallow depth of field'"
            ),
        },
        {"role": "user", "content": f"Script:\n{script}"},
    ]
    raw = await chat_completion(messages, llm_provider, llm_model, temperature, max_tokens=8192)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]

    try:
        storyboard = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            storyboard = json.loads(raw[start:end])
        else:
            raise ValueError("Failed to parse storyboard JSON from LLM response")

    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        logger.warning("Storyboard response missing scenes; building fallback scenes.")
    storyboard["scenes"] = _ensure_scene_count_exact(
        scenes,
        scene_count=scene_count,
        fallback_script=script,
        image_style=image_style,
    )
    storyboard["script"] = script
    if visual_continuity:
        storyboard["visual_continuity"] = visual_continuity
    normalized_scenes = normalize_scene_narration(
        storyboard.get("scenes", []),
        script=script,
    )
    normalized_scenes = enforce_scene_pacing(
        normalized_scenes,
        min_duration=paced_min_duration,
        max_duration=paced_max_duration,
    )
    normalized_scenes = apply_ai_scene_bridges(normalized_scenes)
    storyboard["scenes"] = normalized_scenes
    # Subtitle field in DB/UI matches spoken line (full narration — used for captions on re-export)
    for i, sc in enumerate(normalized_scenes):
        nar = (sc.get("narration") or "").strip()
        if generate_subtitles:
            sc["subtitle"] = nar
        elif not (sc.get("subtitle") or "").strip():
            sc["subtitle"] = nar
        scene_emotion = _scene_emotion_for_index(i, len(normalized_scenes))
        sc["image_prompt"] = enhance_image_prompt(
            sc.get("image_prompt") or "",
            nar,
            scene_emotion,
            image_style,
            resolution=resolution,
            transition=transition,
            visual_continuity=visual_continuity,
            scene_index=i,
            total_scenes=len(normalized_scenes),
            min_words=MIN_IMAGE_PROMPT_WORDS,
        )
        sc["scene_emotion"] = scene_emotion
    hook_analysis = {"weak": False, "reason": "", "suggestions": []}
    if normalized_scenes:
        hook_analysis = await analyze_hook_quality(
            script_text=script,
            concept=concept or storyboard.get("title") or story_type,
            story_type=story_type,
            llm_provider=llm_provider,
            llm_model=llm_model,
        )
    if hook_analysis["suggestions"]:
        storyboard["hook_suggestions"] = hook_analysis["suggestions"]
    if with_quality_gate:
        issues = validate_storyboard_quality(storyboard)
        if hook_analysis["weak"]:
            detail = f" {hook_analysis['reason']}" if hook_analysis["reason"] else ""
            issues.append(f"Weak first-scene hook detected; consider a sharper opening line.{detail}")
        if issues:
            storyboard["quality_issues"] = issues
            logger.warning("Storyboard quality issues: %s", "; ".join(issues))
    return storyboard


# Storyboard prompts feed ShortsForge's image + narration pipeline (vertical shorts), not text-to-video APIs.
VIDEO_PRODUCTION_SYSTEM_PROMPT = """You are a director and scriptwriter for short-form vertical video (9:16) built from still images plus voiceover.

The app generates one still image per scene from your **image_prompt**, then uses **script** as narration/captions. Write prompts that describe a single clear key frame (not a full video clip).
If a scene needs a transition from the previous beat, either include that transition naturally inside **script** or add an optional **bridge_line** field.

Each scene must include:

1. **timestamp**: Format "0:00-0:05" (start-end in MM:SS)
2. **duration_seconds**: Numeric duration (e.g. 5.0), typically 4–8 seconds per scene
3. **camera_angle**: Shot type and framing (wide, medium, close-up, low/high angle, etc.)
4. **camera_movement**: Implied motion for composition (even though the output is a still, this guides mood and staging)
5. **lighting**: Direction, quality, time of day, color
6. **quality**: Visual style for the still (e.g. photorealistic, cinematic color grade, clean YouTube thumbnail look, documentary)
7. **script**: Spoken line for this scene — concise, punchy, fits the duration
8. **image_prompt**: One self-contained English prompt for image generation. Must work as a still frame:
   - Vertical short framing when relevant (subject placement for 9:16)
   - Concrete subject, action frozen in time, environment, lighting, style
   - No on-screen text in the image unless the concept requires signage
   - Do not mention "Sora", "Runway", or other video APIs

Return valid JSON only:
{
  "title": "Video title",
  "total_duration_seconds": 30,
  "scenes": [
    {
      "scene_number": 1,
      "timestamp": "0:00-0:05",
      "duration_seconds": 5.0,
      "camera_angle": "Wide establishing shot, eye level",
      "camera_movement": "Slow push in implied",
      "lighting": "Golden hour, soft key from camera left",
      "quality": "Cinematic, shallow depth of field, photorealistic",
      "bridge_line": "Because of that, everything changes.",
      "script": "Have you ever wondered...",
      "image_prompt": "Vertical 9:16 cinematic still, bustling Tokyo street market at golden hour, steam rising from food stalls, shallow depth of field, warm practical lights, photorealistic"
    }
  ]
}"""


async def generate_video_production_script(
    concept: str,
    story_type: str = "general",
    scene_count: int = 5,
    image_style: str = "realistic",
    resolution: str = "1080x1920",
    transition: str = "fade",
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
    visual_continuity: str | None = None,
    scene_narration_style: str = "balanced",
    min_image_prompt_words: int = MIN_IMAGE_PROMPT_WORDS,
    scene_duration_min: int = 2,
    scene_duration_max: int = 4,
) -> dict:
    """Generate a professional video production script with timestamps, camera angles, lighting, quality per scene."""
    paced_min_duration, paced_max_duration = resolve_scene_pacing_bounds(
        scene_narration_style,
        min_duration=scene_duration_min,
        max_duration=scene_duration_max,
    )
    narration_pacing_note = _scene_narration_style_note(scene_narration_style)
    continuity_note = ""
    if visual_continuity:
        continuity_note = f"\nVisual continuity: {visual_continuity}. Keep this consistent across scenes (palette/motif/mood)."

    user_prompt = f"""Create a {scene_count}-scene storyboard for vertical shorts (still images + voiceover).

Concept: {concept}
Story type: {story_type}{continuity_note}

Each scene should usually land around {paced_min_duration}-{paced_max_duration} seconds of spoken content.
{narration_pacing_note.strip()}
**image_prompt** must be a single strong still-image description per scene.
Use frontend visual settings exactly: style={image_style}, resolution={resolution}, transition={transition}.
Each image_prompt must contain at least {max(120, int(min_image_prompt_words))} words.
Include one scene that explicitly says why this matters to the viewer, and end with a clear takeaway line.
Alternate wide/medium/close framing across scenes. If a scene needs a transition from the previous beat, include it naturally in script or add an optional bridge_line. Avoid depicting real public figures; prefer anonymous or fictional stand-ins. Return valid JSON only."""

    messages = [
        {"role": "system", "content": VIDEO_PRODUCTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    raw = await chat_completion(messages, llm_provider, llm_model, temperature, max_tokens=8192)
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
        else:
            raise ValueError("Failed to parse video production script JSON from LLM response")

    raw_scenes = _ensure_scene_count_exact(
        result.get("scenes", []),
        scene_count=scene_count,
        fallback_script=concept,
        image_style=image_style,
    )
    scenes = normalize_scene_narration(
        raw_scenes,
        script=concept,
    )
    scenes = enforce_scene_pacing(
        scenes,
        min_duration=paced_min_duration,
        max_duration=paced_max_duration,
    )
    scenes = apply_ai_scene_bridges(scenes)
    # Ensure scene_number and all fields exist
    for i, scene in enumerate(scenes):
        scene["scene_number"] = scene.get("scene_number", i + 1)
        start_sec = i * 5
        end_sec = (i + 1) * 5
        scene.setdefault(
            "timestamp",
            f"{start_sec // 60}:{start_sec % 60:02d}-{end_sec // 60}:{end_sec % 60:02d}",
        )
        scene.setdefault("duration_seconds", 5.0)
        scene.setdefault("camera_angle", "Medium shot")
        scene.setdefault("camera_movement", "Static")
        scene.setdefault("lighting", "Natural light")
        scene.setdefault("quality", "4K cinematic")
        scene["script"] = (scene.get("script") or scene.get("narration") or "").strip()
        raw_img = (scene.get("image_prompt") or scene.get("sora_prompt") or "").strip()
        if not raw_img:
            raw_img = ", ".join(
                x for x in (
                    scene.get("camera_angle"),
                    scene.get("camera_movement"),
                    scene.get("lighting"),
                    scene.get("script"),
                ) if x
            )
        scene_emotion = _scene_emotion_for_index(i, len(scenes))
        scene["image_prompt"] = enhance_image_prompt(
            raw_img,
            scene.get("script", ""),
            scene_emotion,
            image_style,
            resolution=resolution,
            transition=transition,
            visual_continuity=visual_continuity,
            scene_index=i,
            total_scenes=len(scenes),
            min_words=min_image_prompt_words,
        )
        scene["scene_emotion"] = scene_emotion
        scene.pop("sora_prompt", None)

    result["scenes"] = scenes
    result["script"] = "\n\n".join(
        (scene.get("script") or scene.get("narration") or "").strip()
        for scene in scenes
        if (scene.get("script") or scene.get("narration") or "").strip()
    )
    if visual_continuity:
        result["visual_continuity"] = visual_continuity
    issues = validate_storyboard_quality({"scenes": scenes, "visual_continuity": visual_continuity})
    hook_analysis = {"weak": False, "reason": "", "suggestions": []}
    if scenes:
        hook_analysis = await analyze_hook_quality(
            script_text=result.get("script") or concept,
            concept=concept,
            story_type=story_type,
            llm_provider=llm_provider,
            llm_model=llm_model,
        )
    if hook_analysis["weak"]:
        detail = f" {hook_analysis['reason']}" if hook_analysis["reason"] else ""
        issues.append(f"Weak first-scene hook detected; consider a stronger opening.{detail}")
    if hook_analysis["suggestions"]:
        result["hook_suggestions"] = hook_analysis["suggestions"]
    if issues:
        result["quality_issues"] = issues
        logger.warning("Storyboard quality issues: %s", "; ".join(issues))
    return result


_LOCKED_STORYBOARD_FIELDS = frozenset({
    "narration", "subtitle", "image_prompt", "duration", "transition",
    "transition_type",
})


def merge_storyboard_patch_respecting_locks(
    existing_scene: Any,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    """Drop protected keys from an incoming scene dict when the DB scene is user-locked."""
    if not getattr(existing_scene, "is_locked", False):
        return dict(incoming)
    out = {k: v for k, v in incoming.items() if k not in _LOCKED_STORYBOARD_FIELDS}
    return out
