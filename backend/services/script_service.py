from __future__ import annotations

from difflib import SequenceMatcher
import json
import logging
import math
import re
from typing import Any

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)

DEFAULT_REFINED_CHARACTER_STYLE_PROMPT = (
    "comic book illustration, bold black outlines, dramatic shading, "
    "graphic novel style, political cartoon aesthetic"
)


def _extract_json_substring(raw: str) -> tuple[str | None, int, int]:
    """
    Attempt to find a balanced JSON substring in `raw`.
    Returns (substring, start_index, end_index) or (None, -1, -1) if not found.
    Handles both objects `{...}` and arrays `[...]`.
    """
    if not raw:
        return None, -1, -1
    for i, ch in enumerate(raw):
        if ch in "{[":
            open_ch = ch
            close_ch = "}" if ch == "{" else "]"
            depth = 0
            for j in range(i, len(raw)):
                if raw[j] == open_ch:
                    depth += 1
                elif raw[j] == close_ch:
                    depth -= 1
                    if depth == 0:
                        return raw[i : j + 1], i, j + 1
    return None, -1, -1

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
    {
        "id": "myth_vs_reality",
        "name": "Myth vs reality",
        "description": "Opens with a common belief, then flips it with evidence, context, and a sharper takeaway.",
    },
    {
        "id": "countdown_reveal",
        "name": "Countdown reveal",
        "description": "Builds momentum through ranked beats that culminate in the strongest point last.",
    },
    {
        "id": "before_after_shift",
        "name": "Before / after shift",
        "description": "Shows how a situation changed, what caused it, and why the difference matters now.",
    },
    {
        "id": "domino_effect",
        "name": "Domino effect",
        "description": "Tracks how one trigger set off a chain of consequences that kept escalating.",
    },
    {
        "id": "investigative_breakdown",
        "name": "Investigative breakdown",
        "description": "Follows clues, contradictions, and evidence until the bigger picture becomes clear.",
    },
    {
        "id": "rise_fall_rebound",
        "name": "Rise, fall, rebound",
        "description": "Charts a sharp ascent, the breaking point, and the lesson or comeback that followed.",
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
DYNAMIC_SCENE_MIN = 3
DYNAMIC_SCENE_MAX = 12
NARRATION_DUPLICATE_LOOKBACK = 3
NARRATION_DUPLICATE_SIMILARITY = 0.9
NARRATION_AUTO_IMPROVE_THRESHOLD = 70  # scenes scoring below this get an LLM improvement pass

# Q5: Style-conditional image prompt padding — prevents photorealistic texture
# copy from conflicting with comic_book / anime / watercolor style signals.
STYLE_PADDING_MAP: dict[str, list[str]] = {
    "comic_book": [
        (
            "Use bold, clean ink outlines with confident line weight variation. Apply cel-shaded flat color fills "
            "with hard shadows and stylized highlights typical of American comic art. "
            "Incorporate halftone dot patterns in shadow areas or backgrounds where appropriate. "
            "Composition should feel dynamic and panel-ready: strong silhouettes, expressive poses, clear action lines."
        ),
        (
            "Color palette should be saturated and vibrant with black for outlines and shadow fills. "
            "Avoid photorealistic gradients; use two-to-three tonal fills per element instead. "
            "Include Ben-Day dot textures or crosshatching for depth. "
            "Foreground elements should have the heaviest linework; backgrounds use thinner strokes."
        ),
    ],
    "political_cartoon": [
        (
            "Caricature proportions with exaggerated facial features and expressive body language conveying satire. "
            "Bold editorial ink lines, simple flat fills, minimal background detail to keep focus on the subject. "
            "Include symbolic props or contextual objects that reinforce the editorial message without text labels."
        ),
    ],
    "anime": [
        (
            "Clean, precise linework with smooth clean contours and subtle line taper at tips. "
            "Apply soft gradient shading with 2-3 tonal layers — a base, a shadow, and a highlight. "
            "Eyes should be large and expressive with specular catch-lights. "
            "Backgrounds can be more painterly and loose to contrast the crisp character design."
        ),
        (
            "Use manga-style speed lines or motion blur to imply action. "
            "Color should be vibrant with a tendency toward cooler hues for shadows and warmer highlights. "
            "Hair follows anime stylization (grouped chunky highlights, flowing dynamics). "
            "Avoid photorealistic skin textures; use smooth flat areas with stylized planes."
        ),
    ],
    "watercolor": [
        (
            "Soft wet-on-wet color blooms with visible paper grain and pigment granulation in wash areas. "
            "Edges should vary between hard-edged details and soft lost edges to create airiness. "
            "Colors should bleed into adjacent areas slightly, creating natural mixing effects in shadow zones. "
            "Reserve whites by leaving the paper untouched rather than using white paint."
        ),
    ],
    "oil_painting": [
        (
            "Visible, directional brushstroke texture with impasto thickness in highlights and focal areas. "
            "Rich color mixing with layered glazes creating luminous depth in shadow regions. "
            "Warm-cool color contrast in light and shadow transitions, following traditional chiaroscuro principles. "
            "Environment and background painted with broader, looser strokes than the primary subject."
        ),
    ],
    "photorealistic": [
        (
            "Surface wear, fabric texture, dust particles suspended in shafts of light, subtle reflections in surfaces, "
            "material response to light sources (specular on metal, subsurface scatter on skin), believable micro-imperfections "
            "on every prop and surface. Every element should look intentionally placed to reinforce the spoken beat."
        ),
        (
            "Design spatial storytelling with three readable depth planes: detailed foreground cues, primary midground action, "
            "and a contextual background with atmospheric perspective. "
            "Use overlap and perspective lines so the viewer instantly understands where to look first."
        ),
    ],
    "realistic": [
        (
            "Surface wear, fabric texture, dust particles suspended in shafts of light, subtle reflections in surfaces, "
            "material response to light sources (specular on metal, subsurface scatter on skin), believable micro-imperfections. "
            "Every prop should look intentionally placed to reinforce the spoken beat."
        ),
        (
            "Design spatial storytelling with three readable depth planes: detailed foreground cues, primary midground action, "
            "and a contextual background with atmospheric perspective. "
            "Use overlap and perspective lines so the viewer instantly understands where to look first."
        ),
    ],
}
# Fallback blocks used when the style has no specific STYLE_PADDING_MAP entry
DEFAULT_STYLE_PADDING: list[str] = [
    (
        "Include a concrete subject, specific environment, believable textures, and a strong foreground/background relationship. "
        "Keep composition clean and the focal point instantly readable on mobile."
    ),
]

COMMON_TTS_TEXT_FIXES: tuple[tuple[str, str], ...] = (
    ("M hoves", "moves"),
    ("M oves", "moves"),
    ("plan chette", "planchette"),
    ("Oui ja", "Ouija"),
    ("spine s", "spines"),
)
INLINE_STAGE_DIRECTION_PATTERN = re.compile(r"\s*[\(\[][^()\[\]\n]{1,80}[\)\]](?=\s|$|[,.!?])")

SPOKEN_WORD_CUES = ("spelling out", "saying", "whispering", "shouting")
SENTENCE_BREAK_PREFIXES = (
    "The",
    "A",
    "An",
    "This",
    "That",
    "It",
    "He",
    "She",
    "They",
    "We",
    "You",
    "Then",
    "Suddenly",
    "Meanwhile",
)

STORY_TYPE_PACING_RULES: dict[str, dict[str, Any]] = {
    "scary": {
        "avg_words_min": 5,
        "avg_words_max": 11,
        "hook_style": "mystery and immediate danger",
        "pacing_note": "Use shorter, tense sentences with frequent clean stops for suspense.",
    },
    "mystery": {
        "avg_words_min": 6,
        "avg_words_max": 12,
        "hook_style": "curiosity and unanswered questions",
        "pacing_note": "Let each line reveal a clue or contradiction before moving on.",
    },
    "motivational": {
        "avg_words_min": 7,
        "avg_words_max": 15,
        "hook_style": "relatable struggle and turnaround",
        "pacing_note": "Vary short punch lines with one fuller sentence that lands the insight.",
    },
    "history": {
        "avg_words_min": 7,
        "avg_words_max": 16,
        "hook_style": "surprising historical relevance",
        "pacing_note": "Balance clarity and momentum so facts still sound spoken, not textbook.",
    },
    "science": {
        "avg_words_min": 7,
        "avg_words_max": 15,
        "hook_style": "counterintuitive fact or reveal",
        "pacing_note": "Keep explanations tight and concrete with clean sentence boundaries.",
    },
    "fun_facts": {
        "avg_words_min": 6,
        "avg_words_max": 13,
        "hook_style": "surprise and novelty",
        "pacing_note": "Keep the delivery brisk and curiosity-driven with minimal filler.",
    },
    "life_pro_tips": {
        "avg_words_min": 6,
        "avg_words_max": 14,
        "hook_style": "immediate usefulness",
        "pacing_note": "Lead with practical payoff, then explain fast and clearly.",
    },
    "bedtime": {
        "avg_words_min": 8,
        "avg_words_max": 17,
        "hook_style": "calm intrigue",
        "pacing_note": "Use smoother, gentler lines with softer transitions between thoughts.",
    },
    "philosophy": {
        "avg_words_min": 8,
        "avg_words_max": 18,
        "hook_style": "provocative question or idea",
        "pacing_note": "Allow slightly fuller sentences, but keep each thought easy to speak aloud.",
    },
    "general": {
        "avg_words_min": 6,
        "avg_words_max": 14,
        "hook_style": "clear relevance and curiosity",
        "pacing_note": "Keep narration compact, visual, and easy for TTS to breathe through.",
    },
}


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


def _resolve_dynamic_scene_target(script: str, scene_narration_style: str | None) -> int:
    words = _count_words(script or "")
    base = round(words / 55) if words else 5
    style = normalize_scene_narration_style(scene_narration_style)
    style_adjustment = {"short": 1, "balanced": 0, "long": -1}
    target = base + style_adjustment[style]
    return max(DYNAMIC_SCENE_MIN, min(DYNAMIC_SCENE_MAX, target))


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
    "myth_vs_reality": (
        "Structure: (1) Hook with a belief, assumption, or viral claim people think is true. "
        "(2) Explain why that belief feels persuasive. (3) Reveal what the reality actually is with concrete context, "
        "evidence, or mechanism. (4) Close with the sharper takeaway or implication for the viewer. "
        "Keep the tone clear and corrective, not smug. About {word_count} words (±10%). Category: {story_type}."
    ),
    "countdown_reveal": (
        "Structure: (1) Hook with a promise that multiple surprising points are coming. "
        "(2) Move through 3-5 escalating beats in a ranked or stacked rhythm, saving the strongest beat for last. "
        "(3) Make each beat concise but concrete. (4) End with the final reveal and why it matters. "
        "Do not literally number the beats in the output unless it feels natural in spoken narration. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
    "before_after_shift": (
        "Structure: (1) Hook with the contrast between how things used to be and how they are now. "
        "(2) Paint the 'before' state with one or two concrete details. (3) Show the turning point or cause of change. "
        "(4) Explain the 'after' state and why the shift matters to viewers now. "
        "Keep the contrast vivid and easy to visualize. About {word_count} words (±10%). Category: {story_type}."
    ),
    "domino_effect": (
        "Structure: (1) Hook with one trigger event or decision. (2) Show the first consequence. "
        "(3) Trace the chain reaction through escalating second- and third-order effects. "
        "(4) End with the outcome people should pay attention to now. "
        "Emphasize causality and momentum so each beat clearly leads to the next. "
        "About {word_count} words (±10%). Category: {story_type}."
    ),
    "investigative_breakdown": (
        "Structure: (1) Hook with a contradiction, suspicious detail, or unanswered question. "
        "(2) Walk through the clues or facts one by one. (3) Show how they connect into a bigger pattern or explanation. "
        "(4) End with the clearest conclusion or open question that remains. "
        "Tone: observant, precise, evidence-first. About {word_count} words (±10%). Category: {story_type}."
    ),
    "rise_fall_rebound": (
        "Structure: (1) Hook with the peak moment or breakout success. (2) Show how the rise happened. "
        "(3) Explain the setback, collapse, or reversal. (4) End with the rebound, lesson, or what happened next. "
        "Keep the emotional arc strong without turning melodramatic. About {word_count} words (±10%). Category: {story_type}."
    ),
}


def list_story_templates() -> list[dict[str, str]]:
    """Metadata for Create UI: id, name, description."""
    return list(STORY_TEMPLATES_META)


def _storyboard_arc_addon(
    scene_count: int | None,
    image_style: str,
    story_template: str,
    *,
    dynamic_scenes: bool = False,
) -> str:
    """Extra instructions when using a non-default story_template."""
    n = max(2, min(MAX_SCENE_COUNT, int(scene_count))) if scene_count else DYNAMIC_SCENE_MIN
    template_visual_notes = {
        "political_commentary": "Use symbolic imagery (scales, documents, crowds) not individual faces.",
        "corporate_expose": "Show systems, buildings, documents, data visualizations—professional aesthetic.",
        "historical_parallel": "Split between archival-style and modern imagery for contrast.",
        "urgent_warning": "High contrast, urgent colors (red/orange accents), clear stakes visualization.",
        "satirical_irony": "Visual contrast between stated claim and actual reality (split composition).",
        "myth_vs_reality": "Visualize misconception versus truth with clear contrast, proof artifacts, or explanatory overlays implied through composition.",
        "countdown_reveal": "Stage each scene as a stronger beat than the last; escalate scale, tension, or visual novelty toward the final scene.",
        "before_after_shift": "Use contrast in setting, wardrobe, condition, or mood to make change feel immediate and legible.",
        "domino_effect": "Show cause-and-effect visually through chained actions, spreading impact, or environments reacting over time.",
        "investigative_breakdown": "Lean on clues, evidence boards, documents, timelines, screens, or physical traces rather than character portraits.",
        "rise_fall_rebound": "Mirror the emotional arc with brighter ascent imagery, a low point with visual collapse, then a more grounded recovery.",
    }
    visual_note = template_visual_notes.get(story_template, "Match imagery to narration emotion.")
    lines = [
        "",
        f"NARRATIVE ARC ({story_template} template):",
        (
            f"- Split the script into the number of scenes needed to complete the story cleanly, usually {DYNAMIC_SCENE_MIN}-{DYNAMIC_SCENE_MAX} scenes. "
            "Choose the fewest scene breaks that preserve the full arc and keep narration copied verbatim from the script in order."
            if dynamic_scenes
            else f"- Split the script into exactly {n} scenes. narration for each scene must be copied verbatim from the script in order—no paraphrase."
        ),
        f"- Visual note: {visual_note}",
        f"- image_prompt: detailed, in {image_style} style; vary composition and mood per beat.",
        "- Choose transition to match emotional shifts (e.g. dissolve or zoom_in for revelation; wipeleft/pan for pattern sequences).",
        "- Scene roles:",
        "- Scene 1: Hook—bold focal imagery, high clarity, symbolic or striking composition.",
    ]
    if dynamic_scenes:
        lines.append("- Middle scenes: escalate the pattern only when a new beat is needed; do not add filler scenes.")
        lines.append("- Final scene: land the revelation or close cleanly without truncating the story.")
    elif n == 2:
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


def _coerce_dynamic_scene_count(
    scenes: Any,
    *,
    fallback_script: str,
    image_style: str,
    scene_narration_style: str | None,
) -> list[dict[str, Any]]:
    target = _resolve_dynamic_scene_target(fallback_script, scene_narration_style)
    fallback = _fallback_storyboard_scenes(
        fallback_script,
        scene_count=target,
        image_style=image_style,
    )
    if not isinstance(scenes, list) or not scenes:
        return fallback
    coerced = [dict(sc or {}) for sc in scenes if isinstance(sc, dict)]
    if not coerced:
        return fallback
    if len(coerced) < DYNAMIC_SCENE_MIN:
        coerced.extend(fallback[len(coerced):DYNAMIC_SCENE_MIN])
        return coerced
    if len(coerced) > DYNAMIC_SCENE_MAX:
        logger.warning(
            "Adjusting dynamic storyboard scene count from %s to max %s",
            len(coerced),
            DYNAMIC_SCENE_MAX,
        )
        return coerced[:DYNAMIC_SCENE_MAX]
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


def _normalize_similarity_text(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", (text or "").strip().lower())
    return re.sub(r"[^\w\s]", "", collapsed)


def _sanitize_dialogue_line(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    cleaned = INLINE_STAGE_DIRECTION_PATTERN.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\s+([,.;!?])", r"\1", cleaned)
    return cleaned


def sanitize_speaker_tagged_dialogue(text: str) -> str:
    lines: list[str] = []
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if ":" in line:
            speaker, spoken = line.split(":", 1)
            cleaned_spoken = _sanitize_dialogue_line(spoken)
            cleaned_line = f"{speaker.strip()}: {cleaned_spoken}".strip()
        else:
            cleaned_line = _sanitize_dialogue_line(line)
        if cleaned_line and not cleaned_line.endswith(":"):
            lines.append(cleaned_line)
    return "\n".join(lines)


def _narration_similarity(left: str, right: str) -> float:
    a = _normalize_similarity_text(left)
    b = _normalize_similarity_text(right)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _max_recent_similarity(
    text: str,
    previous_texts: list[str],
    *,
    lookback: int = NARRATION_DUPLICATE_LOOKBACK,
) -> float:
    if not previous_texts:
        return 0.0
    recent = previous_texts[-max(1, lookback):]
    return max((_narration_similarity(text, prev) for prev in recent), default=0.0)


def clean_tts_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""

    for wrong, right in COMMON_TTS_TEXT_FIXES:
        cleaned = cleaned.replace(wrong, right)

    cleaned = re.sub(r"\b([B-HJ-Zb-hj-z])\s+([a-z]{3,})\b", r"\1\2", cleaned)

    cue_pattern = "|".join(re.escape(cue) for cue in SPOKEN_WORD_CUES)

    def _quote_spoken_word(match: re.Match[str]) -> str:
        cue = match.group(1)
        word = match.group(2)
        quoted = word.upper() if cue.lower() == "spelling out" else word
        return f'{cue} "{quoted}"'

    cleaned = re.sub(
        rf"\b({cue_pattern})\s+([A-Za-z]{{3,}})\b",
        _quote_spoken_word,
        cleaned,
        flags=re.IGNORECASE,
    )

    prefix_pattern = "|".join(SENTENCE_BREAK_PREFIXES)
    cleaned = re.sub(
        rf'(?<=[a-z0-9"\'])\s+(?=(?:{prefix_pattern})\b)',
        ". ",
        cleaned,
    )
    cleaned = re.sub(r"\s+([,.;!?])", r"\1", cleaned)
    cleaned = re.sub(r"([,.;!?])([A-Za-z])", r"\1 \2", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"^([a-z])", lambda match: match.group(1).upper(), cleaned)
    if cleaned.endswith('"') and len(cleaned) > 1 and cleaned[-2] not in ".!?":
        cleaned = f"{cleaned}."
    elif cleaned and cleaned[-1] not in ".!?\"'":
        cleaned = f"{cleaned}."
    return cleaned


def repair_storyboard_scene_narration(
    scenes: list[dict[str, Any]],
    *,
    script: str | None = None,
    lookback: int = NARRATION_DUPLICATE_LOOKBACK,
    similarity_threshold: float = NARRATION_DUPLICATE_SIMILARITY,
    skip_indexes: set[int] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    if not isinstance(scenes, list):
        return [], []

    fallback_chunks = _derive_narration_chunks(script or "", len(scenes))
    protected = skip_indexes or set()
    repaired: list[dict[str, Any]] = []
    recent_narration: list[str] = []
    issues: list[str] = []

    for i, raw in enumerate(scenes):
        scene = dict(raw or {})
        original = (
            (scene.get("narration") or "").strip()
            or (scene.get("subtitle") or "").strip()
            or (scene.get("script") or "").strip()
            or fallback_chunks[i]
        )

        replacement = original
        if i not in protected:
            cleaned = clean_tts_text(original)
            if cleaned and cleaned != original:
                issues.append(f"Scene {i + 1}: cleaned narration text for TTS clarity.")
            replacement = cleaned or original
            recent_similarity = _max_recent_similarity(
                replacement,
                recent_narration,
                lookback=lookback,
            )
            if recent_similarity >= similarity_threshold:
                fallback = clean_tts_text(fallback_chunks[i])
                fallback_similarity = _max_recent_similarity(
                    fallback,
                    recent_narration,
                    lookback=lookback,
                )
                if (
                    fallback
                    and _normalize_similarity_text(fallback) != _normalize_similarity_text(replacement)
                    and fallback_similarity < similarity_threshold
                ):
                    replacement = fallback
                    issues.append(
                        f"Scene {i + 1}: replaced repeated narration with script-aligned fallback."
                    )
                else:
                    issues.append(f"Scene {i + 1}: repeated narration detected across nearby scenes.")

        subtitle = (scene.get("subtitle") or "").strip()
        script_text = (scene.get("script") or "").strip()
        scene["narration"] = replacement
        if not subtitle or subtitle == original or subtitle == replacement:
            scene["subtitle"] = replacement
        if not script_text or script_text == original or script_text == replacement:
            scene["script"] = replacement
        repaired.append(scene)
        recent_narration.append(replacement)

    return repaired, issues


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


def _story_type_pacing_rule(story_type: str | None) -> dict[str, Any]:
    key = str(story_type or "general").strip().lower()
    return STORY_TYPE_PACING_RULES.get(key, STORY_TYPE_PACING_RULES["general"])


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
        sub, start, end = _extract_json_substring(raw)
        if sub:
            try:
                payload = json.loads(sub)
            except json.JSONDecodeError:
                logger.debug(
                    "Failed to JSON-decode extracted payload for hook quality. start=%s end=%s snippet=%s",
                    start,
                    end,
                    (sub[:1000] + "...") if len(sub) > 1000 else sub,
                )
                return {"weak": False, "reason": "", "suggestions": []}
        else:
            logger.debug("No JSON substring found in hook quality response: %s", raw[:500])
            return {"weak": False, "reason": "", "suggestions": []}
    suggestions = payload.get("suggestions")
    if not isinstance(suggestions, list):
        suggestions = []
    return {
        "weak": bool(payload.get("weak")),
        "reason": str(payload.get("reason") or "").strip(),
        "suggestions": [str(line).strip() for line in suggestions if str(line).strip()][:3],
    }


def _estimate_pacing_score(text: str, story_type: str = "general") -> int:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if part.strip()]
    if not sentences:
        return 0
    word_counts = [_count_words(sentence) for sentence in sentences]
    average_words = sum(word_counts) / max(1, len(word_counts))
    rule = _story_type_pacing_rule(story_type)
    min_words = int(rule["avg_words_min"])
    max_words = int(rule["avg_words_max"])
    score = 100
    if average_words < min_words:
        score -= 25
    elif average_words > max_words:
        score -= 20
    if len(sentences) == 1 and _count_words(text) > max_words + 4:
        score -= 20
    if any(words > max_words + 8 for words in word_counts):
        score -= 15
    return max(0, min(100, score))


def _basic_hook_strength(text: str) -> tuple[int, str]:
    words = (text or "").strip().split()
    hook_words = words[:15]
    hook_text = " ".join(hook_words).strip()
    if not hook_text:
        return 0, ""

    lower_text = hook_text.lower()
    emotional_terms = {
        "secret", "fear", "wrong", "warning", "shocking", "hidden", "cold",
        "danger", "mystery", "survive", "truth", "trap", "terrifying",
    }
    emotional_count = sum(1 for word in re.findall(r"\b[\w'-]+\b", lower_text) if word in emotional_terms)
    score = 30
    if 8 <= len(hook_words) <= 15:
        score += 20
    if "?" in hook_text:
        score += 20
    if any(ch.isdigit() for ch in hook_text):
        score += 10
    if emotional_count >= 1:
        score += 10
    if emotional_count >= 2:
        score += 10
    return max(0, min(100, score)), hook_text


def analyze_narration_quality(
    text: str,
    *,
    story_type: str = "general",
    previous_narrations: list[str] | None = None,
    hook_analysis: dict[str, Any] | None = None,
    is_first_scene: bool = False,
) -> dict[str, Any]:
    previous_narrations = previous_narrations or []
    cleaned_text = clean_tts_text(text)
    cleaned_changed = cleaned_text != (text or "").strip()
    repetition_similarity = _max_recent_similarity(cleaned_text, previous_narrations)
    repetition_detected = repetition_similarity >= NARRATION_DUPLICATE_SIMILARITY
    pacing_rule = _story_type_pacing_rule(story_type)
    pacing_score = _estimate_pacing_score(cleaned_text, story_type)
    hook_strength, hook_text = _basic_hook_strength(cleaned_text if is_first_scene else "")

    issues: list[dict[str, str]] = []
    tts_issues: list[str] = []
    suggestions: list[str] = []

    if cleaned_changed:
        tts_issues.append("spacing_or_punctuation")
        issues.append(
            {
                "code": "tts_cleanup_needed",
                "message": "Narration benefits from text cleanup before TTS.",
                "severity": "warning",
            }
        )
        suggestions.append("Apply the cleaned narration text before generating audio.")
    if repetition_detected:
        issues.append(
            {
                "code": "recent_repetition",
                "message": "Narration is too similar to one of the previous three scenes.",
                "severity": "warning",
            }
        )
        suggestions.append("Rewrite this beat so it advances the story instead of repeating the prior scene.")
    if pacing_score < 70:
        issues.append(
            {
                "code": "pacing",
                "message": (
                    "Sentence pacing is likely too dense or too abrupt for natural narration. "
                    f"Target style for {story_type}: {pacing_rule['pacing_note']}"
                ),
                "severity": "warning",
            }
        )
        suggestions.append(
            f"Adjust pacing for {story_type}: {pacing_rule['pacing_note']}"
        )

    hook_suggestions: list[str] = []
    if is_first_scene and hook_analysis:
        hook_strength = max(0, hook_strength - (25 if hook_analysis.get("weak") else 0))
        hook_suggestions = [
            str(line).strip()
            for line in hook_analysis.get("suggestions", [])
            if str(line).strip()
        ][:3]
        suggestions.extend(line for line in hook_suggestions if line not in suggestions)
        if hook_analysis.get("weak"):
            issues.append(
                {
                    "code": "weak_hook",
                    "message": str(hook_analysis.get("reason") or "The opening hook is weak.").strip(),
                    "severity": "warning",
                }
            )

    score = 100
    if cleaned_changed:
        score -= 15
    if repetition_detected:
        score -= 30
    score = min(score, pacing_score if pacing_score < 100 else score)
    if is_first_scene:
        score = min(score, max(40, hook_strength))
    score = max(0, min(100, score))

    return {
        "score": score,
        "hook_strength": hook_strength if is_first_scene else 0,
        "pacing_score": pacing_score,
        "repetition_detected": repetition_detected,
        "tts_issues": tts_issues,
        "suggestions": suggestions[:5],
        "issues": issues,
        "cleaned_text": cleaned_text,
        "hook_text": hook_text if is_first_scene else None,
        "hook_suggestions": hook_suggestions,
    }


async def improve_narration_text(
    text: str,
    *,
    story_type: str = "general",
    previous_narrations: list[str] | None = None,
    is_first_scene: bool = False,
    issues: list[str] | None = None,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.4,
) -> str:
    cleaned = clean_tts_text(text)
    previous_narrations = previous_narrations or []
    issues = issues or []
    issue_notes = ", ".join(issues) if issues else "pacing, TTS clarity, and repetition"
    recent_context = "\n".join(f"- {line}" for line in previous_narrations[-NARRATION_DUPLICATE_LOOKBACK:] if line.strip())
    pacing_rule = _story_type_pacing_rule(story_type)
    opening_note = (
        f"Strengthen the first sentence so it works as a short-form hook built on {pacing_rule['hook_style']}."
        if is_first_scene
        else "Keep the narration flowing naturally from the prior scene."
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You improve short-form video narration. "
                "Return only the revised narration text with natural punctuation for TTS. "
                "Do not add scene labels, bullets, or explanations."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Story type: {story_type}\n"
                f"Current narration:\n{cleaned or text}\n\n"
                f"Recent previous scenes:\n{recent_context or '- none'}\n\n"
                f"Fix these issues: {issue_notes}\n"
                f"Genre pacing note: {pacing_rule['pacing_note']}\n"
                f"{opening_note}\n"
                "Keep the line concise, emotionally engaging, and clearly different from the prior scenes."
            ),
        },
    ]
    improved = await chat_completion(messages, llm_provider, llm_model, temperature, max_tokens=220)
    return clean_tts_text(improved)


def _build_prompt_padding_blocks(
    *,
    narration: str,
    image_style: str,
    scene_emotion: str,
    visual_continuity: str | None,
    transition: str | None,
) -> list[str]:
    """Legacy shim — delegates to the style-aware _style_padding_blocks."""
    return _style_padding_blocks(image_style, narration, visual_continuity, transition)


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
        "No on-screen text unless a story-critical sign is unavoidable."
    )
    # Q6: Vertical 9:16 subject-positioning guard — avoids subject overlapping subtitle zone
    import re as _re
    _res = (resolution or "").strip()
    _m = _re.match(r"^(\d+)x(\d+)$", _res)
    if _m and int(_m.group(2)) > int(_m.group(1)):
        prompt += (
            " Subject positioned in the center-to-lower two-thirds of the vertical frame"
            " to leave clear headroom above and avoid overlap with subtitle text at the bottom."
            " Avoid placing critical narrative detail in the top 20% or bottom 12% of frame."
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


def _style_padding_blocks(
    image_style: str,
    narration: str,
    visual_continuity: str | None,
    transition: str | None,
) -> list[str]:
    """Q5: Return style-appropriate padding blocks instead of always using photorealistic copy."""
    style_key = (image_style or "realistic").strip().lower().replace(" ", "_")
    # Try exact match, then prefix match (e.g. "comic_book_noir" → "comic_book")
    blocks = STYLE_PADDING_MAP.get(style_key)
    if not blocks:
        for key in STYLE_PADDING_MAP:
            if style_key.startswith(key) or key.startswith(style_key):
                blocks = STYLE_PADDING_MAP[key]
                break
    if not blocks:
        blocks = DEFAULT_STYLE_PADDING
    # Append universal depth/continuity blocks that apply to all styles
    continuity = (visual_continuity or "").strip() or "repeatable motifs and a unified color palette"
    move = (transition or "").strip() or "fade"
    nar = (narration or "").strip() or "the core spoken line"
    blocks = list(blocks) + [
        (
            f"Apply composition discipline: readable center of interest, safe negative space for mobile crop tolerance, "
            f"and a clear silhouette around the main subject. "
            f"Keep narrative momentum by visually implying a transition of type '{move}' into the next scene "
            f"through directional flow, gaze direction, or geometry."
        ),
        (
            f"Maintain visual continuity across scenes with this anchor: {continuity}. "
            f"Carry that continuity through color palette, motifs, and recurring environmental cues. "
            f"Every visual choice should reinforce this spoken beat: {nar}."
        ),
    ]
    return blocks



def validate_storyboard_quality(storyboard: dict) -> list[str]:
    """Check for common quality issues."""
    issues = []
    scenes = storyboard.get("scenes", []) if isinstance(storyboard, dict) else []
    continuity = (storyboard.get("visual_continuity") or "").strip().lower()

    all_narration = " ".join((s.get("narration") or "") for s in scenes).lower()
    # Q2: Extended shot variation synonyms
    WIDE_SYNOMYNS = {"wide", "establishing", "full body", "full-body", "long shot", "master"}
    CLOSE_SYNONYMS = {"close", "closeup", "close-up", "extreme close", "ecu", "face"}
    MEDIUM_SYNONYMS = {"medium", "mid shot", "mid-shot", "waist", "cowboy"}
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
        if any(x in prompt_l for x in WIDE_SYNOMYNS):
            shot_markers.append("wide")
        elif any(x in prompt_l for x in CLOSE_SYNONYMS):
            shot_markers.append("close")
        elif any(x in prompt_l for x in MEDIUM_SYNONYMS):
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


async def expand_concept_to_brief(
    concept: str,
    story_type: str = "general",
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> str:
    """
    Q1: Research pass — expand a thin concept into 5–8 concrete facts/angles/examples.

    This prevents the script generator from padding word count with vague filler.
    The returned brief is injected into generate_script() as extra context.
    Only called when the concept is short (< 120 chars), suggesting it is a thin seed.
    Returns empty string on failure so callers can skip gracefully.
    """
    concept = (concept or "").strip()
    if len(concept) < 5:
        return ""
    messages = [
        {
            "role": "system",
            "content": (
                "You are a research assistant for short-form video scriptwriters. "
                "Given a topic or concept, produce a tight research brief of 5-8 bullet points. "
                "Each bullet must be concrete: include a specific name, date, statistic, mechanism, or example. "
                "No vague generalities. No fluff. Output plain bullet points only (each starting with - )."
            ),
        },
        {
            "role": "user",
            "content": f"Topic: {concept}\nStory type: {story_type}\n\nWrite the research brief.",
        },
    ]
    try:
        raw = await chat_completion(messages, llm_provider, llm_model, 0.45, max_tokens=400)
        return raw.strip()
    except Exception:
        logger.debug("expand_concept_to_brief failed silently for concept=%s", concept[:60])
        return ""


async def generate_script(
    concept: str,
    story_type: str = "general",
    word_count: int = 400,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.8,
    story_template: str = "default",
    research_brief: str = "",
) -> str:
    """Generate a narration script. Pass research_brief for richer, specific outputs."""
    if story_template not in STORY_TEMPLATE_IDS:
        story_template = "default"

    # Q1: Inject concept brief if provided
    brief_block = ""
    if research_brief and research_brief.strip():
        brief_block = (
            f"\nRESEARCH BRIEF (use these specifics — weave them naturally into the narration):\n"
            f"{research_brief.strip()}\n"
        )

    hook_template = STORY_HOOK_TEMPLATES.get(
        story_type, "Open with a curiosity gap that feels immediately relevant to the viewer."
    )
    # Inform the model of approximate spoken duration to prevent under/over-writing
    spoken_seconds = round(word_count / 2.6)
    spoken_mins = spoken_seconds // 60
    spoken_secs = spoken_seconds % 60
    duration_hint = (
        f"≈ {spoken_mins}m {spoken_secs}s"
        if spoken_mins > 0
        else f"≈ {spoken_secs}s"
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
        f"- The script will be spoken at ~2.6 words/second; {word_count} words = {duration_hint} of narration.\n"
    )

    if story_template == "default":
        system_prompt = (
            f"You are a professional short-form video scriptwriter. "
            f"Write a compelling, SUBSTANTIAL {story_type} script for a faceless video narration. "
            f"{critical_requirements}"
            f"{brief_block}"
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
            f"{brief_block}"
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


def _build_character_id(seed: str, fallback_index: int, used_ids: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", seed.strip().lower()).strip("_")
    if not base:
        base = f"character_{fallback_index}"
    candidate = base
    suffix = 2
    while candidate in used_ids:
        candidate = f"{base}_{suffix}"
        suffix += 1
    used_ids.add(candidate)
    return candidate


def _normalize_refined_character_payload(
    raw_character: Any,
    fallback_index: int,
    used_ids: set[str],
) -> dict[str, Any] | None:
    if not isinstance(raw_character, dict):
        return None
    name = str(raw_character.get("name") or "").strip()
    if not name:
        return None
    description_parts = [
        str(raw_character.get("description") or "").strip(),
        str(raw_character.get("appearance") or "").strip(),
        str(raw_character.get("role") or "").strip(),
    ]
    description = ". ".join(part for part in description_parts if part)
    if not description:
        return None
    style_prompt = (
        str(raw_character.get("style_prompt") or "").strip()
        or DEFAULT_REFINED_CHARACTER_STYLE_PROMPT
    )
    voice_profile_raw = raw_character.get("voice_profile")
    voice_profile = str(voice_profile_raw).strip() if isinstance(voice_profile_raw, str) else None
    palette_raw = raw_character.get("color_palette")
    color_palette = None
    if isinstance(palette_raw, list):
        palette = [str(item).strip() for item in palette_raw if str(item).strip()]
        color_palette = palette or None
    character_id = _build_character_id(
        str(raw_character.get("id") or name),
        fallback_index,
        used_ids,
    )
    return {
        "id": character_id,
        "name": name,
        "description": description,
        "voice_profile": voice_profile or None,
        "reference_image_url": None,
        "style_prompt": style_prompt,
        "color_palette": color_palette,
    }


def _parse_refined_script_characters_response(raw: str) -> tuple[str, list[dict[str, Any]]]:
    json_blob, _, _ = _extract_json_substring(raw)
    if not json_blob:
        raise ValueError("Model did not return JSON.")
    payload = json.loads(json_blob)
    if not isinstance(payload, dict):
        raise ValueError("Model response JSON must be an object.")
    text = sanitize_speaker_tagged_dialogue(
        str(payload.get("text") or payload.get("script") or payload.get("refined_script") or "").strip()
    )
    if not text:
        raise ValueError("Model response did not include a refined script.")
    used_ids: set[str] = set()
    characters: list[dict[str, Any]] = []
    raw_characters = payload.get("characters")
    if not isinstance(raw_characters, list):
        raw_characters = []
    for index, raw_character in enumerate(raw_characters, start=1):
        character = _normalize_refined_character_payload(raw_character, index, used_ids)
        if character is not None:
            characters.append(character)
    if len(characters) < 2:
        raise ValueError("Model response did not include at least two characters.")
    return text, characters


async def refine_script_with_characters(
    text: str,
    instruction: str,
    story_type: str = "general",
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
) -> tuple[str, list[dict[str, Any]]]:
    system_prompt = (
        "You are an expert short-form video script doctor and dialogue casting assistant. "
        "Rewrite the supplied script according to the user's instruction, using web research when current facts, public figures, "
        "or real-world context would improve accuracy. "
        "Return ONLY valid JSON. The `text` field must be a ready-to-use dialogue script where every spoken line starts with "
        "`Character Name:`. If the source is narration instead of dialogue, adapt it into a natural conversation while preserving "
        "the core facts and tone. The `characters` array must contain 2 to 4 relevant characters who actually belong in the script. "
        "Each character needs a concise but visual description focused on appearance, clothing, silhouette, and iconic props so they "
        "can stay visually consistent across scenes. Every spoken line must be plain speakable dialogue only after the speaker label. "
        "Do not include parenthetical acting cues or bracketed stage directions such as `(smirking)`, `(whispers)`, or `[pause]` anywhere in the script. "
        "Do not include citations, markdown, or commentary outside the JSON object."
    )
    user_content = (
        "Rewrite this script and create relevant characters.\n\n"
        f"Story type: {story_type}\n"
        f"Instruction: {instruction}\n\n"
        "Return JSON in this shape:\n"
        "{\n"
        '  "text": "speaker-tagged dialogue script with plain spoken lines only and no parenthetical stage directions",\n'
        '  "characters": [\n'
        '    {"id": "optional_slug", "name": "Character name", "description": "visual description", "style_prompt": "optional style prompt", "voice_profile": null, "color_palette": ["optional", "palette"]}\n'
        "  ]\n"
        "}\n\n"
        f"Source script:\n{text}"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    raw_response = await chat_completion(
        messages,
        provider=llm_provider,
        model=llm_model,
        temperature=temperature,
        web_search=True,
        max_tokens=5000,
    )
    return _parse_refined_script_characters_response(raw_response)


async def generate_story_and_storyboard(
    concept: str | None = None,
    script: str | None = None,
    story_type: str = "general",
    scene_count: int = 5,
    dynamic_scenes: bool = False,
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

    # Q1: Run concept expansion brief for thin concepts (short seed phrases)
    if not script and concept:
        research_brief = ""
        if len((concept or "").strip()) < 120:
            research_brief = await expand_concept_to_brief(
                concept, story_type or "general", llm_provider, llm_model
            )
        script = await generate_script(
            concept,
            story_type,
            word_count or 400,
            llm_provider,
            llm_model,
            temperature,
            story_template,
            research_brief=research_brief,
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
    genre_pacing_note = _story_type_pacing_rule(story_type)["pacing_note"]

    continuity_note = ""
    if visual_continuity:
        continuity_note = (
            f"VISUAL CONTINUITY: Keep the following consistent across all scenes: {visual_continuity}. "
            "Apply it to color palette, mood, and recurring motifs.\n"
        )

    if dynamic_scenes:
        scene_prompt_instruction = (
            "Given a narration script, split it into the number of scenes needed to complete the story naturally. "
            f"Choose the fewest clear scene breaks that preserve the full arc, usually between {DYNAMIC_SCENE_MIN} and {DYNAMIC_SCENE_MAX} scenes. "
            "Do not pad with filler scenes or cut the ending short. "
        )
    else:
        scene_prompt_instruction = f"Given a narration script, split it into exactly {scene_count} scenes. "
    system_prompt = (
        f"You are a video storyboard planner for faceless short-form videos. "
        f"{scene_prompt_instruction}"
        f"{caption_note}"
        f"MEANINGFUL NARRATIVE REQUIREMENTS:\n"
        f"- Ensure one scene explicitly answers why this matters to the viewer.\n"
        f"- End with a clear takeaway or forward-looking line (no CTA).\n"
        f"- Keep narration detailed and concrete in every scene; avoid generic filler lines.\n"
        f"- Preserve chronology: scene narration must follow the script order without jumping ahead.\n"
        f"- Aim for scenes that usually land around {paced_min_duration}-{paced_max_duration} seconds of spoken narration before any cut.\n"
        f"- Story-type pacing note: {genre_pacing_note}\n"
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
        f"- Each image_prompt must be at least {MIN_IMAGE_PROMPT_WORDS} words\n"
        f"For each scene, provide:\n"
        f"- narration: The exact narration text for that scene (this is what is spoken and shown as captions)\n"
        f"- optional bridge_line: only when needed, a short natural transition that should be spoken before the main narration\n"
        f"- image_prompt: A detailed image generation prompt in {image_style} style. "
        f"  Describe the visual scene vividly: subject, composition, lighting, mood, colors.\n"
        f"- transition: One of: fade, fade_in_fade_out, zoom_in_zoom_out, dissolve, wipeleft, slideup, zoom_in, zoom_out, pan_left, pan_right\n\n"
        f"Return valid JSON with this structure:\n"
        f'{{"title": "...", "scenes": [{{"narration": "...", "image_prompt": "...", "transition": "..."}}]}}'
    )
    if story_template != "default":
        system_prompt += _storyboard_arc_addon(
            scene_count if not dynamic_scenes else None,
            image_style,
            story_template,
            dynamic_scenes=dynamic_scenes,
        )

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
        sub, start, end = _extract_json_substring(raw)
        if sub:
            try:
                storyboard = json.loads(sub)
            except json.JSONDecodeError as e:
                logger.error(
                    "Failed to parse extracted storyboard JSON (start=%s end=%s): %s",
                    start,
                    end,
                    e,
                )
                logger.debug("Raw LLM response snippet: %s", (sub[:2000] + "...") if len(sub) > 2000 else sub)
                raise ValueError("Failed to parse storyboard JSON from LLM response")
        else:
            logger.error("No JSON substring found in storyboard LLM response. Raw start: %s", raw[:500])
            raise ValueError("Failed to parse storyboard JSON from LLM response")

    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        logger.warning("Storyboard response missing scenes; building fallback scenes.")
    storyboard["scenes"] = (
        _coerce_dynamic_scene_count(
            scenes,
            fallback_script=script,
            image_style=image_style,
            scene_narration_style=scene_narration_style,
        )
        if dynamic_scenes
        else _ensure_scene_count_exact(
            scenes,
            scene_count=scene_count,
            fallback_script=script,
            image_style=image_style,
        )
    )
    storyboard["script"] = script
    if visual_continuity:
        storyboard["visual_continuity"] = visual_continuity
    normalized_scenes = normalize_scene_narration(
        storyboard.get("scenes", []),
        script=script,
    )
    normalized_scenes, narration_issues = repair_storyboard_scene_narration(
        normalized_scenes,
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
        issues = list(narration_issues)
        issues.extend(validate_storyboard_quality(storyboard))
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
    dynamic_scenes: bool = False,
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
    genre_pacing_note = _story_type_pacing_rule(story_type)["pacing_note"]
    continuity_note = ""
    if visual_continuity:
        continuity_note = f"\nVisual continuity: {visual_continuity}. Keep this consistent across scenes (palette/motif/mood)."

    if dynamic_scenes:
        scene_instruction = (
            "Create a storyboard for vertical shorts (still images + voiceover). "
            f"Choose the number of scenes needed to complete the story naturally, usually between {DYNAMIC_SCENE_MIN} and {DYNAMIC_SCENE_MAX} scenes, "
            "and avoid filler cuts."
        )
    else:
        scene_instruction = f"Create a {scene_count}-scene storyboard for vertical shorts (still images + voiceover)."
    user_prompt = f"""{scene_instruction}

Concept: {concept}
Story type: {story_type}{continuity_note}

Each scene should usually land around {paced_min_duration}-{paced_max_duration} seconds of spoken content.
{narration_pacing_note.strip()}
Story pacing note: {genre_pacing_note}
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
        sub, start, end = _extract_json_substring(raw)
        if sub:
            try:
                result = json.loads(sub)
            except json.JSONDecodeError as e:
                logger.error(
                    "Failed to parse extracted video production JSON (start=%s end=%s): %s",
                    start,
                    end,
                    e,
                )
                logger.debug("Raw LLM response snippet: %s", (sub[:2000] + "...") if len(sub) > 2000 else sub)
                raise ValueError("Failed to parse video production script JSON from LLM response")
        else:
            logger.error("No JSON substring found in video production LLM response. Raw start: %s", raw[:500])
            raise ValueError("Failed to parse video production script JSON from LLM response")

    raw_scenes = (
        _coerce_dynamic_scene_count(
            result.get("scenes", []),
            fallback_script=concept,
            image_style=image_style,
            scene_narration_style=scene_narration_style,
        )
        if dynamic_scenes
        else _ensure_scene_count_exact(
            result.get("scenes", []),
            scene_count=scene_count,
            fallback_script=concept,
            image_style=image_style,
        )
    )
    scenes = normalize_scene_narration(
        raw_scenes,
        script=concept,
    )
    scenes, narration_issues = repair_storyboard_scene_narration(
        scenes,
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
    issues = list(narration_issues)
    issues.extend(validate_storyboard_quality({"scenes": scenes, "visual_continuity": visual_continuity}))
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
