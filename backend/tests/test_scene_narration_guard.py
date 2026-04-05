from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from backend.services.script_service import (
    _coerce_dynamic_scene_count,
    _derive_narration_chunks,
    _ensure_scene_count_exact,
    analyze_narration_quality,
    analyze_hook_quality,
    apply_ai_scene_bridges,
    clean_tts_text,
    normalize_scene_narration,
    repair_storyboard_scene_narration,
)


class SceneNarrationGuardTests(unittest.TestCase):
    def test_fills_missing_narration_from_script_chunks(self) -> None:
        scenes = [
            {"narration": "", "subtitle": "", "image_prompt": "a"},
            {"narration": "Kept line.", "image_prompt": "b"},
            {"narration": "   ", "subtitle": "", "image_prompt": "c"},
        ]
        out = normalize_scene_narration(
            scenes,
            script="First sentence. Second sentence. Third sentence.",
        )
        self.assertEqual(len(out), 3)
        self.assertTrue(out[0]["narration"].strip())
        self.assertEqual(out[1]["narration"], "Kept line.")
        self.assertTrue(out[2]["narration"].strip())
        self.assertEqual(out[0]["subtitle"], out[0]["narration"])
        self.assertEqual(out[2]["subtitle"], out[2]["narration"])

    def test_uses_subtitle_or_script_when_narration_missing(self) -> None:
        scenes = [
            {"narration": "", "subtitle": "Subtitle fallback"},
            {"narration": "", "script": "Script fallback"},
        ]
        out = normalize_scene_narration(scenes, script="")
        self.assertEqual(out[0]["narration"], "Subtitle fallback")
        self.assertEqual(out[1]["narration"], "Script fallback")

    def test_script_chunks_stay_in_story_order(self) -> None:
        script = "A1. A2. B1. B2. C1. C2."
        chunks = _derive_narration_chunks(script, 3)
        self.assertEqual(len(chunks), 3)
        self.assertTrue(chunks[0].startswith("A1."))
        self.assertIn("A2.", chunks[0])
        self.assertTrue(chunks[1].startswith("B1."))
        self.assertIn("B2.", chunks[1])
        self.assertTrue(chunks[2].startswith("C1."))
        self.assertIn("C2.", chunks[2])

    def test_scene_count_is_padded_to_requested_size(self) -> None:
        scenes = [{"narration": "One"}, {"narration": "Two"}]
        out = _ensure_scene_count_exact(
            scenes,
            scene_count=4,
            fallback_script="One. Two. Three. Four.",
            image_style="realistic",
        )
        self.assertEqual(len(out), 4)
        self.assertEqual(out[0]["narration"], "One")
        self.assertEqual(out[1]["narration"], "Two")
        self.assertTrue(out[2]["narration"].strip())
        self.assertTrue(out[3]["narration"].strip())

    def test_dynamic_scene_count_keeps_llm_selected_size(self) -> None:
        scenes = [
            {"narration": "One"},
            {"narration": "Two"},
            {"narration": "Three"},
            {"narration": "Four"},
            {"narration": "Five"},
            {"narration": "Six"},
        ]
        out = _coerce_dynamic_scene_count(
            scenes,
            fallback_script="One. Two. Three. Four. Five. Six.",
            image_style="realistic",
            scene_narration_style="balanced",
        )
        self.assertEqual(len(out), 6)

    def test_dynamic_scene_count_uses_fallback_when_too_few_scenes_returned(self) -> None:
        out = _coerce_dynamic_scene_count(
            [{"narration": "Only beat"}],
            fallback_script="First beat. Second beat. Third beat. Fourth beat.",
            image_style="realistic",
            scene_narration_style="balanced",
        )
        self.assertGreaterEqual(len(out), 3)
        self.assertTrue(all((scene.get("narration") or "").strip() for scene in out))

    def test_ai_bridge_line_is_applied_without_hardcoded_terms(self) -> None:
        scenes = [
            {"narration": "Opening beat."},
            {"narration": "Main scene line.", "bridge_line": "That is where the story turns."},
        ]
        out = apply_ai_scene_bridges(scenes)
        self.assertEqual(out[0]["narration"], "Opening beat.")
        self.assertEqual(
            out[1]["narration"],
            "That is where the story turns. Main scene line.",
        )
        self.assertEqual(out[1]["subtitle"], out[1]["narration"])
        self.assertEqual(out[1]["script"], out[1]["narration"])

    def test_clean_tts_text_fixes_spacing_and_sentence_breaks(self) -> None:
        text = "M oves across the board The room grows colder saying LEAVE"
        cleaned = clean_tts_text(text)
        self.assertEqual(
            cleaned,
            'Moves across the board. The room grows colder saying "LEAVE".',
        )

    def test_repair_replaces_recent_duplicate_with_script_aligned_fallback(self) -> None:
        scenes = [
            {"narration": "They place their fingers on the planchette asking is anyone there"},
            {"narration": "They place their fingers on the planchette asking is anyone there"},
        ]
        repaired, issues = repair_storyboard_scene_narration(
            scenes,
            script=(
                "They place their fingers on the planchette asking is anyone there. "
                "A sharp answer slides back across the board."
            ),
        )
        self.assertEqual(
            repaired[0]["narration"],
            "They place their fingers on the planchette asking is anyone there.",
        )
        self.assertEqual(
            repaired[1]["narration"],
            "A sharp answer slides back across the board.",
        )
        self.assertTrue(
            any("replaced repeated narration" in issue for issue in issues),
        )

    def test_repair_only_compares_last_three_scenes(self) -> None:
        repeated = "The first clue lands in silence."
        scenes = [
            {"narration": repeated},
            {"narration": "Scene two changes direction."},
            {"narration": "Scene three adds a witness."},
            {"narration": "Scene four reveals the cost."},
            {"narration": repeated},
        ]
        repaired, issues = repair_storyboard_scene_narration(
            scenes,
            script=(
                "The first clue lands in silence. Scene two changes direction. "
                "Scene three adds a witness. Scene four reveals the cost. "
                "The first clue lands in silence."
            ),
        )
        self.assertEqual(repaired[-1]["narration"], repeated)
        self.assertFalse(any("Scene 5" in issue for issue in issues))

    def test_quality_analysis_uses_story_type_pacing_rules(self) -> None:
        scary_metrics = analyze_narration_quality(
            "The door opens and everyone in the room realizes the air has changed forever.",
            story_type="scary",
        )
        philosophy_metrics = analyze_narration_quality(
            "The door opens and everyone in the room realizes the air has changed forever.",
            story_type="philosophy",
        )
        self.assertLess(scary_metrics["pacing_score"], philosophy_metrics["pacing_score"])


class HookAnalysisTests(unittest.IsolatedAsyncioTestCase):
    async def test_hook_analysis_uses_model_json_response(self) -> None:
        with patch(
            "backend.services.script_service.chat_completion",
            new=AsyncMock(return_value='{"weak": true, "reason": "The opening starts too flat.", "suggestions": ["Open on the reveal.", "Lead with the contradiction.", "Start with the consequence."]}'),
        ):
            result = await analyze_hook_quality(
                script_text="This opening is too flat. The rest explains the issue.",
                concept="Test concept",
                story_type="general",
                llm_provider=None,
                llm_model=None,
            )
        self.assertTrue(result["weak"])
        self.assertEqual(result["reason"], "The opening starts too flat.")
        self.assertEqual(len(result["suggestions"]), 3)

    async def test_hook_analysis_falls_back_cleanly_on_invalid_response(self) -> None:
        with patch(
            "backend.services.script_service.chat_completion",
            new=AsyncMock(return_value="not json at all"),
        ):
            result = await analyze_hook_quality(
                script_text="Opening line.",
                concept="Test concept",
                story_type="general",
                llm_provider=None,
                llm_model=None,
            )
        self.assertFalse(result["weak"])
        self.assertEqual(result["reason"], "")
        self.assertEqual(result["suggestions"], [])


if __name__ == "__main__":
    unittest.main()
