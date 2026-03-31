from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.generation_plan import (
    ResolvedGenerationSettings,
    SceneSpec,
    build_render_plan,
    build_timeline_plan,
)


class GenerationPlanTests(unittest.TestCase):
    def test_resolved_settings_merge_partial_mapping_with_app_defaults(self) -> None:
        app = SimpleNamespace(
            default_llm_provider="groq",
            default_llm_model="llama",
            default_image_provider="fal",
            default_image_style="cinematic",
            default_tts_provider="elevenlabs",
            default_tts_voice="voice-a",
            default_resolution="720x1280",
            default_transition="dissolve",
            default_scene_count=7,
            default_word_count=500,
            default_scene_narration_style="long",
            default_inter_scene_pause_ms=700,
            default_transition_overlap_ms=300,
            default_use_production_storyboard=False,
            default_match_scenes_to_audio=False,
            default_visual_continuity="rainy neon",
        )
        resolved = ResolvedGenerationSettings.from_mapping(
            {"story_type": "science", "subtitle_words_per_group": 9},
            app,
        )
        self.assertEqual(resolved.story_type, "science")
        self.assertEqual(resolved.llm_provider, "groq")
        self.assertEqual(resolved.image_provider, "fal")
        self.assertEqual(resolved.tts_provider, "elevenlabs")
        self.assertEqual(resolved.resolution, "720x1280")
        self.assertEqual(resolved.transition, "dissolve")
        self.assertEqual(resolved.scene_count, 7)
        self.assertEqual(resolved.word_count, 500)
        self.assertEqual(resolved.scene_narration_style, "long")
        self.assertEqual(resolved.inter_scene_pause_ms, 700)
        self.assertEqual(resolved.transition_overlap_ms, 300)
        self.assertFalse(resolved.use_production_storyboard)
        self.assertFalse(resolved.match_scenes_to_audio)
        self.assertEqual(resolved.visual_continuity, "rainy neon")
        self.assertEqual(resolved.subtitle_words_per_group, 9)

    def test_timeline_plan_includes_paced_durations_overlaps_and_starts(self) -> None:
        plan = build_timeline_plan(
            [2.5, 2.5, 2.5],
            ["fade", "none"],
            inter_scene_pause_ms=600,
            transition_overlap_ms=250,
        )
        self.assertEqual(plan.paced_durations, [3.1, 3.1, 2.5])
        self.assertAlmostEqual(plan.boundary_overlaps[0], 0.25, places=3)
        self.assertEqual(plan.boundary_overlaps[1], 0.0)
        self.assertEqual(len(plan.scene_starts), 3)
        self.assertAlmostEqual(plan.scene_starts[0], 0.0, places=3)
        self.assertAlmostEqual(plan.scene_starts[1], 2.85, places=3)
        self.assertAlmostEqual(plan.scene_starts[2], 5.95, places=3)

    def test_scene_spec_normalizes_mapping(self) -> None:
        scene = SceneSpec.from_mapping(
            {
                "narration": "Hello",
                "image_prompt": "Frame",
                "transition_type": "dissolve",
                "scene_settings": {"seed": 123},
                "trim_start_sec": 0.5,
            },
            default_transition="fade",
        )
        self.assertEqual(scene.narration, "Hello")
        self.assertEqual(scene.subtitle, "Hello")
        self.assertEqual(scene.transition, "dissolve")
        self.assertEqual(scene.transition_type, "dissolve")
        self.assertEqual(scene.scene_settings["seed"], 123)
        self.assertAlmostEqual(scene.trim_start_sec, 0.5, places=3)

    def test_render_plan_uses_scene_specs(self) -> None:
        app = SimpleNamespace(
            default_llm_provider="openai",
            default_llm_model="gpt-4o-mini",
            default_image_provider="replicate",
            default_image_style="realistic",
            default_tts_provider="edge",
            default_tts_voice="voice-a",
            default_resolution="1080x1920",
            default_transition="fade",
            default_scene_count=5,
            default_word_count=400,
            default_scene_narration_style="balanced",
            default_inter_scene_pause_ms=600,
            default_transition_overlap_ms=250,
            default_use_production_storyboard=True,
            default_match_scenes_to_audio=True,
            default_visual_continuity="",
        )
        settings = ResolvedGenerationSettings.from_mapping({}, app)
        render_plan = build_render_plan(
            settings,
            [
                SceneSpec(narration="A", duration=3.0, transition="fade"),
                SceneSpec(narration="B", duration=4.0, transition="none"),
            ],
        )
        self.assertEqual(len(render_plan.scenes), 2)
        self.assertEqual(render_plan.timeline.paced_durations[0], 3.6)
        self.assertGreaterEqual(render_plan.timeline.scene_starts[1], 0.0)


if __name__ == "__main__":
    unittest.main()
