from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from backend.providers.tts.kokoro_provider import KokoroTTSProvider, normalize_kokoro_voice_id
from backend.services.audio_service import get_tts_provider


class _FakeResponse:
    def __init__(self, *, content: bytes = b"", json_data=None, text: str = "", status_code: int = 200, request=None):
        self.content = content
        self._json_data = json_data
        self.text = text
        self.status_code = status_code
        self.request = request or httpx.Request("GET", "http://test")

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"Client error '{self.status_code} Bad Request' for url '{self.request.url}'",
                request=self.request,
                response=self,
            )
        return None

    def json(self):
        return self._json_data


class _FakeAsyncClient:
    def __init__(self, responses):
        self._responses = list(responses)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, json):
        return self._responses.pop(0)

    async def get(self, url):
        return self._responses.pop(0)


class KokoroTTSProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_synthesize_uses_openai_compatible_endpoint(self) -> None:
        provider = KokoroTTSProvider("http://kokoro-tts:8880")
        fake_response = _FakeResponse(content=b"mp3-bytes")

        with patch(
            "backend.providers.tts.kokoro_provider.httpx.AsyncClient",
            return_value=_FakeAsyncClient([fake_response]),
        ):
            audio = await provider.synthesize("Hello world", "af_bella", 1.1)

        self.assertEqual(audio, b"mp3-bytes")

    async def test_synthesize_falls_back_from_invalid_voice_id(self) -> None:
        provider = KokoroTTSProvider("http://kokoro-tts:8880")
        fake_response = _FakeResponse(content=b"mp3-bytes")

        with patch(
            "backend.providers.tts.kokoro_provider.httpx.AsyncClient",
            return_value=_FakeAsyncClient([fake_response]),
        ):
            audio = await provider.synthesize("Hello world", "kokoro_voice_id_1", 1.0)

        self.assertEqual(audio, b"mp3-bytes")

    async def test_synthesize_surfaces_error_body(self) -> None:
        provider = KokoroTTSProvider("http://kokoro-tts:8880")
        fake_response = _FakeResponse(
            text='{"detail":"unknown voice"}',
            status_code=400,
            request=httpx.Request("POST", "http://kokoro-tts:8880/v1/audio/speech"),
        )

        with patch(
            "backend.providers.tts.kokoro_provider.httpx.AsyncClient",
            return_value=_FakeAsyncClient([fake_response]),
        ):
            with self.assertRaises(httpx.HTTPStatusError) as ctx:
                await provider.synthesize("Hello world", "af_bella", 1.0)

        self.assertIn("unknown voice", str(ctx.exception))

    async def test_list_voices_normalizes_kokoro_response(self) -> None:
        provider = KokoroTTSProvider("http://kokoro-tts:8880")
        fake_response = _FakeResponse(
            json_data={
                "voices": [
                    {"voice": "af_bella", "name": "Bella", "locale": "en-US", "gender": "female"},
                    {"id": "af_sky", "name": "Sky"},
                ]
            }
        )

        with patch(
            "backend.providers.tts.kokoro_provider.httpx.AsyncClient",
            return_value=_FakeAsyncClient([fake_response]),
        ):
            voices = await provider.list_voices()

        self.assertEqual(voices[0]["id"], "af_bella")
        self.assertEqual(voices[0]["name"], "Bella")
        self.assertEqual(voices[1]["id"], "af_sky")

    async def test_list_voices_accepts_string_voice_lists(self) -> None:
        provider = KokoroTTSProvider("http://kokoro-tts:8880")
        fake_response = _FakeResponse(json_data={"voices": ["af_bella", "af_sky"]})

        with patch(
            "backend.providers.tts.kokoro_provider.httpx.AsyncClient",
            return_value=_FakeAsyncClient([fake_response]),
        ):
            voices = await provider.list_voices()

        self.assertEqual(voices[0]["id"], "af_bella")
        self.assertEqual(voices[0]["name"], "Bella")
        self.assertEqual(voices[1]["id"], "af_sky")

    def test_get_tts_provider_returns_kokoro_provider(self) -> None:
        fake_settings = SimpleNamespace(
            default_tts_provider="kokoro",
            kokoro_tts_url="http://kokoro-tts:8880",
            openai_api_key="",
            openai_base_url="https://api.openai.com/v1",
        )

        with patch("backend.services.audio_service.get_settings", return_value=fake_settings):
            provider = get_tts_provider("kokoro")

        self.assertEqual(provider.name, "kokoro")

    def test_normalize_kokoro_voice_id_rejects_placeholder_ids(self) -> None:
        self.assertEqual(normalize_kokoro_voice_id("kokoro_voice_id_1"), "af_bella")
        self.assertEqual(normalize_kokoro_voice_id(None), "af_bella")
        self.assertEqual(normalize_kokoro_voice_id("af_bella"), "af_bella")


if __name__ == "__main__":
    unittest.main()
