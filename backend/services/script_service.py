from __future__ import annotations

import json
import logging
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


def _storyboard_arc_addon(scene_count: int, image_style: str) -> str:
    """Extra instructions when using a non-default story_template."""
    n = max(2, min(15, int(scene_count)))
    lines = [
        "",
        "NARRATIVE ARC (non-default template):",
        f"- Split the script into exactly {n} scenes. narration for each scene must be copied verbatim from the script in order—no paraphrase.",
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

    if story_template == "default":
        system_prompt = (
            f"You are a professional short-form video scriptwriter. "
            f"Write a compelling, SUBSTANTIAL {story_type} script for a faceless video narration. "
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
        f"For each scene, provide:\n"
        f"- narration: The exact narration text for that scene (this is what is spoken and shown as captions)\n"
        f"- image_prompt: A detailed image generation prompt in {image_style} style. "
        f"  Describe the visual scene vividly: subject, composition, lighting, mood, colors.\n"
        f"- transition: One of: fade, dissolve, wipeleft, slideup, zoom_in, zoom_out, pan_left, pan_right\n\n"
        f"Return valid JSON with this structure:\n"
        f'{{"title": "...", "scenes": [{{"narration": "...", "image_prompt": "...", "transition": "..."}}]}}'
    )
    if story_template != "default":
        system_prompt += _storyboard_arc_addon(scene_count, image_style)

    messages = [
        {"role": "system", "content": system_prompt},
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

    storyboard["script"] = script
    # Subtitle field in DB/UI matches spoken line (full narration — used for captions on re-export)
    for sc in storyboard.get("scenes", []):
        nar = (sc.get("narration") or "").strip()
        if generate_subtitles:
            sc["subtitle"] = nar
        elif not (sc.get("subtitle") or "").strip():
            sc["subtitle"] = nar
    return storyboard


# Professional video AI prompt structure (Sora, Runway, Kling):
# [Camera setup and movement], [subject] [action], [environment], [lighting/time of day], [style/mood]
# Template: [Camera shot + movement], [subject] [action], [environment], [lighting], [quality/style]
VIDEO_PRODUCTION_SYSTEM_PROMPT = """You are a professional video director and scriptwriter for AI video generation tools (Sora, Runway, Kling, Veo).

Create a video production script with timestamps and per-scene technical specs. Each scene must include:

1. **timestamp**: Format "0:00-0:05" (start-end in MM:SS)
2. **duration_seconds**: Numeric duration (e.g. 5.0)
3. **camera_angle**: Shot type and framing. Use professional terms:
   - Wide/establishing shot, medium shot, close-up, extreme close-up
   - Low angle, high angle, bird's eye, over-the-shoulder
   - Eye level, Dutch angle
4. **camera_movement**: Static, slow dolly in/out, pan left/right, tilt up/down, tracking shot, handheld, Steadicam, drone/aerial
5. **lighting**: Quality and direction. Examples:
   - Golden hour, soft key from left, rim light, backlit
   - Natural sunlight, overcast, neon, practical lights
   - Warm tungsten, cool daylight, volumetric light
6. **quality**: Resolution/style. Examples:
   - 4K cinematic, shallow depth of field, anamorphic
   - 35mm film grain, 8K photorealistic, documentary style
7. **script**: The narration or dialogue for this scene (concise, punchy)
8. **sora_prompt**: A single combined prompt for Sora/Runway. Format:
   "[Camera shot and movement], [subject and action], [environment], [lighting], [quality/style]"
   Example: "Slow dolly in, medium close-up of a woman walking through Tokyo market at dusk, warm orange vendor lights, shallow depth of field, cinematic 4K"

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
  "camera_movement": "Slow push in",
  "lighting": "Golden hour, soft key from camera left",
  "quality": "4K cinematic, shallow depth of field",
  "script": "Have you ever wondered...",
  "sora_prompt": "Wide establishing shot with slow push in, bustling city street at golden hour, soft key from left, 4K cinematic shallow DOF"
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
    user_prompt = f"""Create a {scene_count}-scene video production script for AI video generation (Sora/Runway style).

Concept: {concept}
Story type: {story_type}

Each scene should be 4-8 seconds. Use the professional prompt structure. Return valid JSON only."""

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
        if not scene.get("sora_prompt") and scene.get("script"):
            scene["sora_prompt"] = f"{scene.get('camera_angle', '')}, {scene.get('lighting', '')}, {scene.get('script', '')}"

    result["scenes"] = scenes
    return result


DIRECTOR_BOARD_SYSTEM_PROMPT = """You are a professional video director and Sora prompt engineer. Given a story and total duration, generate a detailed timeline plus cinematic, audio, and safety sections for a Sora video prompt.

1. **timeline_entries**: Array of segments that cover 0 to total_duration seconds. Each segment:
   - start_sec, end_sec: Timestamps (e.g. 0.0-0.7, 0.7-1.5). Segments must be sequential and cover the full duration.
   - phase_label: Optional label like "Hook", "Build", "Climax", "Discovery", "Reaction", "Tension", "Escape", "Loop Ending"
   - script: Main action/description for this segment
   - bullet_notes: Array of micro-actions or details (e.g. "One hand grips frame", "Slight ear twitch")
   Split the duration into 6-12 segments. Each segment typically 0.5-1.5 seconds. Create a compelling beat structure (hook, build, payoff, loop-friendly ending if applicable).

2. **cinematic_settings**: Technical specs and visual style. Format as newline-separated bullet points. Include:
   - Resolution (e.g. 8K, 4K)
   - Camera style (e.g. smartphone handheld, cinematic, documentary)
   - Visual quality (e.g. ultra photorealistic, must look real not AI)
   - Lighting (e.g. warm bedside lighting, low-light grain)
   - Camera behavior (e.g. slight handheld shake, autofocus breathing)
   - Any other relevant tech specs (e.g. shallow depth of field, film grain)

3. **audio_design**: Sound and ambience. Format as newline-separated bullet points. Include:
   - Ambient sounds
   - Movement/foley sounds
   - Any specific sounds relevant to the story (e.g. instrument notes, fabric rustle)
   - Note: "IMPORTANT FOR VIRALITY" for audio that enhances shareability

4. **safety_rules**: Strict exclusions for Sora. Format as array of strings. Each rule should be:
   - "No X" format for exclusions (e.g. "No real song or copyrighted melody", "No aggression")
   - "Keep X" for positive constraints (e.g. "Keep behavior natural and believable")
   - Avoid copyrighted content, aggressive behavior, exaggerated expressions, text overlays

Return valid JSON only:
{
  "timeline_entries": [
    {"start_sec": 0.0, "end_sec": 0.7, "phase_label": "Hook", "script": "...", "bullet_notes": ["...", "..."]},
    ...
  ],
  "cinematic_settings": "line1\\nline2\\nline3",
  "audio_design": "line1\\nline2\\nline3",
  "safety_rules": ["rule1", "rule2", "rule3"]
}"""


async def generate_director_board_sections(
    overall_story: str,
    timeline_entries: list[dict],
    total_duration: float = 8.0,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.6,
) -> dict:
    """Generate timeline, cinematic settings, audio design, and safety rules from story + total duration."""
    def _fmt_entry(e: dict) -> str:
        parts = [
            f"{e.get('start_sec', 0)}s – {e.get('end_sec', 0)}s"
            + (f" ({e.get('phase_label', '')})" if e.get("phase_label") else ""),
            e.get("script", ""),
        ]
        bullets = [b for b in (e.get("bullet_notes") or []) if b and str(b).strip()]
        if bullets:
            parts.append("\n".join(f"  - {b}" for b in bullets))
        return "\n".join(parts)

    timeline_text = "\n\n".join(_fmt_entry(e) for e in timeline_entries) if timeline_entries else ""

    timeline_section = (
        f"EXISTING TIMELINE (use as reference or override):\n{timeline_text}"
        if timeline_text
        else "(Generate timeline from scratch based on total duration)"
    )

    user_prompt = f"""Create a {total_duration}s video with timeline, cinematic, audio, and safety sections.

OVERALL STORY:
{overall_story or "(none provided)"}

{timeline_section}

TOTAL DURATION: {total_duration}s

Generate timeline_entries that fit exactly within 0.0s to {total_duration}s. Then generate cinematic_settings, audio_design, and safety_rules. Return valid JSON only."""

    messages = [
        {"role": "system", "content": DIRECTOR_BOARD_SYSTEM_PROMPT},
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
            raise ValueError("Failed to parse director board JSON from LLM response")

    # Normalize timeline entries
    raw_entries = result.get("timeline_entries", [])
    timeline_out = []
    for i, e in enumerate(raw_entries):
        if isinstance(e, dict):
            timeline_out.append({
                "start_sec": float(e.get("start_sec", 0)),
                "end_sec": float(e.get("end_sec", 0)),
                "phase_label": e.get("phase_label") or None,
                "script": str(e.get("script", "")),
                "bullet_notes": [str(b) for b in (e.get("bullet_notes") or []) if b],
            })

    return {
        "timeline_entries": timeline_out,
        "cinematic_settings": result.get("cinematic_settings", ""),
        "audio_design": result.get("audio_design", ""),
        "safety_rules": result.get("safety_rules", []),
    }


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
