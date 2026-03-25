from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.projects import router as projects_router
from backend.database import get_db


class _FakeResult:
    def __init__(self, *, rows=None, one_row=None):
        self._rows = rows or []
        self._one_row = one_row

    def all(self):
        return self._rows

    def one(self):
        return self._one_row


class _FakeSession:
    def __init__(self, responses: list[_FakeResult]):
        self._responses = responses
        self.calls = 0

    async def execute(self, _query):
        response = self._responses[self.calls]
        self.calls += 1
        return response


class DashboardApiBehaviorTests(unittest.TestCase):
    def _build_client(self, responses: list[_FakeResult]) -> TestClient:
        app = FastAPI()
        app.include_router(projects_router, prefix="/api/projects")
        session = _FakeSession(responses)

        async def _fake_db() -> AsyncIterator[_FakeSession]:
            yield session

        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)
        self.addCleanup(app.dependency_overrides.clear)
        return client

    def test_dashboard_summary_returns_expected_shape(self) -> None:
        responses = [
            _FakeResult(one_row=SimpleNamespace(total=4, completed=2, generating=1, failed=1)),
            _FakeResult(one_row=SimpleNamespace(total=10, completed=6, failed=2, queued=1, in_progress=1)),
        ]
        client = self._build_client(responses)

        response = client.get("/api/projects/summary")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["projects"]["total"], 4)
        self.assertEqual(body["projects"]["generating"], 1)
        self.assertEqual(body["jobs"]["in_progress"], 1)

    def test_project_list_includes_aggregated_scene_count(self) -> None:
        project = SimpleNamespace(
            id="p1",
            title="Demo",
            story_type="facts",
            status="completed",
            created_at=datetime.now(timezone.utc),
        )
        responses = [_FakeResult(rows=[(project, 7)])]
        client = self._build_client(responses)

        response = client.get("/api/projects/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], "p1")
        self.assertEqual(rows[0]["scene_count"], 7)


if __name__ == "__main__":
    unittest.main()
