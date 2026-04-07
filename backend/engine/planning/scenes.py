from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class SceneSpec:
    id: str | None = None
    narration: str = ""
    subtitle: str = ""
    image_prompt: str = ""
    transition: str = "fade"
    transition_type: str = "fade"
    scene_type: str = "image"
    duration: float = 5.0
    scene_settings: dict[str, Any] = field(default_factory=dict)
    speaker_id: str | None = None
    shot_type: str = "medium"
    is_reaction_shot: bool = False
    character_references: dict[str, Any] = field(default_factory=dict)
    voice_profile: str | None = None
    trim_start_sec: float = 0.0
    trim_end_sec: float = 0.0

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any] | None, *, default_transition: str = "fade") -> "SceneSpec":
        data = dict(raw or {})
        transition = str(data.get("transition") or data.get("transition_type") or default_transition)
        scene_settings = data.get("scene_settings") if isinstance(data.get("scene_settings"), dict) else {}
        return cls(
            id=str(data.get("id")) if data.get("id") else None,
            narration=str(data.get("narration") or ""),
            subtitle=str(data.get("subtitle") or data.get("narration") or ""),
            image_prompt=str(data.get("image_prompt") or ""),
            transition=transition,
            transition_type=str(data.get("transition_type") or transition),
            scene_type=str(data.get("scene_type") or "image"),
            duration=float(data.get("duration") or 5.0),
            scene_settings=dict(scene_settings),
            speaker_id=str(data.get("speaker_id") or scene_settings.get("speaker_id") or "") or None,
            shot_type=str(data.get("shot_type") or scene_settings.get("shot_type") or "medium"),
            is_reaction_shot=bool(
                data.get("is_reaction_shot", scene_settings.get("is_reaction_shot", False))
            ),
            character_references=(
                dict(data.get("character_references"))
                if isinstance(data.get("character_references"), Mapping)
                else dict(scene_settings.get("character_references") or {})
            ),
            voice_profile=str(data.get("voice_profile") or scene_settings.get("voice_profile") or "") or None,
            trim_start_sec=max(0.0, float(data.get("trim_start_sec") or 0.0)),
            trim_end_sec=max(0.0, float(data.get("trim_end_sec") or 0.0)),
        )

    def to_mapping(self) -> dict[str, Any]:
        return asdict(self)


__all__ = ["SceneSpec"]
