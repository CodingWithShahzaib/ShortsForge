from __future__ import annotations

import unittest

from backend.services.script_service import _parse_refined_script_characters_response


class RefineScriptCharactersParsingTests(unittest.TestCase):
    def test_parses_script_and_normalizes_character_ids(self) -> None:
        raw = """
        {
          "text": "Host: We need to talk about the latest tariff shock.\\nAnalyst: The market is already pricing in the fallout.",
          "characters": [
            {
              "name": "Host",
              "description": "young host with dark blazer and rolled sleeves",
              "style_prompt": "comic book illustration"
            },
            {
              "name": "Analyst",
              "appearance": "silver hair, square glasses, navy suit",
              "role": "economics analyst"
            }
          ]
        }
        """

        text, characters = _parse_refined_script_characters_response(raw)

        self.assertIn("Host:", text)
        self.assertEqual(len(characters), 2)
        self.assertEqual(characters[0]["id"], "host")
        self.assertEqual(characters[1]["id"], "analyst")
        self.assertIn("economics analyst", characters[1]["description"])

    def test_requires_at_least_two_characters(self) -> None:
        raw = """
        {
          "text": "Host: One line only.",
          "characters": [
            {"name": "Host", "description": "host in black jacket"}
          ]
        }
        """

        with self.assertRaises(ValueError):
            _parse_refined_script_characters_response(raw)

    def test_strips_parenthetical_stage_directions_from_dialogue(self) -> None:
        raw = """
        {
          "text": "Blake: (smirking) So what do you think happens next?\\nRiley: [nervously] I do not want to find out.",
          "characters": [
            {"name": "Blake", "description": "dark jacket and sharp grin"},
            {"name": "Riley", "description": "hoodie, anxious expression"}
          ]
        }
        """

        text, _characters = _parse_refined_script_characters_response(raw)

        self.assertEqual(text, "Blake: So what do you think happens next?\nRiley: I do not want to find out.")


if __name__ == "__main__":
    unittest.main()
