from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from backend.engine.planning import ResolvedGenerationSettings, SceneSpec
from backend.services.prompt_service import (
    detect_insert_opportunities,
    enrich_image_prompt_with_inserts,
)
from backend.services.visual_audio_profiles import resolve_visual_audio_profile


def _normalize_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def compose_image_generation_prompt(
    scene: SceneSpec,
    settings: ResolvedGenerationSettings,
) -> str:
    base_prompt = (scene.image_prompt or "").strip()
    if not base_prompt:
        return ""

    scene_settings = scene.scene_settings if isinstance(scene.scene_settings, Mapping) else {}
    scene_role = str(
        scene_settings.get("beat_role")
        or scene_settings.get("scene_role")
        or ""
    ).strip().replace("_", " ")
    camera_angle = str(scene_settings.get("camera_angle") or "").strip()
    camera_movement = str(scene_settings.get("camera_movement") or "").strip()
    lighting = str(scene_settings.get("lighting") or "").strip()
    quality = str(scene_settings.get("quality") or "").strip()
    insert_types = _normalize_list(scene_settings.get("visual_insert_types"))
    profile = resolve_visual_audio_profile(settings.story_type, settings.story_template)

    prefix_parts = [
        f"{scene_role} beat" if scene_role else "",
        camera_angle,
        camera_movement or str(profile.get("camera_movement") or "").strip(),
        lighting or str(profile.get("lighting") or "").strip(),
        quality,
    ]
    if insert_types:
        prefix_parts.append(f"include {', '.join(insert_types[:3])} inserts")

    prefix = ". ".join(part for part in prefix_parts if part)
    if not prefix:
        final_prompt = base_prompt
    elif prefix.lower() in base_prompt.lower():
        final_prompt = base_prompt
    else:
        final_prompt = f"{prefix}. {base_prompt}"

    inserts = detect_insert_opportunities(scene.narration, base_prompt)
    if settings.story_type == "news":
        inserts = [
            shot for shot in inserts
            if shot.object_type in {"document", "countdown"}
        ]
    return enrich_image_prompt_with_inserts(final_prompt, inserts)


def build_image_prompt_audit_metadata(
    *,
    scene: SceneSpec,
    settings: ResolvedGenerationSettings,
    provider: str,
    style: str,
    final_prompt: str,
    generation_kwargs: Mapping[str, Any],
) -> dict[str, Any]:
    scene_settings = scene.scene_settings if isinstance(scene.scene_settings, Mapping) else {}
    profile = resolve_visual_audio_profile(settings.story_type, settings.story_template)
    insert_types = _normalize_list(scene_settings.get("visual_insert_types"))
    lighting = str(scene_settings.get("lighting") or profile.get("lighting") or "").strip()
    camera_movement = str(scene_settings.get("camera_movement") or profile.get("camera_movement") or "").strip()
    prompt_lower = final_prompt.lower()
    verification_terms = [
        camera_movement,
        lighting,
        *insert_types[:3],
    ]
    term_hits = {
        term: term.lower() in prompt_lower
        for term in verification_terms
        if term
    }

    return {
        "provider_prompt_preview": final_prompt[:600],
        "provider_prompt_word_count": len(final_prompt.split()),
        "story_profile": str(scene_settings.get("story_profile") or profile.get("profile_id") or "").strip() or None,
        "scene_role": str(scene_settings.get("scene_role") or "").strip() or None,
        "beat_role": str(scene_settings.get("beat_role") or scene_settings.get("scene_role") or "").strip() or None,
        "visual_insert_types": insert_types,
        "profile_lighting": lighting or None,
        "profile_camera_movement": camera_movement or None,
        "profile_keyword_hits": term_hits,
        "provider": provider,
        "style": style,
        "negative_prompt": generation_kwargs.get("negative_prompt"),
        "seed": generation_kwargs.get("seed"),
    }


__all__ = [
    "build_image_prompt_audit_metadata",
    "compose_image_generation_prompt",
]
