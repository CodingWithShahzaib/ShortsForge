from __future__ import annotations

import unittest

from backend.engine.planning import ResolvedGenerationSettings, SceneSpec
from backend.services.image_prompt_runtime import (
    build_image_prompt_audit_metadata,
    compose_image_generation_prompt,
)


class ImagePromptRuntimeTests(unittest.TestCase):
    def test_compose_image_generation_prompt_includes_scene_metadata(self) -> None:
        scene = SceneSpec(
            narration="A pop-up ad appears on the screen.",
            image_prompt="A detective opens a dusty file in a dim archive.",
            scene_settings={
                "scene_role": "reveal",
                "camera_angle": "over-the-shoulder",
                "camera_movement": "slow push in",
                "lighting": "moody tungsten practicals",
                "visual_insert_types": ["dossier", "evidence board"],
                "quality": "cinematic realism",
            },
        )
        settings = ResolvedGenerationSettings(story_type="mystery", story_template="default")

        prompt = compose_image_generation_prompt(scene, settings)

        self.assertIn("reveal beat", prompt)
        self.assertIn("over-the-shoulder", prompt)
        self.assertIn("slow push in", prompt)
        self.assertIn("moody tungsten practicals", prompt)
        self.assertIn("include dossier, evidence board inserts", prompt)
        self.assertIn("pop-up advertisement", prompt)
        self.assertIn("A detective opens a dusty file in a dim archive.", prompt)

    def test_build_image_prompt_audit_metadata_tracks_keyword_hits(self) -> None:
        scene = SceneSpec(
            image_prompt="An investigator studies clues on a wall.",
            scene_settings={
                "scene_role": "clue",
                "story_profile": "mystery",
                "camera_movement": "slow push in",
                "lighting": "moody tungsten practicals",
                "visual_insert_types": ["evidence board"],
            },
        )
        settings = ResolvedGenerationSettings(story_type="mystery", story_template="default")
        final_prompt = (
            "clue beat. slow push in. moody tungsten practicals. "
            "include evidence board inserts. An investigator studies clues on a wall."
        )

        audit = build_image_prompt_audit_metadata(
            scene=scene,
            settings=settings,
            provider="replicate",
            style="realistic",
            final_prompt=final_prompt,
            generation_kwargs={"negative_prompt": "blurry", "seed": 42},
        )

        self.assertEqual(audit["beat_role"], "clue")
        self.assertEqual(audit["story_profile"], "mystery")
        self.assertEqual(audit["provider"], "replicate")
        self.assertEqual(audit["style"], "realistic")
        self.assertTrue(audit["profile_keyword_hits"]["slow push in"])
        self.assertTrue(audit["profile_keyword_hits"]["moody tungsten practicals"])
        self.assertTrue(audit["profile_keyword_hits"]["evidence board"])


if __name__ == "__main__":
    unittest.main()
