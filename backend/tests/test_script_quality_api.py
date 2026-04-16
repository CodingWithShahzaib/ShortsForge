from __future__ import annotations

from collections.abc import AsyncIterator
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.scripts import router as scripts_router
from backend.database import get_db


async def _fake_db() -> AsyncIterator[None]:
    yield None


class ScriptQualityApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(scripts_router, prefix="/api/scripts")
        self.app.dependency_overrides[get_db] = _fake_db
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()

    def test_analyze_endpoint_reports_tts_cleanup_and_repetition(self) -> None:
        response = self.client.post(
            "/api/scripts/analyze",
            json={
                "narration": "M oves across the board",
                "previous_narrations": ["Moves across the board."],
                "story_type": "scary",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["repetition_detected"])
        self.assertIn("spacing_or_punctuation", payload["tts_issues"])
        self.assertEqual(payload["cleaned_text"], "Moves across the board.")

    def test_improve_endpoint_returns_structured_response(self) -> None:
        with patch(
            "backend.api.scripts.improve_narration_text",
            new=AsyncMock(return_value="They thought it was a game. They were wrong."),
        ), patch(
            "backend.api.scripts.analyze_hook_quality",
            new=AsyncMock(return_value={"weak": False, "reason": "", "suggestions": ["Open on the danger."]}),
        ):
            response = self.client.post(
                "/api/scripts/improve",
                json={
                    "text": "They thought it was a game",
                    "story_type": "scary",
                    "is_first_scene": True,
                    "issues": ["hook", "tts_clarity"],
                },
            )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["text"], "They thought it was a game. They were wrong.")
        self.assertEqual(payload["improvements_made"], ["hook", "tts_clarity"])
        self.assertIn("score", payload["metrics"])
        self.assertIn("hook_strength", payload["metrics"])

    def test_analyze_story_structure_endpoint_returns_universal_report(self) -> None:
        response = self.client.post(
            "/api/scripts/analyze-story-structure",
            json={
                "story_type": "news",
                "story_template": "default",
                "story_brief": {
                    "hook_type": "statement",
                    "ending_type": "call_to_action",
                    "pacing_profile": "balanced",
                    "visual_variety": "medium",
                    "show_vs_tell_priority": "balanced",
                    "news": {
                        "fact_density": "dense",
                        "source_prominence": "high",
                    },
                },
                "script": "A new report just dropped. Here is why it matters.",
                "scenes": [
                    {
                        "narration": "A new report just dropped.",
                        "image_prompt": "wide newsroom graphic with highlighted report and clean documentary framing",
                        "scene_settings": {"shot_type": "wide"},
                    },
                    {
                        "narration": "Officials say the data changed what happens next.",
                        "image_prompt": "medium shot of documents, charts, and source callouts on screen",
                        "scene_settings": {"shot_type": "medium"},
                    },
                    {
                        "narration": "Check the source before you share the claim.",
                        "image_prompt": "closeup of source links and a hand pausing before posting",
                        "scene_settings": {"shot_type": "closeup"},
                    },
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["profile_id"], "news")
        self.assertIn("overall_score", payload)
        self.assertIn("scene_roles", payload)
        self.assertGreaterEqual(payload["show_tell_ratio"], 0)

    def test_normalize_script_endpoint_returns_fix_report(self) -> None:
        response = self.client.post(
            "/api/scripts/normalize",
            json={
                "text": (
                    "Explore the accord between Iran and the U. S. in just 48 hours. "
                    "Explore the accord between Iran and the U. S. in just 48 hours."
                ),
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("text", payload)
        self.assertIn("report", payload)
        self.assertTrue(payload["report"]["changed"])
        self.assertIn("U.S.", payload["text"])


if __name__ == "__main__":
    unittest.main()
