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


if __name__ == "__main__":
    unittest.main()
