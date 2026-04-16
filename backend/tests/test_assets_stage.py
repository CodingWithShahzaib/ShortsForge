from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from backend.engine.context import EngineContext
from backend.engine.stages.assets_stage import AssetsStage
from backend.services.generation_plan import ResolvedGenerationSettings, SceneSpec


class AssetsStageTests(unittest.IsolatedAsyncioTestCase):
    async def test_assets_stage_prepares_scene_assets(self) -> None:
        session = AsyncMock()
        db_result = Mock()
        db_result.scalars.return_value.all.return_value = []
        session.execute.return_value = db_result

        with tempfile.TemporaryDirectory() as tmp:
            context = EngineContext(
                project_id="project-1",
                job_id="job-1",
                session=session,
                settings=ResolvedGenerationSettings(),
                scenes=[SceneSpec(narration="Hello", image_prompt="Frame")],
                pipeline_mode="manual",
                target_stage="assets",
                work_dir=Path(tmp) / "project-1",
                local_output_dir=Path(tmp) / "project-1" / "output",
            )
            stage = AssetsStage()

            with patch(
                "backend.engine.stages.assets_stage._prepare_scene_assets",
                AsyncMock(return_value=("audio.mp3", 4.0)),
            ) as prepare_mock:

                result = await stage.run(context)

        self.assertTrue(result.prepared)
        self.assertEqual(result.project_id, "project-1")
        self.assertEqual(result.scenes, 1)
        self.assertEqual(context.audio_paths, ["audio.mp3"])
        self.assertEqual(context.durations, [4.0])
        self.assertEqual(context.visual_paths, [""])
        prepare_mock.assert_awaited_once()
        self.assertIn("consistency_manager", prepare_mock.await_args.kwargs)



if __name__ == "__main__":
    unittest.main()
