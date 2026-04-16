from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)


async def enhance_image_prompt(
    base_prompt: str,
    style: str = "realistic",
    context: str = "",
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> str:
    """Take a basic image prompt and enhance it for better image generation."""
    system_prompt = (
        f"You are an expert at writing prompts for AI image generation. "
        f"Enhance the given prompt to produce a stunning {style} image. "
        f"Add specific details about composition, lighting, camera angle, colors, "
        f"textures, and atmosphere. Keep it under 200 words. "
        f"Return ONLY the enhanced prompt, nothing else."
    )
    user_content = base_prompt
    if context:
        user_content += f"\n\nContext: {context}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    return await chat_completion(messages, llm_provider, llm_model, temperature=0.6, max_tokens=500)



@dataclass(frozen=True)
class InsertShot:
    object_type: str
    prompt_override: str | None = None
    shot_type: str | None = None
    duration: float | None = None


KEY_OBJECT_TRIGGERS: dict[str, tuple[str, ...]] = {
    "ad": ("pop-up", "popup", "advertisement", "banner", "notification"),
    "screen": ("computer", "monitor", "phone", "tablet", "display", "screen"),
    "countdown": ("timer", "countdown", "clock", "deadline"),
    "document": ("file", "paper", "report", "evidence", "notes", "document"),
    "weapon": ("knife", "gun", "weapon", "tool"),
    "door": ("door", "entrance", "exit", "gateway"),
    "vehicle": ("car", "truck", "van", "vehicle"),
}

INSERT_SHOT_CONFIGS: dict[str, dict[str, object]] = {
    "ad": {
        "shot_type": "extreme_closeup",
        "subject": "computer screen with a creepy pop-up advertisement",
        "duration": 2.0,
    },
    "countdown": {
        "shot_type": "extreme_closeup",
        "subject": "digital countdown timer on a screen",
        "duration": 1.5,
    },
    "screen": {
        "shot_type": "closeup",
        "subject": "glowing computer or phone screen in a dark room",
        "duration": 1.5,
    },
    "document": {
        "shot_type": "closeup",
        "subject": "document or evidence file laid out with visible details",
        "duration": 1.5,
    },
}


def _match_triggers(text: str, triggers: Iterable[str]) -> bool:
    lowered = text.lower()
    tokenized = f" {lowered} "
    for trigger in triggers:
        needle = (trigger or "").strip().lower()
        if not needle:
            continue
        if " " in needle or "-" in needle:
            if needle in lowered:
                return True
            continue
        if f" {needle} " in tokenized:
            return True
    return False


def detect_insert_opportunities(narration: str, image_prompt: str) -> list[InsertShot]:
    combined = " ".join(part for part in (narration, image_prompt) if part).strip()
    if not combined:
        return []

    inserts: list[InsertShot] = []
    for object_type, triggers in KEY_OBJECT_TRIGGERS.items():
        if not _match_triggers(combined, triggers):
            continue
        config = INSERT_SHOT_CONFIGS.get(object_type, {})
        inserts.append(
            InsertShot(
                object_type=object_type,
                prompt_override=str(config.get("subject") or "").strip() or None,
                shot_type=str(config.get("shot_type") or "").strip() or None,
                duration=float(config["duration"]) if "duration" in config else None,
            )
        )
    return inserts


def enrich_image_prompt_with_inserts(base_prompt: str, inserts: list[InsertShot]) -> str:
    if not base_prompt.strip() or not inserts:
        return base_prompt

    chosen = inserts[:2]
    overrides = [shot.prompt_override for shot in chosen if shot.prompt_override]
    if overrides:
        prefix = "; ".join(overrides)
        return (
            f"{prefix}. {base_prompt} "
            "Focus the composition on the insert object with shallow depth of field."
        ).strip()

    object_terms = ", ".join(shot.object_type for shot in chosen if shot.object_type)
    if not object_terms:
        return base_prompt
    return (
        f"{base_prompt} Include a clear insert of {object_terms} with object-focused framing."
    ).strip()


__all__ = [
    "enhance_image_prompt",
    "InsertShot",
    "KEY_OBJECT_TRIGGERS",
    "INSERT_SHOT_CONFIGS",
    "detect_insert_opportunities",
    "enrich_image_prompt_with_inserts",
]
