from __future__ import annotations

import unittest

from backend.api.generation import _build_dialogue_scene_payloads
from backend.core.prompts.dialogue_prompts import build_dialogue_scene_prompt
from backend.schemas import CharacterConfig, DialogueSceneInput, DialogueVideoRequest


class DialogueGenerationTests(unittest.TestCase):
    def test_character_consistency_prompt_building(self) -> None:
        character = CharacterConfig(
            id="a",
            name="Analyst",
            description="sharp-featured analyst in a navy suit with silver hair",
        )
        prompt = build_dialogue_scene_prompt(
            character=character,
            dialogue_line="We need answers before sunrise.",
            shot_type="closeup",
            preset="comic_book",
        )
        self.assertIn("sharp-featured analyst", prompt)
        self.assertIn("closeup shot", prompt)
        self.assertIn("consistent character design", prompt)
        self.assertIn("bold black outlines", prompt)
        self.assertIn("facial expression:", prompt)
        self.assertIn("visual action:", prompt)
        self.assertIn("environment:", prompt)
        self.assertIn("lighting:", prompt)
        self.assertIn("composition:", prompt)
        self.assertIn("highly detailed, story-specific scene", prompt)
        self.assertIn("background is unique, detailed, and context-aware", prompt)

    def test_dialogue_request_accepts_scene_and_character_controls(self) -> None:
        payload = DialogueVideoRequest(
            title="Debate",
            custom_script="Analyst: We need answers.\nReporter: Start with the money trail.",
            characters=[
                CharacterConfig(id="analyst", name="Analyst", description="analyst in a navy suit"),
                CharacterConfig(id="reporter", name="Reporter", description="reporter with red scarf"),
            ],
            dialogue_scenes=[
                DialogueSceneInput(speaker_id="analyst", narration="We need answers."),
                DialogueSceneInput(
                    speaker_id="reporter",
                    narration="Start with the money trail.",
                    is_reaction_shot=True,
                ),
            ],
            reaction_shot_duration=2.25,
            speaker_labels_in_subtitles=True,
        )
        self.assertEqual(payload.generation_mode, "dialogue")
        self.assertEqual(len(payload.characters), 2)
        self.assertEqual(payload.dialogue_scenes[1].shot_type, "medium")
        self.assertTrue(payload.dialogue_scenes[1].is_reaction_shot)
        self.assertEqual(payload.reaction_shot_duration, 2.25)

    def test_additional_dialogue_style_presets_are_supported(self) -> None:
        character = CharacterConfig(
            id="b",
            name="Host",
            description="sharp-eyed host with a tailored black coat",
        )
        prompt = build_dialogue_scene_prompt(
            character=character,
            dialogue_line="This changes everything.",
            shot_type="medium",
            preset="anime",
        )
        self.assertIn("Anime keyframe", prompt)
        self.assertIn("clean cel shading", prompt)
        self.assertIn("make the frame feel alive and in-progress", prompt)
        self.assertIn("show the character doing something visually readable", prompt)

        payload = DialogueVideoRequest(
            title="Anime Debate",
            custom_script="Host: This changes everything.\nGuest: Prove it.",
            characters=[
                character,
                CharacterConfig(id="guest", name="Guest", description="guest in a white blazer"),
            ],
            dialogue_style_preset="anime",
        )
        self.assertEqual(payload.dialogue_style_preset, "anime")

        photoreal_prompt = build_dialogue_scene_prompt(
            character=character,
            dialogue_line="Stay with me on this.",
            shot_type="closeup",
            preset="photorealistic",
        )
        self.assertIn("Photorealistic film still", photoreal_prompt)
        self.assertIn("lifelike skin texture", photoreal_prompt)

        noir_payload = DialogueVideoRequest(
            title="Noir Interview",
            custom_script="Host: We only get one take.\nGuest: Then make it count.",
            characters=[
                character,
                CharacterConfig(id="guest", name="Guest", description="guest in a charcoal trench coat"),
            ],
            dialogue_style_preset="cinematic_noir",
        )
        self.assertEqual(noir_payload.dialogue_style_preset, "cinematic_noir")

    def test_dialogue_scene_payloads_preserve_speaker_labeled_subtitles(self) -> None:
        payload = DialogueVideoRequest(
            title="Debate",
            custom_script="Alex: Have you seen this thread from 50 years ago?\nJordan: Yeah, but why are you looking at something so old?",
            characters=[
                CharacterConfig(id="alex", name="Alex", description="curious researcher"),
                CharacterConfig(id="jordan", name="Jordan", description="skeptical friend"),
            ],
            dialogue_scenes=[
                DialogueSceneInput(
                    speaker_id="alex",
                    narration="Have you seen this thread from 50 years ago?",
                    subtitle="Alex: Have you seen this thread from 50 years ago?",
                ),
                DialogueSceneInput(
                    speaker_id="jordan",
                    narration="Yeah, but why are you looking at something so old?",
                    subtitle="Jordan: Yeah, but why are you looking at something so old?",
                ),
            ],
            speaker_labels_in_subtitles=True,
        )

        scenes = _build_dialogue_scene_payloads(payload)

        self.assertEqual(
            scenes[0]["subtitle"],
            "Alex: Have you seen this thread from 50 years ago?",
        )
        self.assertEqual(
            scenes[1]["subtitle"],
            "Jordan: Yeah, but why are you looking at something so old?",
        )

    def test_dialogue_scene_payloads_use_selected_global_transition(self) -> None:
        payload = DialogueVideoRequest(
            title="Debate",
            custom_script="Alex: We have one shot.\nJordan: Then don't waste it.",
            characters=[
                CharacterConfig(id="alex", name="Alex", description="curious researcher"),
                CharacterConfig(id="jordan", name="Jordan", description="skeptical friend"),
            ],
            transition="dissolve",
        )

        scenes = _build_dialogue_scene_payloads(payload)

        self.assertEqual(scenes[0]["transition"], "dissolve")
        self.assertEqual(scenes[1]["transition"], "dissolve")

    def test_dialogue_scene_payloads_strip_stage_directions_from_custom_script(self) -> None:
        payload = DialogueVideoRequest(
            title="Debate",
            custom_script="Blake: (smirking) Open the red room.\nRiley: [panicking] I said no.",
            characters=[
                CharacterConfig(id="blake", name="Blake", description="confident instigator"),
                CharacterConfig(id="riley", name="Riley", description="anxious skeptic"),
            ],
        )

        scenes = _build_dialogue_scene_payloads(payload)

        self.assertEqual(scenes[0]["narration"], "Open the red room.")
        self.assertEqual(scenes[1]["narration"], "I said no.")

    def test_dialogue_prompts_infer_livelier_scene_direction_from_line(self) -> None:
        character = CharacterConfig(
            id="riley",
            name="Riley",
            description="anxious skeptic in a dark hoodie",
        )

        prompt = build_dialogue_scene_prompt(
            character=character,
            dialogue_line="Why are you opening that door right now?",
            shot_type="reaction",
            preset="cinematic",
        )

        self.assertIn("skeptical curiosity", prompt)
        self.assertIn("vivid reaction beat", prompt)
        self.assertIn("layered environment storytelling", prompt)
        self.assertIn("visual action: challenging someone, questioning the moment, or demanding clarity", prompt)
        self.assertTrue(
            any(
                fragment in prompt
                for fragment in (
                    "use a richly dressed environment",
                    "include atmospheric motion cues",
                    "build three clear depth planes",
                    "avoid plain walls, blank backdrops, static studio framing",
                )
            )
        )
        self.assertIn("lighting:", prompt)
        self.assertIn("composition:", prompt)


if __name__ == "__main__":
    unittest.main()
