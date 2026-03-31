from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from backend.engine.context import EngineContext
from backend.engine.stages.compile_stage import CompileStage
from backend.services.generation_plan import ResolvedGenerationSettings, SceneSpec


class CompileStageTests(unittest.IsolatedAsyncioTestCase):
    async def test_compile_stage_runs_pipeline_and_updates_context(self) -> None:
        session = AsyncMock()
        db_result = Mock()
        db_result.scalars.return_value.all.return_value = []
        session.execute.return_value = db_result

        render_plan = SimpleNamespace(
            scenes=[SceneSpec(narration="Hello", image_prompt="Frame", duration=4.0)],
            timeline=SimpleNamespace(
                paced_durations=[4.0],
                boundary_overlaps=[],
                scene_starts=[0.0],
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            context = EngineContext(
                project_id="project-1",
                job_id="job-1",
                session=session,
                settings=ResolvedGenerationSettings(),
                scenes=[SceneSpec(narration="Hello", image_prompt="Frame")],
                pipeline_mode="manual",
                target_stage="compile",
                work_dir=Path(tmp) / "project-1",
                local_output_dir=Path(tmp) / "project-1" / "output",
            )
            stage = CompileStage()

            with patch(
                "backend.engine.stages.compile_stage._render_scene_audio",
                AsyncMock(return_value=("audio.mp3", 4.0)),
            ) as audio_mock, patch(
                "backend.engine.stages.compile_stage.build_render_plan",
                return_value=render_plan,
            ) as plan_mock, patch(
                "backend.engine.stages.compile_stage._render_scene_visual",
                AsyncMock(return_value="clip.mp4"),
            ) as visual_mock, patch(
                "backend.engine.stages.compile_stage.ffmpeg.pad_or_trim_audio",
                AsyncMock(),
            ) as trim_mock, patch(
                "backend.engine.stages.compile_stage._concat_and_merge_render_media",
                AsyncMock(return_value="merged.mp4"),
            ) as concat_mock, patch(
                "backend.engine.stages.compile_stage._apply_render_subtitles",
                AsyncMock(return_value="subtitled.mp4"),
            ) as subtitles_mock, patch(
                "backend.engine.stages.compile_stage._apply_optional_overlay",
                AsyncMock(return_value="overlaid.mp4"),
            ) as overlay_mock, patch(
                "backend.engine.stages.compile_stage._apply_optional_background_music",
                AsyncMock(return_value="music.mp4"),
            ) as music_mock, patch(
                "backend.engine.stages.compile_stage._save_final_render",
                AsyncMock(return_value=("videos/out.mp4", "https://example.com/out.mp4", 4.2)),
            ) as save_mock, patch(
                "backend.engine.stages.compile_stage.get_storage",
                return_value=object(),
            ):
                result = await stage.run(context)

        self.assertEqual(result.video_path, "videos/out.mp4")
        self.assertEqual(result.video_url, "https://example.com/out.mp4")
        self.assertAlmostEqual(result.duration or 0.0, 4.2, places=2)
        self.assertEqual(len(context.audio_paths), 1)
        self.assertTrue(context.audio_paths[0].endswith("audio_norm_000.mp3"))
        self.assertEqual(context.visual_paths, ["clip.mp4"])
        self.assertIs(context.render_plan, render_plan)
        audio_mock.assert_awaited_once()
        plan_mock.assert_called_once()
        visual_mock.assert_awaited_once()
        trim_mock.assert_awaited_once()
        concat_mock.assert_awaited_once()
        subtitles_mock.assert_awaited_once()
        overlay_mock.assert_awaited_once()
        music_mock.assert_awaited_once()
        save_mock.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
