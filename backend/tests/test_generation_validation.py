from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.schemas.generation import GenerateVideoRequest


class GenerateVideoRequestValidationTests(unittest.TestCase):
    def test_defaults_are_valid(self) -> None:
        req = GenerateVideoRequest()
        self.assertEqual(req.scene_duration, 5.0)
        self.assertEqual(req.subtitle_source, "llm")
        self.assertEqual(req.transcription_provider, "openai")

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

    def test_rejects_invalid_transcription_language(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            GenerateVideoRequest(transcription_language="english")
        errors = ctx.exception.errors()
        self.assertTrue(any(err.get("loc") == ("transcription_language",) for err in errors))


if __name__ == "__main__":
    unittest.main()
