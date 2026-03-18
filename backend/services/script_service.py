from __future__ import annotations

import json
import logging

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)

STORY_TYPES = [
    "scary", "mystery", "bedtime", "philosophy", "life_pro_tips",
    "fun_facts", "motivational", "science", "history", "general",
]


async def generate_script(
    concept: str,
    story_type: str = "general",
    word_count: int = 400,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    temperature: float = 0.8,
) -> str:
    system_prompt = (
        f"You are a professional short-form video scriptwriter. "
        f"Write a compelling, SUBSTANTIAL {story_type} script for a faceless video narration. "
        f"CRITICAL: The script MUST be at least {word_count} words. Do NOT write a brief or short script. "
        f"Expand on the concept with detail, examples, and engaging content. "
        f"Write ONLY the narration text - no scene directions, no brackets, no stage directions. "
        f"Make it engaging, with a strong hook in the first sentence. "
        f"Use short, punchy sentences suitable for voice-over narration."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Create a script about: {concept}"},
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
) -> dict:
    """Generate a full storyboard with title, script, and per-scene breakdown."""
    if not script and concept:
        script = await generate_script(concept, story_type, word_count or 400, llm_provider, llm_model, temperature)
    elif not script:
        raise ValueError("Either concept or script must be provided")

    subtitle_instruction = ""
    subtitle_field = ""
    if generate_subtitles:
        subtitle_instruction = (
            f"- subtitle: Optimized caption text for on-screen display. "
            f"Keep it punchy and readable (shorter phrases, key words). "
            f"Can differ slightly from narration for better viewer experience.\n"
        )
        subtitle_field = ', "subtitle": "..."'

    system_prompt = (
        f"You are a video storyboard planner for faceless short-form videos. "
        f"Given a narration script, split it into exactly {scene_count} scenes. "
        f"For each scene, provide:\n"
        f"- narration: The exact narration text for that scene\n"
        f"{subtitle_instruction}"
        f"- image_prompt: A detailed image generation prompt in {image_style} style. "
        f"  Describe the visual scene vividly: subject, composition, lighting, mood, colors.\n"
        f"- transition: One of: fade, dissolve, wipeleft, slideup, zoom_in, zoom_out, pan_left, pan_right\n\n"
        f"Return valid JSON with this structure:\n"
        f'{{"title": "...", "scenes": [{{"narration": "...", "image_prompt": "...", "transition": "..."{subtitle_field}}}]}}'
    )
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
    # Ensure each scene has subtitle; fallback to narration when not generated
    for sc in storyboard.get("scenes", []):
        if not sc.get("subtitle") and sc.get("narration"):
            sc["subtitle"] = sc["narration"]
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
