from __future__ import annotations

import unittest

from backend.services.subtitle_service import generate_ass_subtitles


class SubtitleServiceTests(unittest.TestCase):
    def test_word_level_subtitles_hold_through_pause_within_group(self) -> None:
        ass = generate_ass_subtitles(
            words=[
                {"word": "Hello", "start": 0.0, "end": 0.3},
                {"word": "world", "start": 1.0, "end": 1.4},
            ],
            words_per_group=2,
        )

        self.assertIn(
            "Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\rHighlight}Hello{\\rDefault} world",
            ass,
        )

    def test_last_word_holds_until_next_group_starts(self) -> None:
        ass = generate_ass_subtitles(
            words=[
                {"word": "One", "start": 0.0, "end": 0.2},
                {"word": "two", "start": 0.4, "end": 0.8},
                {"word": "Three", "start": 1.5, "end": 1.8},
                {"word": "four", "start": 2.0, "end": 2.3},
            ],
            words_per_group=2,
        )

        self.assertIn(
            "Dialogue: 0,0:00:00.40,0:00:01.50,Default,,0,0,0,,One {\\rHighlight}two{\\rDefault}",
            ass,
        )


if __name__ == "__main__":
    unittest.main()
