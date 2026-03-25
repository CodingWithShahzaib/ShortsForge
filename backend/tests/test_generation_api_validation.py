from __future__ import annotations

from collections.abc import AsyncIterator
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.generation import router as generation_router
from backend.database import get_db


async def _fake_db() -> AsyncIterator[None]:
    yield None


class GenerationApiValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(generation_router, prefix="/api/generate")
        self.app.dependency_overrides[get_db] = _fake_db
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()

    def test_video_endpoint_returns_structured_field_errors(self) -> None:
        payload = {"title": "Demo", "scene_duration": 0.5}
        response = self.client.post("/api/generate/video", json=payload)
        self.assertEqual(response.status_code, 422)
        detail = response.json().get("detail")
        self.assertIsInstance(detail, list)
        self.assertTrue(any(item.get("loc") == ["body", "scene_duration"] for item in detail))


if __name__ == "__main__":
    unittest.main()
