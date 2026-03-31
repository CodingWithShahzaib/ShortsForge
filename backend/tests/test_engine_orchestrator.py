from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from backend.engine import EngineRequest, EngineResult, ShortsForgeEngine
from backend.engine.context import EngineContext
from backend.services.generation_plan import ResolvedGenerationSettings, SceneSpec


class EngineOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_engine_run_uses_assets_stage_for_assets_target(self) -> None:
        assets_stage = AsyncMock()
        assets_stage.run.return_value = EngineResult(
            prepared=True,
            project_id="project-1",
            scenes=1,
        )
        compile_stage = AsyncMock()
        storyboard_stage = AsyncMock()
        request = EngineRequest(
            project_id="project-1",
            job_id="job-1",
            settings=ResolvedGenerationSettings(),
            scenes=[SceneSpec(narration="Hello world")],
            target_stage="assets",
        )
        storyboard_stage.run.return_value = EngineContext(
            project_id=request.project_id,
            job_id=request.job_id,
            session=object(),
            settings=request.settings,
            scenes=request.scenes or [],
            pipeline_mode=request.pipeline_mode,
            target_stage=request.target_stage,
        )
        engine = ShortsForgeEngine(
            storyboard_stage=storyboard_stage,
            assets_stage=assets_stage,
            compile_stage=compile_stage,
        )

        result = await engine.run(request, session=object())

        self.assertIsInstance(result, EngineResult)
        self.assertTrue(result.prepared)
        self.assertEqual(result.project_id, "project-1")
        self.assertEqual(result.scenes, 1)
        assets_stage.run.assert_awaited_once()
        compile_stage.run.assert_not_awaited()

    async def test_engine_run_can_return_storyboard_only_without_renderer(self) -> None:
        assets_stage = AsyncMock()
        compile_stage = AsyncMock()
        request = EngineRequest(
            project_id="project-1",
            job_id="job-1",
            settings=ResolvedGenerationSettings(),
            scenes=[SceneSpec(narration="Hello world")],
            target_stage="storyboard",
        )
        storyboard_stage = AsyncMock()
        storyboard_stage.run.return_value = EngineContext(
            project_id=request.project_id,
            job_id=request.job_id,
            session=object(),
            settings=request.settings,
            scenes=request.scenes or [],
            pipeline_mode=request.pipeline_mode,
            target_stage=request.target_stage,
            project_version=3,
        )
        engine = ShortsForgeEngine(
            storyboard_stage=storyboard_stage,
            assets_stage=assets_stage,
            compile_stage=compile_stage,
        )

        result = await engine.run(request, session=object())

        self.assertTrue(result.prepared)
        self.assertTrue(result.storyboard_only)
        self.assertEqual(result.scenes, 1)
        self.assertEqual(result.project_version, 3)
        assets_stage.run.assert_not_awaited()
        compile_stage.run.assert_not_awaited()

    async def test_engine_run_uses_compile_stage_for_compile_target(self) -> None:
        storyboard_stage = AsyncMock()
        assets_stage = AsyncMock()
        compile_stage = AsyncMock()
        compile_stage.run.return_value = EngineResult(
            prepared=False,
            project_id="project-1",
            scenes=2,
            video_path="videos/out.mp4",
        )
        request = EngineRequest(
            project_id="project-1",
            job_id="job-1",
            settings=ResolvedGenerationSettings(),
            scenes=[SceneSpec(narration="One"), SceneSpec(narration="Two")],
            target_stage="compile",
        )
        storyboard_stage.run.return_value = EngineContext(
            project_id=request.project_id,
            job_id=request.job_id,
            session=object(),
            settings=request.settings,
            scenes=request.scenes or [],
            pipeline_mode=request.pipeline_mode,
            target_stage=request.target_stage,
        )
        engine = ShortsForgeEngine(
            storyboard_stage=storyboard_stage,
            assets_stage=assets_stage,
            compile_stage=compile_stage,
        )

        result = await engine.run(request, session=object())

        self.assertEqual(result.video_path, "videos/out.mp4")
        assets_stage.run.assert_not_awaited()
        compile_stage.run.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
