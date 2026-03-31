from __future__ import annotations

import unittest

from backend.services.script_service import enforce_scene_pacing, resolve_scene_pacing_bounds


class SceneNarrationPacingTests(unittest.TestCase):
    def test_long_style_expands_default_pacing_window(self) -> None:
        short_bounds = resolve_scene_pacing_bounds("short", min_duration=2, max_duration=4)
        balanced_bounds = resolve_scene_pacing_bounds("balanced", min_duration=2, max_duration=4)
        long_bounds = resolve_scene_pacing_bounds("long", min_duration=2, max_duration=4)

        self.assertEqual(short_bounds, (2, 4))
        self.assertEqual(balanced_bounds, (3, 6))
        self.assertEqual(long_bounds, (4, 10))

    def test_long_style_prevents_medium_narration_from_being_over_split(self) -> None:
        narration = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty."
        scene = {"narration": narration, "subtitle": narration, "script": narration}

        short_min, short_max = resolve_scene_pacing_bounds("short", min_duration=2, max_duration=4)
        long_min, long_max = resolve_scene_pacing_bounds("long", min_duration=2, max_duration=4)

        short_result = enforce_scene_pacing([dict(scene)], min_duration=short_min, max_duration=short_max)
        long_result = enforce_scene_pacing([dict(scene)], min_duration=long_min, max_duration=long_max)

        self.assertGreater(len(short_result), 1)
        self.assertEqual(len(long_result), 1)
        self.assertEqual(long_result[0]["narration"], narration)


if __name__ == "__main__":
    unittest.main()
