from __future__ import annotations

import unittest

from backend.core.ffmpeg import (
    map_transition_to_xfade,
    normalize_transition,
    resolve_scene_transition,
)
from backend.services.transition_service import list_transitions


class TransitionMappingTests(unittest.TestCase):
    def test_fade_in_fade_out_aliases_normalize(self) -> None:
        self.assertEqual(normalize_transition("fade_in_out"), "fade_in_fade_out")
        self.assertEqual(normalize_transition("fade in fade out"), "fade_in_fade_out")

    def test_fade_in_fade_out_alternates_by_boundary(self) -> None:
        self.assertEqual(
            map_transition_to_xfade("fade_in_fade_out", boundary_index=0),
            "fadeblack",
        )
        self.assertEqual(
            map_transition_to_xfade("fade_in_fade_out", boundary_index=1),
            "fade",
        )
        self.assertEqual(
            map_transition_to_xfade("fade_in_fade_out", boundary_index=2),
            "fadeblack",
        )

    def test_zoom_in_zoom_out_aliases_normalize(self) -> None:
        self.assertEqual(normalize_transition("zoom_in_out"), "zoom_in_zoom_out")
        self.assertEqual(normalize_transition("zoom in zoom out"), "zoom_in_zoom_out")

    def test_zoom_in_zoom_out_alternates_scene_motion(self) -> None:
        self.assertEqual(
            resolve_scene_transition("zoom_in_zoom_out", scene_index=0),
            "zoom_in",
        )
        self.assertEqual(
            resolve_scene_transition("zoom_in_zoom_out", scene_index=1),
            "zoom_out",
        )
        self.assertEqual(
            resolve_scene_transition("zoom_in_zoom_out", scene_index=2),
            "zoom_in",
        )
        self.assertEqual(
            map_transition_to_xfade("zoom_in_zoom_out", boundary_index=0),
            "fade",
        )

    def test_transition_catalog_contains_custom_transition(self) -> None:
        transitions = list_transitions()
        transition_ids = {item["id"] for item in transitions}
        self.assertIn("fade_in_fade_out", transition_ids)
        self.assertIn("zoom_in_zoom_out", transition_ids)
        transition = next(item for item in transitions if item["id"] == "fade_in_fade_out")
        self.assertEqual(transition["name"], "Fade In / Fade Out")
        zoom_transition = next(item for item in transitions if item["id"] == "zoom_in_zoom_out")
        self.assertEqual(zoom_transition["name"], "Zoom In / Zoom Out")


if __name__ == "__main__":
    unittest.main()
