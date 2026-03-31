from __future__ import annotations

import re
import unittest

from backend.core.ffmpeg import build_audio_trim_filter
from backend.services.subtitle_service import generate_ass_from_scene_texts
from backend.services.video_service import build_scene_start_times, build_scene_timing_plan


def _ass_to_seconds(ts: str) -> float:
    # ASS timestamp format: H:MM:SS.CC
    h, m, rest = ts.split(":")
    s, cs = rest.split(".")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(cs) / 100.0


class ScenePacingTimingTests(unittest.TestCase):
    def test_pause_zero_keeps_fast_no_extra_padding(self) -> None:
        paced, overlaps = build_scene_timing_plan(
            base_durations=[3.0, 4.0, 5.0],
            transitions_between=["fade", "dissolve"],
            inter_scene_pause_ms=0,
            transition_overlap_ms=250,
        )
        self.assertEqual(paced, [3.0, 4.0, 5.0])
        self.assertEqual(len(overlaps), 2)
        self.assertTrue(all(0.0 <= d <= 0.8 for d in overlaps))

    def test_cinematic_pause_adds_hold_on_non_last_scenes(self) -> None:
        paced, _ = build_scene_timing_plan(
            base_durations=[2.5, 2.5, 2.5],
            transitions_between=["fade", "fade"],
            inter_scene_pause_ms=600,
            transition_overlap_ms=250,
        )
        self.assertEqual(paced, [3.1, 3.1, 2.5])

    def test_overlap_clamps_for_short_scenes(self) -> None:
        paced, overlaps = build_scene_timing_plan(
            base_durations=[0.5, 0.6],
            transitions_between=["fade"],
            inter_scene_pause_ms=0,
            transition_overlap_ms=800,
        )
        # 35% safety cap on the shortest side (0.5s -> 0.175s)
        self.assertEqual(paced, [0.5, 0.6])
        self.assertAlmostEqual(overlaps[0], 0.175, places=3)

    def test_none_transition_disables_intentional_overlap(self) -> None:
        _, overlaps = build_scene_timing_plan(
            base_durations=[3.0, 3.0],
            transitions_between=["none"],
            inter_scene_pause_ms=600,
            transition_overlap_ms=250,
        )
        self.assertEqual(overlaps, [0.0])

    def test_scene_start_times_account_for_overlap(self) -> None:
        starts = build_scene_start_times([3.1, 3.1, 2.5], [0.25, 0.25])
        self.assertEqual(len(starts), 3)
        self.assertAlmostEqual(starts[0], 0.0, places=3)
        self.assertAlmostEqual(starts[1], 2.85, places=3)
        self.assertAlmostEqual(starts[2], 5.70, places=3)

    def test_subtitle_timestamps_remain_continuous_with_pause(self) -> None:
        scenes = [
            {"narration": "A", "duration": 3.1},
            {"narration": "B", "duration": 3.1},
            {"narration": "C", "duration": 2.5},
        ]
        ass = generate_ass_from_scene_texts(scenes)
        starts_ends = re.findall(r"Dialogue: 0,([^,]+),([^,]+),", ass)
        self.assertEqual(len(starts_ends), 3)
        previous_end = 0.0
        for start, end in starts_ends:
            start_s = _ass_to_seconds(start)
            end_s = _ass_to_seconds(end)
            self.assertGreaterEqual(start_s + 1e-6, previous_end)
            self.assertGreater(end_s, start_s)
            previous_end = end_s
        # ASS timestamps are centisecond precision; 8.7 can serialize as 8.69.
        self.assertAlmostEqual(previous_end, 8.7, places=1)

    def test_ai_scene_captions_chunk_with_words_per_group(self) -> None:
        scenes = [
            {"narration": "one two three four five six", "duration": 6.0},
        ]
        ass = generate_ass_from_scene_texts(scenes, words_per_group=2)
        starts_ends = re.findall(r"Dialogue: 0,([^,]+),([^,]+),", ass)
        self.assertEqual(len(starts_ends), 3)
        previous_end = 0.0
        for start, end in starts_ends:
            start_s = _ass_to_seconds(start)
            end_s = _ass_to_seconds(end)
            self.assertGreaterEqual(start_s + 1e-6, previous_end)
            self.assertGreater(end_s, start_s)
            previous_end = end_s
        self.assertAlmostEqual(previous_end, 6.0, places=1)

    def test_ai_scene_captions_can_use_overlap_aware_starts(self) -> None:
        scenes = [
            {"narration": "one two", "duration": 3.1},
            {"narration": "three four", "duration": 3.1},
        ]
        ass = generate_ass_from_scene_texts(
            scenes,
            words_per_group=2,
            scene_starts=[0.0, 2.85],
        )
        starts_ends = re.findall(r"Dialogue: 0,([^,]+),([^,]+),", ass)
        self.assertEqual(len(starts_ends), 2)
        self.assertAlmostEqual(_ass_to_seconds(starts_ends[0][0]), 0.0, places=2)
        self.assertAlmostEqual(_ass_to_seconds(starts_ends[1][0]), 2.85, places=2)

    def test_audio_trim_filter_respects_start_offset(self) -> None:
        af = build_audio_trim_filter(4.0, 1.25)
        self.assertIn("atrim=1.250000:5.250000", af)
        self.assertIn("asetpts=PTS-STARTPTS", af)
        self.assertIn("apad=whole_dur=4.000000", af)


if __name__ == "__main__":
    unittest.main()
