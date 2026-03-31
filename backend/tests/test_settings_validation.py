from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.schemas.settings import AppSettings


class AppSettingsValidationTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
