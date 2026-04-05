from __future__ import annotations

from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm.attributes import NO_VALUE

from backend.config import Settings as AppConfig
from backend.models import Project, ProjectVideoSettings, Scene, SceneAssetOverride
from backend.schemas.video_settings import (
    AudioSettings,
    ProjectVideoSettingsUpdate,
    SceneAssetOverrideUpdate,
    SubtitleSettings,
    VideoStyleSettings,
)

PROJECT_VIDEO_SETTINGS_LEGACY_KEYS = frozenset(
    {
        "ken_burns_enabled",
        "ken_burns_zoom_percent",
        "ken_burns_motion",
        "breathing_enabled",
        "breathing_amplitude",
        "breathing_speed",
        "film_grain_enabled",
        "film_grain_intensity",
        "vignette_enabled",
        "vignette_intensity",
        "lut_enabled",
        "lut_path",
        "subtitle_font",
        "subtitle_size",
        "subtitle_position",
        "subtitle_background_opacity",
        "subtitle_color",
        "subtitle_shadow_enabled",
        "subtitle_shadow_strength",
        "subtitle_safe_zone_enabled",
        "subtitle_safe_zone_platform",
        "subtitle_safe_zone_config",
        "subtitle_words_per_group",
        "subtitle_word_pop_enabled",
        "background_music_volume",
        "ducking_enabled",
        "ducking_amount",
        "tts_provider",
        "tts_voice",
        "tts_speed",
        "tts_response_format",
        "tts_normalize",
    }
)


def default_video_style_settings(app: AppConfig) -> VideoStyleSettings:
    return VideoStyleSettings(
        ken_burns_enabled=app.default_ken_burns_enabled,
        ken_burns_zoom_percent=app.default_ken_burns_zoom_percent,
        ken_burns_motion=app.default_ken_burns_motion,
        breathing_enabled=app.default_breathing_enabled,
        breathing_amplitude=app.default_breathing_amplitude,
        breathing_speed=app.default_breathing_speed,
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
        speed=app.default_tts_speed,
        response_format=app.default_tts_response_format,
        normalize=app.default_tts_normalize,
    )


def sanitize_project_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    data = dict(raw or {})
    return {
        key: value
        for key, value in data.items()
        if key not in PROJECT_VIDEO_SETTINGS_LEGACY_KEYS
    }


def build_project_video_settings_payload(
    raw: dict[str, Any] | None,
    app: AppConfig,
) -> tuple[VideoStyleSettings, SubtitleSettings, AudioSettings]:
    from backend.engine.planning.settings import ResolvedGenerationSettings

    resolved = ResolvedGenerationSettings.from_mapping(raw or {}, app)
    video = VideoStyleSettings(
        ken_burns_enabled=resolved.ken_burns_enabled,
        ken_burns_zoom_percent=resolved.ken_burns_zoom_percent,
        ken_burns_motion=resolved.ken_burns_motion,
        breathing_enabled=resolved.breathing_enabled,
        breathing_amplitude=resolved.breathing_amplitude,
        breathing_speed=resolved.breathing_speed,
        film_grain_enabled=resolved.film_grain_enabled,
        film_grain_intensity=resolved.film_grain_intensity,
        vignette_enabled=resolved.vignette_enabled,
        vignette_intensity=resolved.vignette_intensity,
        lut_enabled=resolved.lut_enabled,
        lut_path=resolved.lut_path,
        default_transition=resolved.transition,
        transition_duration_sec=resolved.transition_duration_sec,
        scene_duration_min=resolved.scene_duration_min,
        scene_duration_max=resolved.scene_duration_max,
    )
    subtitles = SubtitleSettings(
        font_family=resolved.subtitle_font,
        font_size=resolved.subtitle_size,
        position=resolved.subtitle_position,
        background_opacity=resolved.subtitle_background_opacity,
        text_color=resolved.subtitle_color,
        shadow_enabled=resolved.subtitle_shadow_enabled,
        shadow_strength=resolved.subtitle_shadow_strength,
        safe_zone_enabled=resolved.subtitle_safe_zone_enabled,
        safe_zone_platform=resolved.subtitle_safe_zone_platform,
        safe_zone_config=resolved.subtitle_safe_zone_config,
        words_per_group=resolved.subtitle_words_per_group,
        word_pop_enabled=resolved.subtitle_word_pop_enabled,
    )
    audio = AudioSettings(
        music_volume=resolved.background_music_volume,
        ducking_enabled=resolved.ducking_enabled,
        ducking_amount=resolved.ducking_amount,
        voice_provider=resolved.tts_provider,
        voice_id=resolved.tts_voice,
        speed=resolved.tts_speed,
        response_format=resolved.tts_response_format,
        normalize=resolved.tts_normalize,
    )
    return video, subtitles, audio


def sync_project_video_settings_from_mapping(
    project: Project,
    raw: dict[str, Any] | None,
    app: AppConfig,
) -> ProjectVideoSettings:
    row = _peek_project_video_settings_row(project)
    if row is None:
        row = ProjectVideoSettings(project_id=project.id)
        project.video_settings = row
    video, subtitles, audio = build_project_video_settings_payload(raw, app)
    row.video_style = video.model_dump()
    row.subtitles = subtitles.model_dump()
    row.audio = audio.model_dump()
    return row


def apply_project_settings_snapshot(
    project: Project,
    raw: dict[str, Any] | None,
    app: AppConfig,
) -> ProjectVideoSettings:
    project.settings = sanitize_project_settings(raw)
    return sync_project_video_settings_from_mapping(project, raw, app)


def _legacy_video_style_payload(raw: dict[str, Any] | None, app: AppConfig) -> dict[str, Any]:
    data = dict(raw or {})
    return {
        "ken_burns_enabled": data.get("ken_burns_enabled", app.default_ken_burns_enabled),
        "ken_burns_zoom_percent": data.get("ken_burns_zoom_percent", app.default_ken_burns_zoom_percent),
        "ken_burns_motion": data.get("ken_burns_motion", app.default_ken_burns_motion),
        "breathing_enabled": data.get("breathing_enabled", app.default_breathing_enabled),
        "breathing_amplitude": data.get("breathing_amplitude", app.default_breathing_amplitude),
        "breathing_speed": data.get("breathing_speed", app.default_breathing_speed),
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
        "speed": data.get("tts_speed", app.default_tts_speed),
        "response_format": data.get("tts_response_format", app.default_tts_response_format),
        "normalize": data.get("tts_normalize", app.default_tts_normalize),
    }


def _peek_project_video_settings_row(project: Project) -> ProjectVideoSettings | None:
    loaded = inspect(project).attrs.video_settings.loaded_value
    if loaded is NO_VALUE:
        return None
    return loaded


def resolve_project_video_settings(project: Project, app: AppConfig) -> tuple[VideoStyleSettings, SubtitleSettings, AudioSettings]:
    legacy_settings = project.settings if isinstance(project.settings, dict) else {}
    row = _peek_project_video_settings_row(project)
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
        "breathing_enabled": video.breathing_enabled,
        "breathing_amplitude": video.breathing_amplitude,
        "breathing_speed": video.breathing_speed,
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
        "tts_speed": audio.speed,
        "tts_response_format": audio.response_format,
        "tts_normalize": audio.normalize,
    }


def build_runtime_settings(project: Project, app: AppConfig) -> dict[str, Any]:
    video, subtitles, audio = resolve_project_video_settings(project, app)
    return {
        **sanitize_project_settings(project.settings if isinstance(project.settings, dict) else None),
        **build_legacy_settings_patch(video=video, subtitles=subtitles, audio=audio),
    }


def ensure_project_video_settings_row(project: Project, app: AppConfig) -> ProjectVideoSettings:
    row = _peek_project_video_settings_row(project)
    if row is not None:
        return row

    legacy_settings = project.settings if isinstance(project.settings, dict) else {}
    row = ProjectVideoSettings(
        project_id=project.id,
        video_style=VideoStyleSettings.model_validate(
            _legacy_video_style_payload(legacy_settings, app)
        ).model_dump(),
        subtitles=SubtitleSettings.model_validate(
            _legacy_subtitle_payload(legacy_settings, app)
        ).model_dump(),
        audio=AudioSettings.model_validate(
            _legacy_audio_payload(legacy_settings, app)
        ).model_dump(),
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
    project.settings = sanitize_project_settings(
        project.settings if isinstance(project.settings, dict) else None
    )
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

