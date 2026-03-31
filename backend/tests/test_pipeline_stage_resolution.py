from __future__ import annotations

import unittest

from backend.api.generation import _resolve_pipeline_intent
from backend.core.job_registry import _resolve_pipeline_request
from backend.schemas.generation import GenerateVideoRequest


class PipelineStageResolutionTests(unittest.TestCase):
    def test_manual_defaults_to_storyboard_stage(self) -> None:
        mode, stage = _resolve_pipeline_intent(GenerateVideoRequest())
        self.assertEqual(mode, "manual")
        self.assertEqual(stage, "storyboard")

    def test_auto_mode_forces_compile_stage(self) -> None:
        req = GenerateVideoRequest(pipeline_mode="auto", target_stage="storyboard")
        mode, stage = _resolve_pipeline_intent(req)
        self.assertEqual(mode, "auto")
        self.assertEqual(stage, "compile")

    def test_legacy_storyboard_only_maps_to_storyboard_stage(self) -> None:
        req = GenerateVideoRequest(storyboard_only=True, pipeline_mode="manual")
        mode, stage = _resolve_pipeline_intent(req)
        self.assertEqual(mode, "manual")
        self.assertEqual(stage, "storyboard")

    def test_legacy_prepare_only_maps_to_assets_stage(self) -> None:
        req = GenerateVideoRequest(prepare_only=True, pipeline_mode="manual")
        mode, stage = _resolve_pipeline_intent(req)
        self.assertEqual(mode, "manual")
        self.assertEqual(stage, "assets")

    def test_job_registry_stage_resolution_defaults_to_storyboard(self) -> None:
        mode, stage = _resolve_pipeline_request({}, {})
        self.assertEqual(mode, "manual")
        self.assertEqual(stage, "storyboard")

    def test_job_registry_auto_mode_maps_to_compile(self) -> None:
        mode, stage = _resolve_pipeline_request({"pipeline_mode": "auto"}, {})
        self.assertEqual(mode, "auto")
        self.assertEqual(stage, "compile")

    def test_job_registry_legacy_flags_map_to_stages(self) -> None:
        self.assertEqual(_resolve_pipeline_request({"storyboard_only": True}, {})[1], "storyboard")
        self.assertEqual(_resolve_pipeline_request({"prepare_only": True}, {})[1], "assets")


if __name__ == "__main__":
    unittest.main()
