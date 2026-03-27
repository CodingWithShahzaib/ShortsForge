from __future__ import annotations

import json
import logging
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
        "description": "Balanced hook and pacing (classic ShortsForge behavior).",
    },
    {
        "id": "political_commentary",
        "name": "Political commentary",
        "description": "Hook, pattern of examples, revelation, forward-looking close. Use responsibly and factually.",
    },
    {
        "id": "corporate_expose",
        "name": "Corporate exposé",
        "description": "What’s hidden, who benefits, stakes for the viewer; professional analytical tone.",
    },
    {
        "id": "historical_parallel",
        "name": "Historical parallel",
        "description": "Past pattern, echo in the present, lesson or warning—clear and grounded.",
    },
    {
        "id": "satirical_irony",
        "name": "Satirical irony",
        "description": "Understated irony and contrast; witty, not cruel or personal attacks.",
    },
    {
        "id": "urgent_warning",
        "name": "Urgent warning",
        "description": "Stakes, what could happen, what to watch—credible tone without fear-mongering.",
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


def validate_story_template_field(value: str) -> str:
    if value not in STORY_TEMPLATE_IDS:
        raise ValueError(
            f"Invalid story_template '{value}'. Allowed: {', '.join(STORY_TEMPLATE_IDS)}"
        )
    return value

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
    n = max(2, min(15, int(scene_count)))
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
    target = max(1, min(15, int(scene_count) if scene_count else 5))
    cleaned = (script or "").strip()
    if not cleaned:
        cleaned = "A concise narration about the concept."
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    if not sentences:
        sentences = [cleaned]
    buckets = [[] for _ in range(target)]
    for idx, sentence in enumerate(sentences):
        buckets[idx % target].append(sentence)
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


def enhance_image_prompt(base_prompt: str, narration: str, scene_emotion: str, image_style: str) -> str:
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
    hints = [h for h in (cleaned, narration_hint) if h]
    content_hint = ", ".join(hints) if hints else "clear focal subject"
    enhancements = [
        f"Vertical 9:16 {image_style} cinematic still, {content_hint}",
        f"Lighting: {emotion_lighting.get(scene_emotion, 'natural balanced lighting')}",
        "Photorealistic, shallow depth of field, professional color grade",
        "Subject positioned for mobile viewing (center-weighted, clear focal point)",
        "No on-screen text unless story-critical signage",
    ]
    return ", ".join(enhancements)


def validate_storyboard_quality(storyboard: dict) -> list[str]:
    """Check for common quality issues."""
    issues = []
    scenes = storyboard.get("scenes", []) if isinstance(storyboard, dict) else []
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
    word_count: int = 400,
    generate_subtitles: bool = True,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
    story_template: str = "default",
) -> dict:
    """Generate a full storyboard with title, script, and per-scene breakdown."""
    if story_template not in STORY_TEMPLATE_IDS:
        story_template = "default"

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

    system_prompt = (
        f"You are a video storyboard planner for faceless short-form videos. "
        f"Given a narration script, split it into exactly {scene_count} scenes. "
        f"{caption_note}"
        f"CRITICAL IMAGE PROMPT REQUIREMENTS:\n"
        f"- Each image_prompt must directly visualize the narration's key subject/action\n"
        f"- Include: subject, environment, lighting, mood, camera angle, color palette\n"
        f"- Match emotional tone of narration (tense=dark/shadows, hopeful=bright/warm)\n"
        f"- Use {image_style} style consistently but vary composition per scene\n"
        f"- NO text in images unless signage is story-critical\n"
        f"- Vertical 9:16 framing for shorts\n"
        f"For each scene, provide:\n"
        f"- narration: The exact narration text for that scene (this is what is spoken and shown as captions)\n"
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
        storyboard["scenes"] = _fallback_storyboard_scenes(
            script,
            scene_count=scene_count,
            image_style=image_style,
        )
    storyboard["script"] = script
    # Subtitle field in DB/UI matches spoken line (full narration — used for captions on re-export)
    for i, sc in enumerate(storyboard.get("scenes", [])):
        nar = (sc.get("narration") or "").strip()
        if generate_subtitles:
            sc["subtitle"] = nar
        elif not (sc.get("subtitle") or "").strip():
            sc["subtitle"] = nar
        scene_emotion = _scene_emotion_for_index(i, len(storyboard.get("scenes", [])))
        sc["image_prompt"] = enhance_image_prompt(
            sc.get("image_prompt") or "",
            nar,
            scene_emotion,
            image_style,
        )
        sc["scene_emotion"] = scene_emotion
    issues = validate_storyboard_quality(storyboard)
    if issues:
        logger.warning("Storyboard quality issues: %s", "; ".join(issues))
    return storyboard


# Storyboard prompts feed ShortsForge's image + narration pipeline (vertical shorts), not text-to-video APIs.
VIDEO_PRODUCTION_SYSTEM_PROMPT = """You are a director and scriptwriter for short-form vertical video (9:16) built from still images plus voiceover.

The app generates one still image per scene from your **image_prompt**, then uses **script** as narration/captions. Write prompts that describe a single clear key frame (not a full video clip).

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
      "script": "Have you ever wondered...",
      "image_prompt": "Vertical 9:16 cinematic still, bustling Tokyo street market at golden hour, steam rising from food stalls, shallow depth of field, warm practical lights, photorealistic"
    }
  ]
}"""


async def generate_video_production_script(
    concept: str,
    story_type: str = "general",
    scene_count: int = 5,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.7,
) -> dict:
    """Generate a professional video production script with timestamps, camera angles, lighting, quality per scene."""
    user_prompt = f"""Create a {scene_count}-scene storyboard for vertical shorts (still images + voiceover).

Concept: {concept}
Story type: {story_type}

Each scene should be 4-8 seconds of spoken content. **image_prompt** must be a single strong still-image description per scene. Return valid JSON only."""

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

    scenes = result.get("scenes", [])
    # Ensure scene_number and all fields exist
    for i, scene in enumerate(scenes):
        scene["scene_number"] = scene.get("scene_number", i + 1)
        scene.setdefault("timestamp", f"{i * 5}:00-{(i + 1) * 5}:00")
        scene.setdefault("duration_seconds", 5.0)
        scene.setdefault("camera_angle", "Medium shot")
        scene.setdefault("camera_movement", "Static")
        scene.setdefault("lighting", "Natural light")
        scene.setdefault("quality", "4K cinematic")
        scene.setdefault("script", "")
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
        scene["image_prompt"] = raw_img
        scene.pop("sora_prompt", None)

    result["scenes"] = scenes
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
