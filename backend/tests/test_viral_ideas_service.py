from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.providers.llm.openai_provider import (
    OpenAILLMProvider,
    _supports_temperature as openai_supports_temperature,
)
from backend.services.ai_client import chat_completion as ai_chat_completion
from backend.services.viral_ideas_service import fetch_viral_ideas, normalize_viral_idea_settings


class OpenAIProviderValidationTests(unittest.TestCase):
    def test_openai_provider_requires_api_key(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            OpenAILLMProvider(api_key="")
        self.assertIn("OPENAI_API_KEY", str(ctx.exception))

    def test_openai_provider_temperature_guard_excludes_search_preview_models(self) -> None:
        self.assertFalse(openai_supports_temperature("gpt-4o-mini-search-preview"))


class AIClientTemperatureGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_preview_model_does_not_forward_temperature(self) -> None:
        provider = AsyncMock()
        provider.chat_completion.return_value = "ok"
        settings = SimpleNamespace(default_llm_provider="openai", default_llm_model="gpt-4o-mini-search-preview")

        with (
            patch("backend.services.ai_client.get_settings", return_value=settings),
            patch("backend.services.ai_client.get_llm_provider", return_value=provider),
        ):
            result = await ai_chat_completion(
                [{"role": "user", "content": "hello"}],
                provider="openai",
                model="gpt-4o-mini-search-preview",
                temperature=0.2,
            )

        self.assertEqual(result, "ok")
        provider.chat_completion.assert_awaited_once()
        self.assertNotIn("temperature", provider.chat_completion.await_args.kwargs)


class ViralIdeasServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize_viral_idea_settings_accepts_new_dialogue_presets(self) -> None:
        normalized = normalize_viral_idea_settings(
            {
                "generation_mode": "dialogue",
                "dialogue_style_preset": "photorealistic",
                "resolution": "1080x1920",
                "transition": "fade",
            },
            resolution_ids=["1080x1920"],
            transition_ids=["fade"],
        )
        self.assertEqual(normalized["dialogue_style_preset"], "photorealistic")

    def test_normalize_viral_idea_settings_maps_alias_story_types_and_preserves_story_brief(self) -> None:
        normalized = normalize_viral_idea_settings(
            {
                "story_type": "horror",
                "story_brief": {
                    "hook_type": "visual",
                    "ending_type": "cliffhanger",
                },
            },
            resolution_ids=["1080x1920"],
            transition_ids=["fade"],
        )
        self.assertEqual(normalized["story_type"], "scary")
        self.assertEqual(normalized["story_brief"]["ending_type"], "cliffhanger")

    def test_normalize_viral_idea_settings_strips_stage_directions_from_starter_script(self) -> None:
        normalized = normalize_viral_idea_settings(
            {
                "generation_mode": "dialogue",
                "starter_script": "Blake: (smirking) Open the door.\nRiley: [whispering] Absolutely not.",
            },
            resolution_ids=["1080x1920"],
            transition_ids=["fade"],
        )
        self.assertEqual(
            normalized["starter_script"],
            "Blake: Open the door.\nRiley: Absolutely not.",
        )

    async def test_openai_viral_ideas_uses_search_research_then_json_generation(self) -> None:
        settings = SimpleNamespace(
            default_llm_provider="openai",
            default_llm_model="gpt-4o-mini-search-preview",
        )
        model_json = json.dumps(
            {
                "ideas": [
                    {
                        "title": "Solar Storm Buzz",
                        "hook": "Why everyone is watching the sky tonight.",
                        "angle": "Timely science news plus visual curiosity drives shares.",
                        "suggested_concept": "Explain the solar storm, what viewers might see, and why it matters.",
                        "settings": {"story_type": "general", "resolution": "1080x1920", "transition": "fade"},
                    },
                    {
                        "title": "AI Gadget Hype",
                        "hook": "The tiny device everyone is arguing about.",
                        "angle": "Consumer tech debates create comments and duets.",
                        "suggested_concept": "Summarize the product buzz, claims, and what users should watch for.",
                        "settings": {"story_type": "general", "resolution": "1080x1920", "transition": "fade"},
                    },
                    {
                        "title": "Playoff Twist",
                        "hook": "The stat that flipped the whole series.",
                        "angle": "Sports momentum and surprise stats are easy to package.",
                        "suggested_concept": "Break down the turning point and why fans are reacting strongly.",
                        "settings": {"story_type": "general", "resolution": "1080x1920", "transition": "fade"},
                    },
                ]
            }
        )
        chat_mock = AsyncMock(side_effect=["1. Trend brief with URLs", model_json])

        with (
            patch("backend.services.viral_ideas_service.get_settings", return_value=settings),
            patch("backend.services.viral_ideas_service.chat_completion", chat_mock),
        ):
            ideas = await fetch_viral_ideas(
                niche="science and tech",
                count=3,
                llm_provider="openai",
                llm_model=None,
                resolution_ids=["1080x1920"],
                transition_ids=["fade"],
            )

        self.assertEqual(len(ideas), 3)
        self.assertEqual(chat_mock.await_count, 2)

        research_call = chat_mock.await_args_list[0]
        self.assertEqual(research_call.args[1], "openai")
        self.assertEqual(research_call.args[2], "gpt-4o-mini-search-preview")
        self.assertTrue(research_call.kwargs["web_search"])

        generation_call = chat_mock.await_args_list[1]
        self.assertEqual(generation_call.args[1], "openai")
        self.assertEqual(generation_call.args[2], "gpt-4o-mini")
        self.assertNotIn("web_search", generation_call.kwargs)

    async def test_non_openai_viral_ideas_stays_single_step(self) -> None:
        settings = SimpleNamespace(
            default_llm_provider="groq",
            default_llm_model="llama-3.1-8b-instant",
        )
        model_json = json.dumps(
            {
                "ideas": [
                    {"title": "Idea 1", "hook": "Hook 1", "angle": "Angle 1", "suggested_concept": "Concept 1"},
                    {"title": "Idea 2", "hook": "Hook 2", "angle": "Angle 2", "suggested_concept": "Concept 2"},
                    {"title": "Idea 3", "hook": "Hook 3", "angle": "Angle 3", "suggested_concept": "Concept 3"},
                ]
            }
        )
        chat_mock = AsyncMock(return_value=model_json)

        with (
            patch("backend.services.viral_ideas_service.get_settings", return_value=settings),
            patch("backend.services.viral_ideas_service.chat_completion", chat_mock),
        ):
            ideas = await fetch_viral_ideas(
                niche=None,
                count=3,
                llm_provider="groq",
                llm_model=None,
                resolution_ids=["1080x1920"],
                transition_ids=["fade"],
            )

        self.assertEqual(len(ideas), 3)
        self.assertEqual(chat_mock.await_count, 1)
        self.assertEqual(chat_mock.await_args.args[1], "groq")

    async def test_viral_ideas_includes_requested_filters_in_prompt(self) -> None:
        settings = SimpleNamespace(
            default_llm_provider="groq",
            default_llm_model="llama-3.1-8b-instant",
        )
        model_json = json.dumps(
            {
                "ideas": [
                    {"title": "Idea 1", "hook": "Hook 1", "angle": "Angle 1", "suggested_concept": "Concept 1"},
                    {"title": "Idea 2", "hook": "Hook 2", "angle": "Angle 2", "suggested_concept": "Concept 2"},
                    {"title": "Idea 3", "hook": "Hook 3", "angle": "Angle 3", "suggested_concept": "Concept 3"},
                ]
            }
        )
        chat_mock = AsyncMock(return_value=model_json)

        with (
            patch("backend.services.viral_ideas_service.get_settings", return_value=settings),
            patch("backend.services.viral_ideas_service.chat_completion", chat_mock),
        ):
            await fetch_viral_ideas(
                niche="history",
                count=3,
                llm_provider="groq",
                llm_model=None,
                idea_type="dialogue",
                tone="dramatic",
                hook_style="question",
                virality_angle="curiosity_gap",
                duration_target_seconds=45,
                character_mode="required",
                cast_size=3,
                avoid_topics="politics, celebrity gossip",
                resolution_ids=["1080x1920"],
                transition_ids=["fade"],
            )

        system_prompt = chat_mock.await_args.args[0][0]["content"]
        user_prompt = chat_mock.await_args.args[0][1]["content"]
        self.assertIn("Return only dialogue-first concepts with recurring characters.", system_prompt)
        self.assertIn("Preferred tone: dramatic.", system_prompt)
        self.assertIn("Preferred hook style: question.", system_prompt)
        self.assertIn("Preferred virality angle: curiosity gap.", system_prompt)
        self.assertIn("about 45 seconds", system_prompt)
        self.assertIn("exactly 3 starter characters", system_prompt)
        self.assertIn("STRICT MINIMUM of 30 alternating lines", system_prompt)
        self.assertIn("Never include parenthetical acting cues", system_prompt)
        self.assertIn("Avoid these topics or angles entirely: politics, celebrity gossip.", system_prompt)
        self.assertIn("Requested configuration:", user_prompt)

    async def test_dialogue_ideas_normalize_request_fields_before_count_selection(self) -> None:
        settings = SimpleNamespace(
            default_llm_provider="groq",
            default_llm_model="llama-3.1-8b-instant",
        )
        model_json = json.dumps(
            {
                "ideas": [
                    {"title": "Idea 1", "hook": "Hook 1", "angle": "Angle 1", "suggested_concept": "Concept 1"},
                    {"title": "Idea 2", "hook": "Hook 2", "angle": "Angle 2", "suggested_concept": "Concept 2"},
                    {"title": "Idea 3", "hook": "Hook 3", "angle": "Angle 3", "suggested_concept": "Concept 3"},
                ]
            }
        )
        chat_mock = AsyncMock(return_value=model_json)

        with (
            patch("backend.services.viral_ideas_service.get_settings", return_value=settings),
            patch("backend.services.viral_ideas_service.chat_completion", chat_mock),
        ):
            ideas = await fetch_viral_ideas(
                niche="history",
                count=3,
                llm_provider="groq",
                llm_model=None,
                idea_type="dialogue",
                character_mode="required",
                resolution_ids=["1080x1920"],
                transition_ids=["fade"],
            )

        self.assertEqual(len(ideas), 3)
        system_prompt = chat_mock.await_args.args[0][0]["content"]
        self.assertIn("Return exactly 3 ideas", system_prompt)


if __name__ == "__main__":
    unittest.main()
