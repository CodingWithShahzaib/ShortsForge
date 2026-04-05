from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.schemas.settings import AppSettings


class AppSettingsValidationTests(unittest.TestCase):
    def test_accepts_custom_alternating_fade_transition(self) -> None:
        settings = AppSettings(default_transition="fade_in_fade_out")
        self.assertEqual(settings.default_transition, "fade_in_fade_out")

    def test_accepts_custom_alternating_zoom_transition(self) -> None:
        settings = AppSettings(default_transition="zoom_in_zoom_out")
        self.assertEqual(settings.default_transition, "zoom_in_zoom_out")

    def test_rejects_invalid_default_transition(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            AppSettings(default_transition="cut")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("default_transition",) for err in errors))

    def test_rejects_invalid_default_scene_count(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            AppSettings(default_scene_count=101)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("default_scene_count",) for err in errors))

    def test_empty_optional_strings_normalize_to_none(self) -> None:
        settings = AppSettings(
            default_llm_model="   ",
            default_visual_continuity="",
            redis_url="  ",
        )
        self.assertIsNone(settings.default_llm_model)
        self.assertIsNone(settings.default_visual_continuity)
        self.assertIsNone(settings.redis_url)

    def test_rejects_invalid_default_scene_narration_style(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            AppSettings(default_scene_narration_style="extra_long")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("default_scene_narration_style",) for err in errors))

    def test_accepts_default_subtitle_source_transcription(self) -> None:
        settings = AppSettings(default_subtitle_source="transcription")
        self.assertEqual(settings.default_subtitle_source, "transcription")

    def test_rejects_invalid_default_transcription_language(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            AppSettings(default_transcription_language="english")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("default_transcription_language",) for err in errors))


if __name__ == "__main__":
    unittest.main()
