from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

TransitionId = Literal[
    "fade",
    "fade_in_fade_out",
    "zoom_in_zoom_out",
    "dissolve",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "slideup",
    "slidedown",
    "slideleft",
    "slideright",
    "circleopen",
    "circleclose",
    "zoom_in",
    "zoom_out",
    "pan_left",
    "pan_right",
    "pan_up",
    "pan_down",
    "crossfade",
    "glitch",
    "none",
]

SubtitlePosition = Literal["bottom", "center", "top"]
SafeZonePlatform = Literal["tiktok", "instagram_reel", "youtube_short"]
SceneRegenerateMode = Literal["image", "audio", "both"]
AssetOverrideStatus = Literal["none", "manual_override", "ai_generated"]
AssetKind = Literal["image", "audio", "video"]
KenBurnsMotion = Literal["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "auto"]


class SafeZoneConfig(BaseModel):
    platform: SafeZonePlatform
    top_pct: float = Field(default=0.08, ge=0.0, le=0.5)
    bottom_pct: float = Field(default=0.25, ge=0.0, le=0.7)
    left_pct: float = Field(default=0.08, ge=0.0, le=0.4)
    right_pct: float = Field(default=0.16, ge=0.0, le=0.4)
    caption_band_left_pct: float = Field(default=0.12, ge=0.0, le=0.45)
    caption_band_right_pct: float = Field(default=0.12, ge=0.0, le=0.45)
    caption_band_top_pct: float = Field(default=0.60, ge=0.0, le=1.0)
    caption_band_bottom_pct: float = Field(default=0.75, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _validate_geometry(self) -> "SafeZoneConfig":
        if self.top_pct + self.bottom_pct >= 0.85:
            raise ValueError("Content safe zone must leave visible vertical space.")
        if self.left_pct + self.right_pct >= 0.85:
            raise ValueError("Content safe zone must leave visible horizontal space.")
        if self.caption_band_top_pct >= self.caption_band_bottom_pct:
            raise ValueError("Subtitle band top must be above the bottom edge.")
        if self.caption_band_left_pct + self.caption_band_right_pct >= 0.9:
            raise ValueError("Subtitle band must leave readable horizontal space.")
        return self


def default_safe_zone_presets() -> dict[SafeZonePlatform, SafeZoneConfig]:
    return {
        "tiktok": SafeZoneConfig(
            platform="tiktok",
            top_pct=0.08,
            bottom_pct=0.25,
            left_pct=0.08,
            right_pct=0.16,
            caption_band_left_pct=0.12,
            caption_band_right_pct=0.12,
            caption_band_top_pct=0.60,
            caption_band_bottom_pct=0.75,
        ),
        "instagram_reel": SafeZoneConfig(
            platform="instagram_reel",
            top_pct=0.08,
            bottom_pct=0.23,
            left_pct=0.08,
            right_pct=0.15,
            caption_band_left_pct=0.12,
            caption_band_right_pct=0.12,
            caption_band_top_pct=0.60,
            caption_band_bottom_pct=0.76,
        ),
        "youtube_short": SafeZoneConfig(
            platform="youtube_short",
            top_pct=0.07,
            bottom_pct=0.22,
            left_pct=0.08,
            right_pct=0.13,
            caption_band_left_pct=0.12,
            caption_band_right_pct=0.12,
            caption_band_top_pct=0.60,
            caption_band_bottom_pct=0.78,
        ),
    }


class VideoStyleSettings(BaseModel):
    ken_burns_enabled: bool = True
    ken_burns_zoom_percent: float = Field(default=2.5, ge=0.0, le=8.0)
    ken_burns_motion: KenBurnsMotion = "auto"
    breathing_enabled: bool = False
    breathing_amplitude: float = Field(default=1.5, ge=0.0, le=5.0)
    breathing_speed: float = Field(default=0.25, ge=0.05, le=1.0)
    film_grain_enabled: bool = False
    film_grain_intensity: float = Field(default=0.05, ge=0.0, le=0.25)
    vignette_enabled: bool = True
    vignette_intensity: float = Field(default=0.15, ge=0.0, le=0.5)
    lut_enabled: bool = False
    lut_path: str | None = None
    default_transition: TransitionId = "fade"
    transition_duration_sec: float = Field(default=0.3, ge=0.0, le=2.0)
    scene_duration_min: int = Field(default=2, ge=1, le=12)
    scene_duration_max: int = Field(default=4, ge=1, le=20)


class SubtitleSettings(BaseModel):
    font_family: str = "Arial"
    font_size: int = Field(default=48, ge=18, le=96)
    position: SubtitlePosition = "bottom"
    background_opacity: float = Field(default=0.65, ge=0.0, le=1.0)
    text_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    shadow_enabled: bool = True
    shadow_strength: float = Field(default=0.85, ge=0.0, le=2.0)
    safe_zone_enabled: bool = True
    safe_zone_platform: SafeZonePlatform = "tiktok"
    safe_zone_config: SafeZoneConfig | None = None
    words_per_group: int = Field(default=4, ge=1, le=12)
    word_pop_enabled: bool = False

    @model_validator(mode="after")
    def _sync_safe_zone_platform(self) -> "SubtitleSettings":
        if self.safe_zone_config is not None and self.safe_zone_config.platform != self.safe_zone_platform:
            self.safe_zone_config = self.safe_zone_config.model_copy(
                update={"platform": self.safe_zone_platform}
            )
        return self


class AudioSettings(BaseModel):
    music_volume: float = Field(default=0.3, ge=0.0, le=1.0)
    ducking_enabled: bool = True
    ducking_amount: float = Field(default=-12.0, ge=-30.0, le=-1.0)
    voice_provider: str = "kokoro"
    voice_id: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    response_format: Literal["mp3", "wav", "opus", "flac", "m4a"] = "mp3"
    normalize: bool = True


class ProjectVideoSettingsBase(BaseModel):
    video_style: VideoStyleSettings = Field(default_factory=VideoStyleSettings)
    subtitles: SubtitleSettings = Field(default_factory=SubtitleSettings)
    audio: AudioSettings = Field(default_factory=AudioSettings)


class ProjectVideoSettingsCreate(ProjectVideoSettingsBase):
    project_id: str


class ProjectVideoSettingsUpdate(BaseModel):
    video_style: VideoStyleSettings | None = None
    subtitles: SubtitleSettings | None = None
    audio: AudioSettings | None = None


class ProjectVideoSettingsOut(ProjectVideoSettingsBase):
    id: str
    project_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneAssetOverrideBase(BaseModel):
    manual_image_path: str | None = None
    manual_audio_path: str | None = None
    manual_video_path: str | None = None
    custom_transition: TransitionId | None = None
    custom_duration: float | None = Field(default=None, ge=0.5, le=30.0)
    image_status: AssetOverrideStatus = "none"
    audio_status: AssetOverrideStatus = "none"
    video_status: AssetOverrideStatus = "none"


class SceneAssetOverrideCreate(SceneAssetOverrideBase):
    scene_id: str


class SceneAssetOverrideUpdate(BaseModel):
    manual_image_path: str | None = None
    manual_audio_path: str | None = None
    manual_video_path: str | None = None
    custom_transition: TransitionId | None = None
    custom_duration: float | None = Field(default=None, ge=0.5, le=30.0)
    image_status: AssetOverrideStatus | None = None
    audio_status: AssetOverrideStatus | None = None
    video_status: AssetOverrideStatus | None = None


class SceneAssetOverrideOut(SceneAssetOverrideBase):
    id: str
    scene_id: str
    overridden_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneRegenerateRequest(BaseModel):
    mode: SceneRegenerateMode = "image"
    preserve_manual_overrides: bool = True


class SafeZoneResponse(BaseModel):
    defaults_to: SafeZonePlatform = "tiktok"
    presets: dict[SafeZonePlatform, SafeZoneConfig] = Field(default_factory=default_safe_zone_presets)

