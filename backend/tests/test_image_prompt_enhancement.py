from __future__ import annotations

import unittest

from backend.services.script_service import MIN_IMAGE_PROMPT_WORDS, enhance_image_prompt


class ImagePromptEnhancementTests(unittest.TestCase):
    def test_prompt_uses_frontend_visual_settings(self) -> None:
        prompt = enhance_image_prompt(
            base_prompt="an analyst reviewing risk charts in a modern office",
            narration="The report reveals a sudden liquidity gap.",
            scene_emotion="urgent",
            image_style="cinematic",
            resolution="1920x1080",
            transition="wipeleft",
            visual_continuity="cool steel palette, recurring glass reflections",
            scene_index=1,
            total_scenes=4,
            min_words=MIN_IMAGE_PROMPT_WORDS,
        )
        self.assertIn("Horizontal cinematic frame (16:9)", prompt)
        self.assertIn("cinematic style", prompt.lower())
        self.assertIn("wipeleft", prompt.lower())
        self.assertIn("cool steel palette", prompt.lower())

    def test_prompt_is_at_least_minimum_word_count(self) -> None:
        prompt = enhance_image_prompt(
            base_prompt="family in a living room reacts to breaking news on television",
            narration="Everyone in the room is anxious because they know the outcome affects them personally.",
            scene_emotion="tense",
            image_style="realistic",
            resolution="1080x1920",
            transition="fade",
            visual_continuity="muted palette and practical indoor lighting",
            scene_index=0,
            total_scenes=5,
            min_words=MIN_IMAGE_PROMPT_WORDS,
        )
        self.assertGreaterEqual(len(prompt.split()), MIN_IMAGE_PROMPT_WORDS)

    def test_scene_index_changes_composition_instructions(self) -> None:
        a = enhance_image_prompt(
            base_prompt="city skyline before a storm",
            narration="The mood shifts before the key reveal.",
            scene_emotion="mysterious",
            image_style="cinematic",
            scene_index=0,
            total_scenes=5,
        )
        b = enhance_image_prompt(
            base_prompt="city skyline before a storm",
            narration="The mood shifts before the key reveal.",
            scene_emotion="mysterious",
            image_style="cinematic",
            scene_index=2,
            total_scenes=5,
        )
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()

