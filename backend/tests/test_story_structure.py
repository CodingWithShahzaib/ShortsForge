from __future__ import annotations

import unittest

from backend.services.story_structure import (
    assign_scene_roles,
    build_story_quality_report,
    normalize_story_type_value,
    resolve_story_profile,
)


class StoryStructureTests(unittest.TestCase):
    def test_normalize_story_type_value_resolves_aliases(self) -> None:
        self.assertEqual(normalize_story_type_value("horror"), "scary")
        self.assertEqual(normalize_story_type_value("listicle"), "top_list")
        self.assertEqual(normalize_story_type_value("science"), "science")
        self.assertEqual(normalize_story_type_value("unknown_type"), "general")

    def test_resolve_story_profile_uses_template_hint_for_general(self) -> None:
        profile = resolve_story_profile("general", "countdown_reveal")
        self.assertEqual(profile.id, "listicle")
        self.assertIn("momentum", profile.description.lower())

    def test_assign_scene_roles_spreads_profile_beats_across_scenes(self) -> None:
        profile = resolve_story_profile("scary", "default")
        roles = assign_scene_roles(4, profile)
        self.assertEqual([role["role"] for role in roles], ["hook", "tension_build", "reveal", "cliffhanger"])

    def test_build_story_quality_report_flags_repetition_and_missing_payoff(self) -> None:
        report = build_story_quality_report(
            story_type="scary",
            story_template="default",
            script="Something is wrong. Something is wrong. Something is wrong.",
            scenes=[
                {
                    "narration": "Something is wrong.",
                    "image_prompt": "medium shot dark room",
                    "scene_settings": {"shot_type": "medium"},
                },
                {
                    "narration": "Something is wrong.",
                    "image_prompt": "medium shot dark room",
                    "scene_settings": {"shot_type": "medium"},
                },
                {
                    "narration": "Something is wrong.",
                    "image_prompt": "medium shot dark room",
                    "scene_settings": {"shot_type": "medium"},
                },
            ],
            story_brief={"ending_type": "resolution", "visual_variety": "high"},
        )

        issue_codes = {issue["code"] for issue in report["issues"]}
        self.assertIn("weak_hook", issue_codes)
        self.assertIn("missing_payoff", issue_codes)
        self.assertTrue({"visual_repetition", "low_visual_variety"} & issue_codes)


if __name__ == "__main__":
    unittest.main()
