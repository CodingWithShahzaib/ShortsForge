from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import re
from typing import Any, Mapping


QUALITY_RULES = {
    "must_have_hook": True,
    "must_have_payoff": True,
    "max_repeated_shots": 2,
    "min_show_vs_tell_ratio": 0.5,
    "escalation_required": True,
}


@dataclass(frozen=True)
class StoryProfile:
    id: str
    label: str
    description: str
    beat_pattern: tuple[str, ...]
    visual_posture: str
    audio_posture: str
    focus_note: str


STORY_PROFILES: dict[str, StoryProfile] = {
    "general": StoryProfile(
        id="general",
        label="General",
        description="Balanced short-form storytelling for broad topics.",
        beat_pattern=("hook", "setup", "escalation", "payoff", "close"),
        visual_posture="balanced framing and clean mobile readability",
        audio_posture="steady energy with room for one lift before the close",
        focus_note="Keep the arc clear and immediately relevant to the viewer.",
    ),
    "horror": StoryProfile(
        id="horror",
        label="Horror",
        description="Suspense-first storytelling with escalating dread and a hard final beat.",
        beat_pattern=("hook", "tension_build", "forbidden_glimpse", "reveal", "cliffhanger"),
        visual_posture="shadow-heavy imagery, contrast shifts, and escalating proximity",
        audio_posture="escalating tension, strategic silence, and sharp punctuation cues",
        focus_note="Show the threat and make the final image feel unavoidable.",
    ),
    "mystery": StoryProfile(
        id="mystery",
        label="Mystery",
        description="Clue-driven stories that reward curiosity with a twist or answer.",
        beat_pattern=("hook", "clue", "contradiction", "twist", "resolution"),
        visual_posture="clue-centric imagery, evidence inserts, and angle changes",
        audio_posture="measured suspense with rising curiosity through the middle",
        focus_note="Let each middle beat reveal a clue or contradiction.",
    ),
    "motivational": StoryProfile(
        id="motivational",
        label="Motivational",
        description="Problem-to-insight storytelling with a clear emotional payoff.",
        beat_pattern=("hook", "problem", "insight", "transformation", "empowerment"),
        visual_posture="human action, contrast between low point and progress, and hopeful closes",
        audio_posture="supportive momentum that peaks on the takeaway",
        focus_note="Make the viewer feel the shift, then land a useful takeaway.",
    ),
    "explainer": StoryProfile(
        id="explainer",
        label="Explainer",
        description="Information-dense content that needs clarity, proof, and why-it-matters context.",
        beat_pattern=("hook", "context", "key_fact", "implication", "takeaway"),
        visual_posture="clear subject framing, proof artifacts, inserts, and visual explanation",
        audio_posture="steady, confident pacing with emphasis on the key reveal",
        focus_note="Keep facts concrete, visualized, and connected to viewer relevance.",
    ),
    "news": StoryProfile(
        id="news",
        label="News",
        description="Timely updates with clear stakes, evidence, and a forward-looking close.",
        beat_pattern=("hook", "context", "development", "implication", "call_to_action"),
        visual_posture="headline clarity, b-roll inserts, and grounded documentary framing",
        audio_posture="urgent but controlled pacing with a precise ending",
        focus_note="State the stakes quickly and show why the update matters now.",
    ),
    "listicle": StoryProfile(
        id="listicle",
        label="Listicle",
        description="Ranked or stacked beats that build momentum toward a strongest final point.",
        beat_pattern=("hook", "item", "item", "item", "summary"),
        visual_posture="high variety, strong visual contrast, and escalating novelty",
        audio_posture="brisk pacing with clean rhythmic resets between beats",
        focus_note="Each beat should feel distinct and stronger than the last.",
    ),
    "storytelling": StoryProfile(
        id="storytelling",
        label="Storytelling",
        description="Character- or anecdote-led arcs with a clear shift between setup and payoff.",
        beat_pattern=("hook", "setup", "turn", "escalation", "payoff"),
        visual_posture="scene-based imagery, emotional reactions, and strong before/after contrast",
        audio_posture="conversational pacing with a firm turn in the middle",
        focus_note="Make the turning point unmistakable and emotionally visual.",
    ),
    "reflective": StoryProfile(
        id="reflective",
        label="Reflective",
        description="Slower, contemplative pieces that still need an early curiosity gap and a strong close.",
        beat_pattern=("hook", "premise", "reflection", "insight", "resolution"),
        visual_posture="calm but varied composition with symbolic or metaphorical imagery",
        audio_posture="measured pacing that still lands a decisive final line",
        focus_note="Avoid flatness by giving the middle a fresh perspective shift.",
    ),
}


UI_STORY_TYPE_OPTIONS: tuple[dict[str, str], ...] = (
    {
        "id": "general",
        "name": "General",
        "description": "Balanced short-form storytelling for broad topics.",
        "profile_id": "general",
    },
    {
        "id": "scary",
        "name": "Horror / Scary",
        "description": "Suspense-driven stories with escalating tension and strong payoff.",
        "profile_id": "horror",
    },
    {
        "id": "mystery",
        "name": "Mystery",
        "description": "Clue-based or twist-driven storytelling.",
        "profile_id": "mystery",
    },
    {
        "id": "motivational",
        "name": "Motivational",
        "description": "Transformation arcs and actionable takeaways.",
        "profile_id": "motivational",
    },
    {
        "id": "life_pro_tips",
        "name": "Life Pro Tips",
        "description": "Practical lessons with clear before/after value.",
        "profile_id": "motivational",
    },
    {
        "id": "science",
        "name": "Science",
        "description": "Counterintuitive or evidence-backed explainers.",
        "profile_id": "explainer",
    },
    {
        "id": "history",
        "name": "History",
        "description": "Past events turned into engaging explainers or parallels.",
        "profile_id": "explainer",
    },
    {
        "id": "fun_facts",
        "name": "Fun Facts",
        "description": "Quick novelty-driven explainers and surprising facts.",
        "profile_id": "explainer",
    },
    {
        "id": "educational",
        "name": "Educational",
        "description": "Informative explainers with clear proof and takeaways.",
        "profile_id": "explainer",
    },
    {
        "id": "news",
        "name": "News",
        "description": "Timely updates with stakes, evidence, and implications.",
        "profile_id": "news",
    },
    {
        "id": "top_list",
        "name": "Listicle",
        "description": "Ranked beats with escalating novelty.",
        "profile_id": "listicle",
    },
    {
        "id": "reddit_story",
        "name": "Reddit Story",
        "description": "Anecdote-led storytelling with a reveal or emotional turn.",
        "profile_id": "storytelling",
    },
    {
        "id": "philosophy",
        "name": "Philosophy",
        "description": "Reflective concepts that still need a clear hook and insight.",
        "profile_id": "reflective",
    },
    {
        "id": "bedtime",
        "name": "Bedtime",
        "description": "Softer pacing with calm intrigue and a clean close.",
        "profile_id": "reflective",
    },
)


_PREFERRED_STORY_TYPE_VALUES: dict[str, str] = {
    "general": "general",
    "scary": "scary",
    "horror": "scary",
    "mystery": "mystery",
    "motivational": "motivational",
    "life_pro_tips": "life_pro_tips",
    "science": "science",
    "history": "history",
    "fun_facts": "fun_facts",
    "educational": "educational",
    "news": "news",
    "top_list": "top_list",
    "listicle": "top_list",
    "reddit_story": "reddit_story",
    "philosophy": "philosophy",
    "bedtime": "bedtime",
}


STORY_TYPE_INPUTS: tuple[str, ...] = tuple(
    dict.fromkeys([*(_PREFERRED_STORY_TYPE_VALUES.keys()), *(option["id"] for option in UI_STORY_TYPE_OPTIONS)])
)


_STORY_TYPE_TO_PROFILE: dict[str, str] = {
    "general": "general",
    "scary": "horror",
    "mystery": "mystery",
    "motivational": "motivational",
    "life_pro_tips": "motivational",
    "science": "explainer",
    "history": "explainer",
    "fun_facts": "explainer",
    "educational": "explainer",
    "news": "news",
    "top_list": "listicle",
    "reddit_story": "storytelling",
    "philosophy": "reflective",
    "bedtime": "reflective",
}


_TEMPLATE_PROFILE_HINTS: dict[str, str] = {
    "countdown_reveal": "listicle",
    "investigative_breakdown": "mystery",
    "myth_vs_reality": "explainer",
    "political_commentary": "news",
    "corporate_expose": "news",
    "historical_parallel": "explainer",
    "urgent_warning": "news",
    "rise_fall_rebound": "motivational",
}


_ROLE_LABELS: dict[str, str] = {
    "hook": "Hook",
    "setup": "Setup",
    "tension_build": "Tension Build",
    "forbidden_glimpse": "Forbidden Glimpse",
    "reveal": "Reveal",
    "cliffhanger": "Cliffhanger",
    "problem": "Problem",
    "insight": "Insight",
    "transformation": "Transformation",
    "empowerment": "Empowerment",
    "context": "Context",
    "key_fact": "Key Fact",
    "development": "Development",
    "implication": "Implication",
    "call_to_action": "Call To Action",
    "takeaway": "Takeaway",
    "clue": "Clue",
    "contradiction": "Contradiction",
    "twist": "Twist",
    "resolution": "Resolution",
    "item": "Item",
    "summary": "Summary",
    "turn": "Turn",
    "premise": "Premise",
    "reflection": "Reflection",
    "close": "Close",
    "escalation": "Escalation",
    "payoff": "Payoff",
}


_SHOT_RE = re.compile(
    r"\b(wide|establishing|long shot|master|closeup|close-up|close|reaction|medium|mid shot|mid-shot|two-shot|two shot)\b",
    flags=re.IGNORECASE,
)
_ACTION_RE = re.compile(
    r"\b(holding|running|walking|opening|closing|turning|looking|staring|revealing|pointing|falling|watching|reaching|standing|sitting|leaning|reading|typing|speaking|whispering)\b",
    flags=re.IGNORECASE,
)
_VISUAL_RE = re.compile(
    r"\b(light|lighting|shadow|camera|frame|foreground|background|close-up|closeup|wide|angle|palette|texture|rain|fog|glow|silhouette|screen|document|headline|graphic)\b",
    flags=re.IGNORECASE,
)
_CTA_RE = re.compile(
    r"\b(watch|follow|remember|act|verify|check|look|pay attention|start|stop|share|learn)\b",
    flags=re.IGNORECASE,
)
_EVIDENCE_RE = re.compile(
    r"\b(data|report|study|document|official|source|according|research|evidence|records|analysis)\b",
    flags=re.IGNORECASE,
)
_MYSTERY_RE = re.compile(
    r"\b(clue|question|strange|mystery|contradiction|twist|why|how)\b",
    flags=re.IGNORECASE,
)
_PAYOFF_RE = re.compile(
    r"\b(finally|so now|which means|that is why|the truth|the answer|the lesson|the takeaway|in the end|that's when|what happened next)\b",
    flags=re.IGNORECASE,
)


def normalize_story_type_value(value: str | None) -> str:
    normalized = str(value or "general").strip().lower().replace(" ", "_").replace("-", "_")
    return _PREFERRED_STORY_TYPE_VALUES.get(normalized, "general")


def resolve_story_profile(
    story_type: str | None,
    story_template: str | None = None,
) -> StoryProfile:
    preferred_type = normalize_story_type_value(story_type)
    profile_id = _STORY_TYPE_TO_PROFILE.get(preferred_type, "general")
    template_hint = _TEMPLATE_PROFILE_HINTS.get(str(story_template or "").strip())
    if preferred_type == "general" and template_hint:
        profile_id = template_hint
    return STORY_PROFILES.get(profile_id, STORY_PROFILES["general"])


def list_story_type_options() -> list[dict[str, str]]:
    return [dict(option) for option in UI_STORY_TYPE_OPTIONS]


def _count_words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def _scene_text(scene: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = scene.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _scene_settings(scene: Mapping[str, Any]) -> dict[str, Any]:
    raw = scene.get("scene_settings")
    return dict(raw) if isinstance(raw, Mapping) else {}


def _extract_shot_marker(scene: Mapping[str, Any]) -> str:
    settings = _scene_settings(scene)
    raw_shot = str(settings.get("shot_type") or scene.get("shot_type") or "").strip().lower()
    if raw_shot in {"wide", "medium", "closeup", "close-up", "reaction", "two-shot", "two shot"}:
        if raw_shot in {"closeup", "close-up"}:
            return "closeup"
        if raw_shot in {"two-shot", "two shot"}:
            return "two-shot"
        return raw_shot

    haystack = " ".join(
        part
        for part in (
            _scene_text(scene, "image_prompt"),
            str(settings.get("camera_angle") or scene.get("camera_angle") or "").strip(),
        )
        if part
    )
    if not haystack:
        return "unknown"
    match = _SHOT_RE.search(haystack)
    if not match:
        return "unknown"
    token = match.group(1).lower()
    if token in {"wide", "establishing", "long shot", "master"}:
        return "wide"
    if token in {"closeup", "close-up", "close"}:
        return "closeup"
    if token in {"two-shot", "two shot"}:
        return "two-shot"
    if token == "reaction":
        return "reaction"
    return "medium"


def assign_scene_roles(
    scene_count: int,
    profile: StoryProfile,
) -> list[dict[str, Any]]:
    if scene_count <= 0:
        return []
    pattern = profile.beat_pattern
    if scene_count == 1:
        role = pattern[0]
        return [{"scene_index": 0, "role": role, "label": _ROLE_LABELS.get(role, role.replace("_", " ").title())}]
    roles: list[dict[str, Any]] = []
    for index in range(scene_count):
        pattern_index = round(index * (len(pattern) - 1) / max(1, scene_count - 1))
        role = pattern[pattern_index]
        roles.append(
            {
                "scene_index": index,
                "role": role,
                "label": _ROLE_LABELS.get(role, role.replace("_", " ").title()),
            }
        )
    return roles


def describe_story_brief(story_brief: Mapping[str, Any] | None) -> str:
    if not isinstance(story_brief, Mapping):
        return "Balanced defaults"
    universal = [
        str(story_brief.get("hook_type") or "question").replace("_", " "),
        str(story_brief.get("ending_type") or "resolution").replace("_", " "),
        str(story_brief.get("pacing_profile") or "balanced").replace("_", " "),
        f"{str(story_brief.get('visual_variety') or 'medium').replace('_', ' ')} variety",
    ]
    return " / ".join(part.title() for part in universal if part)


def build_story_brief_prompt(story_brief: Mapping[str, Any] | None) -> str:
    if not isinstance(story_brief, Mapping):
        return ""
    lines: list[str] = []
    hook_type = str(story_brief.get("hook_type") or "").strip()
    ending_type = str(story_brief.get("ending_type") or "").strip()
    pacing_profile = str(story_brief.get("pacing_profile") or "").strip()
    visual_variety = str(story_brief.get("visual_variety") or "").strip()
    show_vs_tell = str(story_brief.get("show_vs_tell_priority") or "").strip()
    if hook_type:
        lines.append(f"- Hook preference: {hook_type.replace('_', ' ')}.")
    if ending_type:
        lines.append(f"- Ending preference: {ending_type.replace('_', ' ')}.")
    if pacing_profile:
        lines.append(f"- Pacing profile: {pacing_profile.replace('_', ' ')}.")
    if visual_variety:
        lines.append(f"- Visual variety target: {visual_variety.replace('_', ' ')}.")
    if show_vs_tell:
        lines.append(f"- Show-vs-tell priority: {show_vs_tell.replace('_', ' ')}.")
    for section_name in ("horror", "news", "motivational", "mystery"):
        section = story_brief.get(section_name)
        if not isinstance(section, Mapping):
            continue
        section_parts = [
            f"{key.replace('_', ' ')}={str(value).replace('_', ' ')}"
            for key, value in section.items()
            if value not in (None, "")
        ]
        if section_parts:
            lines.append(f"- {section_name.title()} tuning: {', '.join(section_parts)}.")
    if not lines:
        return ""
    return "STORY BRIEF:\n" + "\n".join(lines) + "\n"


def build_story_structure_prompt(
    *,
    story_type: str | None,
    story_template: str | None,
    scene_count: int,
    dynamic_scenes: bool,
    story_brief: Mapping[str, Any] | None,
) -> str:
    profile = resolve_story_profile(story_type, story_template)
    roles = assign_scene_roles(max(1, scene_count), profile)
    beat_preview = ", ".join(role["label"] for role in roles[: min(len(roles), 5)])
    scene_count_note = (
        "Choose the fewest scenes needed to complete this arc cleanly."
        if dynamic_scenes
        else f"Treat the {scene_count} scenes as a full story arc, not isolated beats."
    )
    return (
        "UNIVERSAL STORY STRUCTURE:\n"
        f"- Use the shared '{profile.label}' profile for this story.\n"
        f"- Core beat pattern: {', '.join(profile.beat_pattern)}.\n"
        f"- Visual posture: {profile.visual_posture}.\n"
        f"- Audio posture: {profile.audio_posture}.\n"
        f"- Focus note: {profile.focus_note}\n"
        f"- Expected scene-role flow: {beat_preview}.\n"
        f"- {scene_count_note}\n"
        "- The first scene must deliver an immediate hook.\n"
        "- The middle must escalate with new information or stronger imagery.\n"
        "- The final scene must pay off the opening promise or intentionally land a cliffhanger.\n"
        "- Avoid repeating the same framing or paraphrasing the same idea across consecutive scenes.\n"
        f"{build_story_brief_prompt(story_brief)}"
    )


def _compute_visual_variety_score(
    scenes: list[Mapping[str, Any]],
    *,
    issues: list[dict[str, Any]],
) -> int:
    if not scenes:
        return 0
    markers = [_extract_shot_marker(scene) for scene in scenes]
    unique_markers = {marker for marker in markers if marker != "unknown"}
    score = 40 + min(30, len(unique_markers) * 12)
    run_length = 1
    run_penalty = 0
    for index in range(1, len(markers)):
        if markers[index] == markers[index - 1] and markers[index] != "unknown":
            run_length += 1
        else:
            run_length = 1
        if run_length > QUALITY_RULES["max_repeated_shots"]:
            run_penalty += 16
            issues.append(
                {
                    "code": "visual_repetition",
                    "message": "Too many consecutive scenes use the same framing.",
                    "severity": "warning",
                    "scene_indexes": [index - 1, index],
                    "fix_hint": "Vary framing, inserts, or camera distance between these scenes.",
                }
            )
    changes = sum(1 for index in range(1, len(markers)) if markers[index] != markers[index - 1])
    score += min(20, changes * 4)
    score -= run_penalty
    if len(unique_markers) <= 1 and len(scenes) >= 3:
        issues.append(
            {
                "code": "low_visual_variety",
                "message": "Most scenes rely on the same shot scale.",
                "severity": "warning",
                "scene_indexes": list(range(len(scenes))),
                "fix_hint": "Mix wide, medium, close, and insert-style visuals across the arc.",
            }
        )
    return max(0, min(100, score))


def _compute_show_tell_ratio(scenes: list[Mapping[str, Any]]) -> float:
    if not scenes:
        return 0.0
    show_points = 0.0
    total_points = 0.0
    for scene in scenes:
        narration = _scene_text(scene, "narration", "subtitle", "script")
        image_prompt = _scene_text(scene, "image_prompt")
        total_points += 1.0
        prompt_words = _count_words(image_prompt)
        visual_hits = len(_VISUAL_RE.findall(image_prompt))
        action_hits = len(_ACTION_RE.findall(image_prompt))
        narration_action_hits = len(_ACTION_RE.findall(narration))
        scene_score = 0.0
        if prompt_words >= 60:
            scene_score += 0.45
        if visual_hits >= 3:
            scene_score += 0.25
        if action_hits >= 1:
            scene_score += 0.2
        if narration_action_hits >= 1:
            scene_score += 0.1
        show_points += min(1.0, scene_score)
    return max(0.0, min(1.0, show_points / total_points))


def _compute_hook_score(first_scene: Mapping[str, Any] | None, story_brief: Mapping[str, Any] | None) -> int:
    if not first_scene:
        return 0
    text = _scene_text(first_scene, "narration", "subtitle", "script")
    prompt = _scene_text(first_scene, "image_prompt")
    hook_words = re.findall(r"\b[\w'-]+\b", text.lower())[:18]
    score = 35
    if 6 <= len(hook_words) <= 16:
        score += 15
    if "?" in text:
        score += 18
    if any(char.isdigit() for char in text):
        score += 8
    if len(_ACTION_RE.findall(prompt)) >= 1 or len(_VISUAL_RE.findall(prompt)) >= 3:
        score += 14
    hook_type = ""
    if isinstance(story_brief, Mapping):
        hook_type = str(story_brief.get("hook_type") or "").strip().lower()
    if hook_type == "question" and "?" in text:
        score += 10
    if hook_type == "shocking_fact" and any(char.isdigit() for char in text):
        score += 10
    if hook_type == "visual" and len(_VISUAL_RE.findall(prompt)) >= 4:
        score += 10
    if _count_words(text) < 4:
        score -= 18
    return max(0, min(100, score))


def _compute_payoff_score(
    scenes: list[Mapping[str, Any]],
    story_brief: Mapping[str, Any] | None,
    profile: StoryProfile,
) -> int:
    if not scenes:
        return 0
    first_text = _scene_text(scenes[0], "narration", "subtitle", "script").lower()
    last_text = _scene_text(scenes[-1], "narration", "subtitle", "script").lower()
    score = 40
    if _PAYOFF_RE.search(last_text):
        score += 20
    if len(last_text.split()) >= 7:
        score += 10
    similarity = SequenceMatcher(None, first_text[:160], last_text[:160]).ratio() if first_text and last_text else 0.0
    if similarity < 0.55:
        score += 10
    ending_type = ""
    if isinstance(story_brief, Mapping):
        ending_type = str(story_brief.get("ending_type") or "").strip().lower()
    if ending_type == "cliffhanger" and ("?" in last_text or "..." in last_text):
        score += 10
    if ending_type == "twist" and _MYSTERY_RE.search(last_text):
        score += 10
    if ending_type == "call_to_action" and _CTA_RE.search(last_text):
        score += 10
    if ending_type == "resolution" and _PAYOFF_RE.search(last_text):
        score += 10
    if profile.id == "motivational" and _CTA_RE.search(last_text):
        score += 8
    return max(0, min(100, score))


def _compute_escalation_score(
    scenes: list[Mapping[str, Any]],
    roles: list[dict[str, Any]],
) -> tuple[int, float]:
    if len(scenes) <= 1:
        return 0, 1.0
    narrations = [_scene_text(scene, "narration", "subtitle", "script") for scene in scenes]
    similarities: list[float] = []
    for index in range(1, len(narrations)):
        prev_text = narrations[index - 1]
        current_text = narrations[index]
        if not prev_text or not current_text:
            similarities.append(0.0)
            continue
        similarities.append(SequenceMatcher(None, prev_text.lower(), current_text.lower()).ratio())
    avg_similarity = sum(similarities) / max(1, len(similarities))
    role_variety = len({role["role"] for role in roles})
    score = 35 + min(25, role_variety * 6) + min(20, len(scenes) * 3)
    if avg_similarity < 0.72:
        score += 20
    elif avg_similarity > 0.86:
        score -= 18
    return max(0, min(100, score)), avg_similarity


def _profile_specific_issues(
    *,
    profile: StoryProfile,
    scenes: list[Mapping[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    combined_text = " ".join(_scene_text(scene, "narration", "subtitle", "script") for scene in scenes).lower()
    if profile.id == "news":
        if not _EVIDENCE_RE.search(combined_text):
            issues.append(
                {
                    "code": "evidence_clarity",
                    "message": "The story needs stronger attribution, sourcing, or evidence language.",
                    "severity": "warning",
                    "scene_indexes": list(range(len(scenes))),
                    "fix_hint": "Name the source, study, document, or reporting hook that supports the claim.",
                }
            )
    elif profile.id == "motivational":
        if not _CTA_RE.search(combined_text):
            issues.append(
                {
                    "code": "missing_takeaway",
                    "message": "The ending needs a clearer action, lesson, or behavior change.",
                    "severity": "warning",
                    "scene_indexes": [max(0, len(scenes) - 1)],
                    "fix_hint": "Close with one usable takeaway, instruction, or mindset shift.",
                }
            )
    elif profile.id == "mystery":
        if not _MYSTERY_RE.search(combined_text):
            issues.append(
                {
                    "code": "weak_clue_setup",
                    "message": "The story does not surface enough clues or contradictions before the ending.",
                    "severity": "warning",
                    "scene_indexes": list(range(1, max(1, len(scenes) - 1))),
                    "fix_hint": "Give the middle scenes a clue, inconsistency, or suspicious detail to build from.",
                }
            )
    elif profile.id == "horror":
        visual_text = " ".join(_scene_text(scene, "image_prompt") for scene in scenes).lower()
        if not re.search(r"\b(shadow|blood|door|hallway|glimpse|mask|dark|creature|threat|fear)\b", visual_text):
            issues.append(
                {
                    "code": "weak_visual_threat",
                    "message": "The horror arc needs a clearer visualized threat or ominous image.",
                    "severity": "warning",
                    "scene_indexes": list(range(len(scenes))),
                    "fix_hint": "Show the danger, the intrusion, or the forbidden glimpse instead of only narrating it.",
                }
            )


def build_story_quality_report(
    *,
    story_type: str | None,
    story_template: str | None,
    scenes: list[Mapping[str, Any]],
    script: str | None = None,
    story_brief: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    profile = resolve_story_profile(story_type, story_template)
    roles = assign_scene_roles(len(scenes), profile)
    issues: list[dict[str, Any]] = []
    hook_score = _compute_hook_score(scenes[0] if scenes else None, story_brief)
    payoff_score = _compute_payoff_score(scenes, story_brief, profile)
    escalation_score, avg_similarity = _compute_escalation_score(scenes, roles)
    visual_variety_score = _compute_visual_variety_score(scenes, issues=issues)
    show_tell_ratio = _compute_show_tell_ratio(scenes)
    repetition_score = max(0, min(100, round((1.0 - avg_similarity) * 100)))

    if QUALITY_RULES["must_have_hook"] and hook_score < 65:
        issues.append(
            {
                "code": "weak_hook",
                "message": "The opening does not create enough curiosity, stakes, or visual immediacy.",
                "severity": "warning",
                "scene_indexes": [0],
                "fix_hint": "Sharpen the first line or make the first image more surprising and concrete.",
            }
        )
    if QUALITY_RULES["must_have_payoff"] and payoff_score < 65 and scenes:
        issues.append(
            {
                "code": "missing_payoff",
                "message": "The ending does not fully pay off the promise made by the opening.",
                "severity": "warning",
                "scene_indexes": [len(scenes) - 1],
                "fix_hint": "Give the final scene a clearer answer, twist, implication, or takeaway.",
            }
        )
    if QUALITY_RULES["escalation_required"] and escalation_score < 60 and len(scenes) >= 3:
        issues.append(
            {
                "code": "flat_escalation",
                "message": "The middle scenes feel too similar, so the short does not build enough momentum.",
                "severity": "warning",
                "scene_indexes": list(range(1, max(1, len(scenes) - 1))),
                "fix_hint": "Add a new beat, contradiction, proof point, or stronger visual shift in the middle.",
            }
        )
    if show_tell_ratio < float(QUALITY_RULES["min_show_vs_tell_ratio"]):
        issues.append(
            {
                "code": "too_much_telling",
                "message": "The storyboard leans too heavily on narration instead of visual storytelling.",
                "severity": "warning",
                "scene_indexes": list(range(len(scenes))),
                "fix_hint": "Add more subject action, inserts, environment detail, and concrete visuals that carry the beat.",
            }
        )
    if repetition_score < 25 and len(scenes) >= 3:
        issues.append(
            {
                "code": "repetitive_arc",
                "message": "Several scenes repeat the same idea or energy level instead of advancing the story.",
                "severity": "warning",
                "scene_indexes": list(range(len(scenes))),
                "fix_hint": "Differentiate each scene's narrative job and visual composition.",
            }
        )

    _profile_specific_issues(profile=profile, scenes=scenes, issues=issues)

    suggestions: list[str] = []
    for issue in issues:
        hint = str(issue.get("fix_hint") or "").strip()
        if hint and hint not in suggestions:
            suggestions.append(hint)

    if not suggestions and scenes:
        suggestions.append("The current structure looks balanced. Focus next on polishing scene-level language and assets.")

    overall_score = round(
        (
            hook_score * 0.22
            + payoff_score * 0.22
            + escalation_score * 0.2
            + visual_variety_score * 0.18
            + repetition_score * 0.08
            + (show_tell_ratio * 100.0) * 0.1
        )
    )
    overall_score = max(0, min(100, overall_score - min(25, len(issues) * 4)))

    quality_posture = describe_story_brief(story_brief)
    return {
        "profile_id": profile.id,
        "profile_label": profile.label,
        "resolved_story_type": normalize_story_type_value(story_type),
        "story_template": str(story_template or "default"),
        "quality_posture": quality_posture,
        "overall_score": overall_score,
        "hook_score": hook_score,
        "payoff_score": payoff_score,
        "escalation_score": escalation_score,
        "visual_variety_score": visual_variety_score,
        "repetition_score": repetition_score,
        "show_tell_ratio": round(show_tell_ratio, 2),
        "issues": issues,
        "suggestions": suggestions[:6],
        "scene_roles": roles,
        "scene_count": len(scenes),
        "estimated_word_count": _count_words(script or " ".join(_scene_text(scene, "narration", "subtitle", "script") for scene in scenes)),
    }


__all__ = [
    "QUALITY_RULES",
    "STORY_PROFILES",
    "STORY_TYPE_INPUTS",
    "StoryProfile",
    "assign_scene_roles",
    "build_story_brief_prompt",
    "build_story_quality_report",
    "build_story_structure_prompt",
    "describe_story_brief",
    "list_story_type_options",
    "normalize_story_type_value",
    "resolve_story_profile",
]
