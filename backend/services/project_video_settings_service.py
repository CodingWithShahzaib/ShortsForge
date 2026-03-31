from __future__ import annotations

from typing import Any

from backend.config import Settings as AppConfig
from backend.models import Project, ProjectVideoSettings, Scene, SceneAssetOverride
from backend.schemas.video_settings import (
    AudioSettings,
    ProjectVideoSettingsUpdate,
    SceneAssetOverrideUpdate,
    SubtitleSettings,
    VideoStyleSettings,
)


def default_video_style_settings(app: AppConfig) -> VideoStyleSettings:
    return VideoStyleSettings(
        ken_burns_enabled=app.default_ken_burns_enabled,
        ken_burns_zoom_percent=app.default_ken_burns_zoom_percent,
        ken_burns_motion=app.default_ken_burns_motion,
        film_grain_enabled=app.default_film_grain_enabled,
        film_grain_intensity=app.default_film_grain_intensity,
        vignette_enabled=app.default_vignette_enabled,
        vignette_intensity=app.default_vignette_intensity,
        lut_enabled=app.default_lut_enabled,
        lut_path=app.default_lut_path or None,
        default_transition=app.default_transition,
        transition_duration_sec=app.default_transition_duration_sec,
        scene_duration_min=app.default_scene_duration_min,
        scene_duration_max=app.default_scene_duration_max,
    )


def default_subtitle_settings(app: AppConfig) -> SubtitleSettings:
    return SubtitleSettings(
        font_family=app.default_subtitle_font,
        font_size=app.default_subtitle_size,
        position=app.default_subtitle_position,
        background_opacity=app.default_subtitle_background_opacity,
        text_color=app.default_subtitle_color,
        shadow_enabled=app.default_subtitle_shadow_enabled,
        shadow_strength=app.default_subtitle_shadow_strength,
        safe_zone_enabled=app.default_subtitle_safe_zone_enabled,
        safe_zone_platform=app.default_subtitle_safe_zone_platform,
        safe_zone_config=app.default_subtitle_safe_zone_config,
        words_per_group=app.default_subtitle_words_per_group,
        word_pop_enabled=app.default_word_pop_enabled,
    )


def default_audio_settings(app: AppConfig) -> AudioSettings:
    return AudioSettings(
        music_volume=app.default_music_volume,
        ducking_enabled=app.default_ducking_enabled,
        ducking_amount=app.default_ducking_amount,
        voice_provider=app.default_tts_provider,
        voice_id=app.default_tts_voice,
    )


def _legacy_video_style_payload(raw: dict[str, Any] | None, app: AppConfig) -> dict[str, Any]:
    data = dict(raw or {})
    return {
        "ken_burns_enabled": data.get("ken_burns_enabled", app.default_ken_burns_enabled),
        "ken_burns_zoom_percent": data.get("ken_burns_zoom_percent", app.default_ken_burns_zoom_percent),
        "ken_burns_motion": data.get("ken_burns_motion", app.default_ken_burns_motion),
        "film_grain_enabled": data.get("film_grain_enabled", app.default_film_grain_enabled),
        "film_grain_intensity": data.get("film_grain_intensity", app.default_film_grain_intensity),
        "vignette_enabled": data.get("vignette_enabled", app.default_vignette_enabled),
        "vignette_intensity": data.get("vignette_intensity", app.default_vignette_intensity),
        "lut_enabled": data.get("lut_enabled", app.default_lut_enabled),
        "lut_path": data.get("lut_path", app.default_lut_path or None),
        "default_transition": data.get("transition", app.default_transition),
        "transition_duration_sec": data.get("transition_duration_sec", app.default_transition_duration_sec),
        "scene_duration_min": data.get("scene_duration_min", app.default_scene_duration_min),
        "scene_duration_max": data.get("scene_duration_max", app.default_scene_duration_max),
    }


def _legacy_subtitle_payload(raw: dict[str, Any] | None, app: AppConfig) -> dict[str, Any]:
    data = dict(raw or {})
    return {
        "font_family": data.get("subtitle_font", app.default_subtitle_font),
        "font_size": data.get("subtitle_size", app.default_subtitle_size),
        "position": data.get("subtitle_position", app.default_subtitle_position),
        "background_opacity": data.get(
            "subtitle_background_opacity",
            app.default_subtitle_background_opacity,
        ),
        "text_color": data.get("subtitle_color", app.default_subtitle_color),
        "shadow_enabled": data.get("subtitle_shadow_enabled", app.default_subtitle_shadow_enabled),
        "shadow_strength": data.get("subtitle_shadow_strength", app.default_subtitle_shadow_strength),
        "safe_zone_enabled": data.get("subtitle_safe_zone_enabled", app.default_subtitle_safe_zone_enabled),
        "safe_zone_platform": data.get("subtitle_safe_zone_platform", app.default_subtitle_safe_zone_platform),
        "safe_zone_config": data.get(
            "subtitle_safe_zone_config",
            app.default_subtitle_safe_zone_config,
        ),
        "words_per_group": data.get("subtitle_words_per_group", app.default_subtitle_words_per_group),
        "word_pop_enabled": data.get("subtitle_word_pop_enabled", app.default_word_pop_enabled),
    }


def _legacy_audio_payload(raw: dict[str, Any] | None, app: AppConfig) -> dict[str, Any]:
    data = dict(raw or {})
    return {
        "music_volume": data.get("background_music_volume", app.default_music_volume),
        "ducking_enabled": data.get("ducking_enabled", app.default_ducking_enabled),
        "ducking_amount": data.get("ducking_amount", app.default_ducking_amount),
        "voice_provider": data.get("tts_provider", app.default_tts_provider),
        "voice_id": data.get("tts_voice", app.default_tts_voice),
    }


def resolve_project_video_settings(project: Project, app: AppConfig) -> tuple[VideoStyleSettings, SubtitleSettings, AudioSettings]:
    legacy_settings = project.settings if isinstance(project.settings, dict) else {}
    row = project.video_settings
    video = VideoStyleSettings.model_validate(row.video_style if row and row.video_style else _legacy_video_style_payload(legacy_settings, app))
    subtitles = SubtitleSettings.model_validate(row.subtitles if row and row.subtitles else _legacy_subtitle_payload(legacy_settings, app))
    audio = AudioSettings.model_validate(row.audio if row and row.audio else _legacy_audio_payload(legacy_settings, app))
    return video, subtitles, audio


def build_legacy_settings_patch(
    *,
    video: VideoStyleSettings,
    subtitles: SubtitleSettings,
    audio: AudioSettings,
) -> dict[str, Any]:
    return {
        "ken_burns_enabled": video.ken_burns_enabled,
        "ken_burns_zoom_percent": video.ken_burns_zoom_percent,
        "ken_burns_motion": video.ken_burns_motion,
        "film_grain_enabled": video.film_grain_enabled,
        "film_grain_intensity": video.film_grain_intensity,
        "vignette_enabled": video.vignette_enabled,
        "vignette_intensity": video.vignette_intensity,
        "lut_enabled": video.lut_enabled,
        "lut_path": video.lut_path,
        "transition": video.default_transition,
        "transition_duration_sec": video.transition_duration_sec,
        "scene_duration_min": video.scene_duration_min,
        "scene_duration_max": video.scene_duration_max,
        "subtitle_font": subtitles.font_family,
        "subtitle_size": subtitles.font_size,
        "subtitle_position": subtitles.position,
        "subtitle_background_opacity": subtitles.background_opacity,
        "subtitle_color": subtitles.text_color,
        "subtitle_shadow_enabled": subtitles.shadow_enabled,
        "subtitle_shadow_strength": subtitles.shadow_strength,
        "subtitle_safe_zone_enabled": subtitles.safe_zone_enabled,
        "subtitle_safe_zone_platform": subtitles.safe_zone_platform,
        "subtitle_safe_zone_config": (
            subtitles.safe_zone_config.model_dump()
            if subtitles.safe_zone_config is not None
            else None
        ),
        "subtitle_words_per_group": subtitles.words_per_group,
        "subtitle_word_pop_enabled": subtitles.word_pop_enabled,
        "background_music_volume": audio.music_volume,
        "ducking_enabled": audio.ducking_enabled,
        "ducking_amount": audio.ducking_amount,
        "tts_provider": audio.voice_provider,
        "tts_voice": audio.voice_id,
    }


def ensure_project_video_settings_row(project: Project, app: AppConfig) -> ProjectVideoSettings:
    video, subtitles, audio = resolve_project_video_settings(project, app)
    row = project.video_settings
    if row is None:
        row = ProjectVideoSettings(
            project_id=project.id,
            video_style=video.model_dump(),
            subtitles=subtitles.model_dump(),
            audio=audio.model_dump(),
        )
        project.video_settings = row
    return row


def apply_project_video_settings_update(
    project: Project,
    update: ProjectVideoSettingsUpdate,
    app: AppConfig,
) -> ProjectVideoSettings:
    row = ensure_project_video_settings_row(project, app)
    video, subtitles, audio = resolve_project_video_settings(project, app)
    if update.video_style is not None:
        video = update.video_style
    if update.subtitles is not None:
        subtitles = update.subtitles
    if update.audio is not None:
        audio = update.audio
    row.video_style = video.model_dump()
    row.subtitles = subtitles.model_dump()
    row.audio = audio.model_dump()
    project.settings = {
        **(project.settings or {}),
        **build_legacy_settings_patch(video=video, subtitles=subtitles, audio=audio),
    }
    return row


def ensure_scene_asset_override(scene: Scene) -> SceneAssetOverride:
    row = scene.asset_override
    if row is None:
        row = SceneAssetOverride(scene_id=scene.id)
        scene.asset_override = row
    return row


def apply_scene_asset_override_update(scene: Scene, update: SceneAssetOverrideUpdate) -> SceneAssetOverride:
    row = ensure_scene_asset_override(scene)
    payload = update.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(row, field, value)
    if row.custom_transition:
        scene.transition_type = row.custom_transition
    if row.custom_duration is not None:
        scene.duration = row.custom_duration
    return row

