from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


def _normalize_scene_narration_style(value: Any) -> str:
    style = str(value or "").strip().lower()
    return style if style in {"short", "balanced", "long"} else "balanced"


@dataclass(frozen=True)
class ResolvedGenerationSettings:
    story_type: str = "general"
    story_template: str = "default"
    custom_script: str | None = None
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    image_provider: str = "replicate"
    image_style: str = "realistic"
    tts_provider: str = "edge"
    tts_voice: str = "en-US-ChristopherNeural"
    resolution: str = "1080x1920"
    transition: str = "fade"
    subtitle_enabled: bool = True
    subtitle_source: str = "llm"
    generate_subtitles: bool = True
    transcription_provider: str = "openai"
    transcription_language: str = "en"
    subtitle_font: str = "Arial"
    subtitle_size: int = 48
    subtitle_color: str = "#FFFFFF"
    subtitle_position: str = "bottom"
    subtitle_words_per_group: int = 4
    subtitle_background_opacity: float = 0.65
    subtitle_shadow_enabled: bool = True
    subtitle_shadow_strength: float = 0.85
    subtitle_safe_zone_enabled: bool = True
    subtitle_safe_zone_platform: str = "tiktok"
    subtitle_safe_zone_config: dict[str, Any] | None = None
    subtitle_word_pop_enabled: bool = False
    background_music: str | None = None
    background_music_volume: float = 0.15
    ducking_enabled: bool = True
    ducking_amount: float = -12.0
    scene_count: int = 5
    word_count: int = 400
    scene_narration_style: str = "balanced"
    scene_duration: float = 5.0
    scene_duration_min: int = 2
    scene_duration_max: int = 4
    inter_scene_pause_ms: int = 600
    transition_overlap_ms: int = 250
    use_production_storyboard: bool = True
    match_scenes_to_audio: bool = True
    visual_continuity: str = ""
    ken_burns_enabled: bool = True
    ken_burns_zoom_percent: float = 2.5
    ken_burns_motion: str = "auto"
    film_grain_enabled: bool = False
    film_grain_intensity: float = 0.05
    vignette_enabled: bool = True
    vignette_intensity: float = 0.15
    lut_enabled: bool = False
    lut_path: str | None = None
    transition_duration_sec: float = 0.3
    extra_settings: dict[str, Any] | None = None

    @classmethod
    def from_mapping(
        cls,
        raw: Mapping[str, Any] | None,
        app_settings: Any,
    ) -> "ResolvedGenerationSettings":
        data = dict(raw or {})
        app_get = lambda name, default=None: getattr(app_settings, name, default)
        return cls(
            story_type=str(data.get("story_type") or "general"),
            story_template=str(data.get("story_template") or "default"),
            custom_script=data.get("custom_script"),
            llm_provider=str(data.get("llm_provider") or app_settings.default_llm_provider or "openai"),
            llm_model=str(data.get("llm_model") or app_settings.default_llm_model or "gpt-4o-mini"),
            image_provider=str(data.get("image_provider") or app_settings.default_image_provider or "replicate"),
            image_style=str(data.get("image_style") or app_settings.default_image_style or "realistic"),
            tts_provider=str(data.get("tts_provider") or app_settings.default_tts_provider or "edge"),
            tts_voice=str(data.get("tts_voice") or app_settings.default_tts_voice or "en-US-ChristopherNeural"),
            resolution=str(data.get("resolution") or app_settings.default_resolution or "1080x1920"),
            transition=str(data.get("transition") or app_settings.default_transition or "fade"),
            subtitle_enabled=bool(data.get("subtitle_enabled", True)),
            subtitle_source=str(data.get("subtitle_source") or "llm"),
            generate_subtitles=bool(data.get("generate_subtitles", True)),
            transcription_provider=str(data.get("transcription_provider") or "openai"),
            transcription_language=str(data.get("transcription_language") or "en"),
            subtitle_font=str(data.get("subtitle_font") or "Arial"),
            subtitle_size=int(data.get("subtitle_size") or 48),
            subtitle_color=str(data.get("subtitle_color") or "#FFFFFF"),
            subtitle_position=str(data.get("subtitle_position") or "bottom"),
            subtitle_words_per_group=max(2, min(12, int(data.get("subtitle_words_per_group") or 4))),
            subtitle_background_opacity=max(
                0.0,
                min(1.0, float(data.get("subtitle_background_opacity") or app_get("default_subtitle_background_opacity", 0.65) or 0.65)),
            ),
            subtitle_shadow_enabled=bool(
                data.get(
                    "subtitle_shadow_enabled",
                    app_get("default_subtitle_shadow_enabled")
                    if app_get("default_subtitle_shadow_enabled") is not None
                    else True,
                )
            ),
            subtitle_shadow_strength=max(
                0.0,
                min(2.0, float(data.get("subtitle_shadow_strength") or app_get("default_subtitle_shadow_strength", 0.85) or 0.85)),
            ),
            subtitle_safe_zone_enabled=bool(
                data.get(
                    "subtitle_safe_zone_enabled",
                    app_get("default_subtitle_safe_zone_enabled")
                    if app_get("default_subtitle_safe_zone_enabled") is not None
                    else True,
                )
            ),
            subtitle_safe_zone_platform=str(
                data.get("subtitle_safe_zone_platform")
                or app_get("default_subtitle_safe_zone_platform")
                or "tiktok"
            ),
            subtitle_safe_zone_config=(
                dict(data.get("subtitle_safe_zone_config"))
                if isinstance(data.get("subtitle_safe_zone_config"), Mapping)
                else None
            ),
            subtitle_word_pop_enabled=bool(
                data.get(
                    "subtitle_word_pop_enabled",
                    app_get("default_word_pop_enabled")
                    if app_get("default_word_pop_enabled") is not None
                    else False,
                )
            ),
            background_music=data.get("background_music"),
            background_music_volume=float(data.get("background_music_volume") or app_get("default_music_volume", 0.15) or 0.15),
            ducking_enabled=bool(
                data.get(
                    "ducking_enabled",
                    app_get("default_ducking_enabled")
                    if app_get("default_ducking_enabled") is not None
                    else True,
                )
            ),
            ducking_amount=float(data.get("ducking_amount") or app_get("default_ducking_amount", -12.0) or -12.0),
            scene_count=max(2, min(100, int(data.get("scene_count") or app_settings.default_scene_count or 5))),
            word_count=max(150, min(800, int(data.get("word_count") or app_settings.default_word_count or 400))),
            scene_narration_style=_normalize_scene_narration_style(
                data.get("scene_narration_style")
                or app_settings.default_scene_narration_style
                or "balanced"
            ),
            scene_duration=max(1.0, min(60.0, float(data.get("scene_duration") or 5.0))),
            scene_duration_min=max(1, min(12, int(data.get("scene_duration_min") or app_get("default_scene_duration_min", 2) or 2))),
            scene_duration_max=max(1, min(20, int(data.get("scene_duration_max") or app_get("default_scene_duration_max", 4) or 4))),
            inter_scene_pause_ms=max(0, min(1200, int(data.get("inter_scene_pause_ms") or app_settings.default_inter_scene_pause_ms or 600))),
            transition_overlap_ms=max(0, min(800, int(data.get("transition_overlap_ms") or app_settings.default_transition_overlap_ms or 250))),
            use_production_storyboard=bool(
                data.get(
                    "use_production_storyboard",
                    app_settings.default_use_production_storyboard
                    if app_settings.default_use_production_storyboard is not None
                    else True,
                )
            ),
            match_scenes_to_audio=bool(
                data.get(
                    "match_scenes_to_audio",
                    app_settings.default_match_scenes_to_audio
                    if app_settings.default_match_scenes_to_audio is not None
                    else True,
                )
            ),
            visual_continuity=str(data.get("visual_continuity") or app_settings.default_visual_continuity or ""),
            ken_burns_enabled=bool(
                data.get(
                    "ken_burns_enabled",
                    app_get("default_ken_burns_enabled")
                    if app_get("default_ken_burns_enabled") is not None
                    else True,
                )
            ),
            ken_burns_zoom_percent=max(
                0.0,
                min(8.0, float(data.get("ken_burns_zoom_percent") or app_get("default_ken_burns_zoom_percent", 2.5) or 2.5)),
            ),
            ken_burns_motion=str(data.get("ken_burns_motion") or app_get("default_ken_burns_motion", "auto") or "auto"),
            film_grain_enabled=bool(
                data.get(
                    "film_grain_enabled",
                    app_get("default_film_grain_enabled")
                    if app_get("default_film_grain_enabled") is not None
                    else False,
                )
            ),
            film_grain_intensity=max(
                0.0,
                min(0.25, float(data.get("film_grain_intensity") or app_get("default_film_grain_intensity", 0.05) or 0.05)),
            ),
            vignette_enabled=bool(
                data.get(
                    "vignette_enabled",
                    app_get("default_vignette_enabled")
                    if app_get("default_vignette_enabled") is not None
                    else True,
                )
            ),
            vignette_intensity=max(
                0.0,
                min(0.5, float(data.get("vignette_intensity") or app_get("default_vignette_intensity", 0.15) or 0.15)),
            ),
            lut_enabled=bool(
                data.get(
                    "lut_enabled",
                    app_get("default_lut_enabled")
                    if app_get("default_lut_enabled") is not None
                    else False,
                )
            ),
            lut_path=str(data.get("lut_path") or app_get("default_lut_path", "") or "") or None,
            transition_duration_sec=max(
                0.0,
                min(2.0, float(data.get("transition_duration_sec") or app_get("default_transition_duration_sec", 0.3) or 0.3)),
            ),
            extra_settings=data.get("extra_settings") if isinstance(data.get("extra_settings"), dict) else None,
        )

    @classmethod
    def from_request(
        cls,
        req: Any,
        app_settings: Any,
    ) -> "ResolvedGenerationSettings":
        raw = req.model_dump(
            exclude_unset=True,
            exclude={
                "project_id",
                "scenes",
                "control_mode",
                "storyboard_only",
                "prepare_only",
                "pipeline_mode",
                "target_stage",
            },
        )
        return cls.from_mapping(raw, app_settings)

    def to_settings_dict(self) -> dict[str, Any]:
        return asdict(self)


__all__ = ["ResolvedGenerationSettings"]
