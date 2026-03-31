from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.schemas.video_settings import (
    AudioSettings,
    SafeZoneConfig,
    SubtitleSettings,
    VideoStyleSettings,
)
from backend.services.project_video_settings_service import default_subtitle_settings
from backend.services.project_video_settings_service import build_legacy_settings_patch
from backend.services.subtitle_service import generate_ass_from_scene_texts


class SubtitleSafeZoneTests(unittest.TestCase):
    def test_subtitle_settings_sync_safe_zone_platform(self) -> None:
        settings = SubtitleSettings(
            safe_zone_platform="youtube_short",
            safe_zone_config=SafeZoneConfig(platform="tiktok"),
        )
        self.assertIsNotNone(settings.safe_zone_config)
        assert settings.safe_zone_config is not None
        self.assertEqual(settings.safe_zone_config.platform, "youtube_short")

    def test_legacy_settings_patch_includes_custom_safe_zone(self) -> None:
        safe_zone = SafeZoneConfig(
            platform="tiktok",
            top_pct=0.08,
            bottom_pct=0.22,
            left_pct=0.08,
            right_pct=0.14,
            caption_band_left_pct=0.13,
            caption_band_right_pct=0.14,
            caption_band_top_pct=0.64,
            caption_band_bottom_pct=0.82,
        )
        patch = build_legacy_settings_patch(
            video=VideoStyleSettings(),
            subtitles=SubtitleSettings(
                safe_zone_platform="tiktok",
                safe_zone_config=safe_zone,
            ),
            audio=AudioSettings(),
        )
        self.assertEqual(patch["subtitle_safe_zone_config"], safe_zone.model_dump())

    def test_ass_output_uses_custom_caption_margins(self) -> None:
        safe_zone = SafeZoneConfig(
            platform="tiktok",
            top_pct=0.08,
            bottom_pct=0.22,
            left_pct=0.08,
            right_pct=0.14,
            caption_band_left_pct=0.13,
            caption_band_right_pct=0.14,
            caption_band_top_pct=0.64,
            caption_band_bottom_pct=0.82,
        )
        ass = generate_ass_from_scene_texts(
            [{"narration": "hello world", "duration": 2.0}],
            font_size=48,
            video_width=1000,
            video_height=2000,
            safe_zone_enabled=True,
            safe_zone_platform="tiktok",
            safe_zone_config=safe_zone.model_dump(),
        )
        self.assertIn(",2,130,140,360,1", ass)

    def test_default_subtitle_settings_use_default_safe_zone_config(self) -> None:
        safe_zone = SafeZoneConfig(platform="tiktok", caption_band_left_pct=0.14)
        app = SimpleNamespace(
            default_subtitle_font="Arial",
            default_subtitle_size=48,
            default_subtitle_position="bottom",
            default_subtitle_background_opacity=0.65,
            default_subtitle_color="#FFFFFF",
            default_subtitle_shadow_enabled=True,
            default_subtitle_shadow_strength=0.85,
            default_subtitle_safe_zone_enabled=True,
            default_subtitle_safe_zone_platform="tiktok",
            default_subtitle_safe_zone_config=safe_zone.model_dump(),
            default_subtitle_words_per_group=4,
            default_word_pop_enabled=False,
        )
        settings = default_subtitle_settings(app)
        self.assertIsNotNone(settings.safe_zone_config)
        assert settings.safe_zone_config is not None
        self.assertEqual(settings.safe_zone_config.caption_band_left_pct, 0.14)


if __name__ == "__main__":
    unittest.main()
