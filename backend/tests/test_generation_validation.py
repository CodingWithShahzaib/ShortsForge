from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.schemas.generation import (
    GenerateStoryboardRequest,
    GenerateVideoProductionScriptRequest,
    GenerateVideoRequest,
)
from backend.schemas.project import SceneCreate, SceneUpdate


class GenerateVideoRequestValidationTests(unittest.TestCase):
    def test_defaults_are_valid(self) -> None:
        req = GenerateVideoRequest()
        self.assertEqual(req.scene_duration, 5.0)
        self.assertEqual(req.scene_narration_style, "balanced")
        self.assertEqual(req.subtitle_source, "llm")
        self.assertEqual(req.subtitle_words_per_group, 4)
        self.assertEqual(req.transcription_provider, "openai")
        self.assertTrue(req.use_production_storyboard)
        self.assertTrue(req.match_scenes_to_audio)
        self.assertEqual(req.visual_continuity, "")

    def test_rejects_scene_duration_below_minimum(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(scene_duration=0.5)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("scene_duration",) for err in errors))

    def test_rejects_invalid_subtitle_source(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(subtitle_source="manual")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("subtitle_source",) for err in errors))

    def test_rejects_invalid_scene_narration_style(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(scene_narration_style="extra_long")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("scene_narration_style",) for err in errors))

    def test_rejects_invalid_transcription_language(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(transcription_language="english")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("transcription_language",) for err in errors))

    def test_rejects_subtitle_words_per_group_below_minimum(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(subtitle_words_per_group=1)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("subtitle_words_per_group",) for err in errors))

    def test_scene_count_allows_up_to_100(self) -> None:
        req = GenerateVideoRequest(scene_count=100)
        self.assertEqual(req.scene_count, 100)

    def test_scene_count_rejects_above_100(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(scene_count=101)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("scene_count",) for err in errors))

    def test_storyboard_request_rejects_scene_count_above_100(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateStoryboardRequest(scene_count=101)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("scene_count",) for err in errors))

    def test_video_production_request_rejects_scene_count_above_100(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoProductionScriptRequest(concept="x", scene_count=101)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("scene_count",) for err in errors))

    def test_scene_create_rejects_negative_trim(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            SceneCreate(trim_start_sec=-0.1)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("trim_start_sec",) for err in errors))

    def test_scene_update_rejects_negative_trim(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            SceneUpdate(trim_end_sec=-0.2)
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("trim_end_sec",) for err in errors))


if __name__ == "__main__":
    unittest.main()
