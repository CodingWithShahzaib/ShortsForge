from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.models import Project, ProjectVideoSettings
from backend.schemas.video_settings import (
    AudioSettings,
    ProjectVideoSettingsUpdate,
    SubtitleSettings,
    VideoStyleSettings,
)
from backend.services.project_video_settings_service import (
    apply_project_settings_snapshot,
    apply_project_video_settings_update,
    build_runtime_settings,
    ensure_project_video_settings_row,
)


def make_app_defaults() -> SimpleNamespace:
    return SimpleNamespace(
        default_ken_burns_enabled=True,
        default_ken_burns_zoom_percent=2.5,
        default_ken_burns_motion="auto",
        default_breathing_enabled=False,
        default_breathing_amplitude=1.5,
        default_breathing_speed=0.25,
        default_film_grain_enabled=False,
        default_film_grain_intensity=0.05,
        default_vignette_enabled=True,
        default_vignette_intensity=0.15,
        default_lut_enabled=False,
        default_lut_path=None,
        default_transition="fade",
        default_transition_duration_sec=0.3,
        default_scene_duration_min=2,
        default_scene_duration_max=4,
        default_subtitle_font="Arial",
        default_subtitle_size=48,
        default_subtitle_position="bottom",
        default_subtitle_background_opacity=0.65,
        default_subtitle_color="#FFFFFF",
        default_subtitle_shadow_enabled=True,
        default_subtitle_shadow_strength=0.85,
        default_subtitle_safe_zone_enabled=True,
        default_subtitle_safe_zone_platform="tiktok",
        default_subtitle_safe_zone_config=None,
        default_subtitle_words_per_group=4,
        default_word_pop_enabled=False,
        default_music_volume=0.3,
        default_ducking_enabled=True,
        default_ducking_amount=-12.0,
        default_tts_provider="kokoro",
        default_tts_voice="af_bella",
        default_tts_speed=1.0,
        default_tts_response_format="mp3",
        default_tts_normalize=True,
        default_llm_provider="openai",
        default_llm_model="gpt-4o-mini",
        default_image_provider="replicate",
        default_image_style="realistic",
        default_resolution="1080x1920",
        default_scene_count=5,
        default_word_count=400,
        default_scene_narration_style="balanced",
        default_inter_scene_pause_ms=600,
        default_transition_overlap_ms=250,
        default_use_production_storyboard=True,
        default_match_scenes_to_audio=True,
        default_visual_continuity="",
    )


class ProjectVideoSettingsRuntimeTests(unittest.TestCase):
    def test_apply_project_settings_snapshot_splits_structured_fields(self) -> None:
        app = make_app_defaults()
        project = Project(id="proj", title="Demo")

        row = apply_project_settings_snapshot(
            project,
            {
                "story_template": "default",
                "llm_provider": "openai",
                "resolution": "720x1280",
                "subtitle_font": "Inter",
                "ducking_amount": -9,
                "tts_provider": "kokoro",
                "tts_voice": "af_sky",
                "match_scenes_to_audio": False,
            },
            app,
        )

        self.assertEqual(
            project.settings,
            {
                "story_template": "default",
                "llm_provider": "openai",
                "resolution": "720x1280",
                "match_scenes_to_audio": False,
            },
        )
        self.assertEqual(row.subtitles["font_family"], "Inter")
        self.assertEqual(row.audio["ducking_amount"], -9)
        self.assertEqual(row.audio["voice_id"], "af_sky")

    def test_build_runtime_settings_merges_structured_settings_back_for_engine(self) -> None:
        app = make_app_defaults()
        project = Project(
            id="proj",
            title="Demo",
            settings={"story_template": "default", "match_scenes_to_audio": False},
        )
        project.video_settings = ProjectVideoSettings(
            project_id=project.id,
            video_style=VideoStyleSettings(default_transition="wipeleft").model_dump(),
            subtitles=SubtitleSettings(font_family="Inter").model_dump(),
            audio=AudioSettings(voice_provider="kokoro", voice_id="af_sky").model_dump(),
        )

        runtime = build_runtime_settings(project, app)

        self.assertEqual(runtime["story_template"], "default")
        self.assertFalse(runtime["match_scenes_to_audio"])
        self.assertEqual(runtime["transition"], "wipeleft")
        self.assertEqual(runtime["subtitle_font"], "Inter")
        self.assertEqual(runtime["tts_voice"], "af_sky")

    def test_structured_updates_no_longer_rewrite_flat_legacy_settings(self) -> None:
        app = make_app_defaults()
        project = Project(
            id="proj",
            title="Demo",
            settings={
                "story_template": "default",
                "match_scenes_to_audio": True,
                "subtitle_font": "Old",
                "tts_voice": "old_voice",
            },
        )

        apply_project_video_settings_update(
            project,
            ProjectVideoSettingsUpdate(
                subtitles=SubtitleSettings(font_family="Space Grotesk"),
                audio=AudioSettings(voice_provider="kokoro", voice_id="af_sky"),
            ),
            app,
        )

        self.assertEqual(
            project.settings,
            {
                "story_template": "default",
                "match_scenes_to_audio": True,
            },
        )

    def test_ensure_project_video_settings_row_builds_structured_defaults_from_legacy_settings(self) -> None:
        app = make_app_defaults()
        project = Project(
            id="proj",
            title="Demo",
            settings={
                "subtitle_font": "Space Grotesk",
                "tts_voice": "af_sky",
                "ducking_amount": -9,
            },
        )

        row = ensure_project_video_settings_row(project, app)

        self.assertIs(project.video_settings, row)
        self.assertEqual(row.subtitles["font_family"], "Space Grotesk")
        self.assertEqual(row.audio["voice_id"], "af_sky")
        self.assertEqual(row.audio["ducking_amount"], -9)


if __name__ == "__main__":
    unittest.main()
