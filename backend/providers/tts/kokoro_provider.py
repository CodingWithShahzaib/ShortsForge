from __future__ import annotations

from typing import Any

import httpx

from backend.providers.base import TTSProvider

VOICE_PREFIX_METADATA: dict[str, tuple[str, str]] = {
    "af": ("American English", "Female"),
    "am": ("American English", "Male"),
    "bf": ("British English", "Female"),
    "bm": ("British English", "Male"),
    "ef": ("Spanish", "Female"),
    "em": ("Spanish", "Male"),
    "ff": ("French", "Female"),
    "hf": ("Hindi", "Female"),
    "hm": ("Hindi", "Male"),
    "if": ("Italian", "Female"),
    "im": ("Italian", "Male"),
    "jf": ("Japanese", "Female"),
    "jm": ("Japanese", "Male"),
    "pf": ("Portuguese", "Female"),
    "pm": ("Portuguese", "Male"),
    "zf": ("Mandarin Chinese", "Female"),
    "zm": ("Mandarin Chinese", "Male"),
}


def _friendly_voice_name(voice_id: str) -> str:
    _, _, suffix = voice_id.partition("_")
    base = suffix or voice_id
    display = base.replace("v0", "v0 ").replace("_", " ").strip()
    return " ".join(part.capitalize() for part in display.split()) or voice_id


def _voice_metadata_from_id(voice_id: str) -> tuple[str, str]:
    prefix = voice_id.split("_", 1)[0].lower()
    return VOICE_PREFIX_METADATA.get(prefix, ("", ""))


def normalize_kokoro_voice_id(voice_id: str | None, fallback: str = "af_bella") -> str:
    candidate = str(voice_id or "").strip()
    if not candidate:
        return fallback
    prefix, sep, _ = candidate.partition("_")
    if sep and prefix.lower() in VOICE_PREFIX_METADATA:
        return candidate
    return fallback


class KokoroTTSProvider(TTSProvider):
    def __init__(self, base_url: str):
        self._base_url = base_url.rstrip("/")

    @property
    def name(self) -> str:
        return "kokoro"

    async def synthesize(
        self,
        text: str,
        voice: str = "af_bella",
        speed: float = 1.0,
        **kwargs: Any,
    ) -> bytes:
        normalized_voice = normalize_kokoro_voice_id(voice)
        payload = {
            "model": kwargs.get("model", "kokoro"),
            "input": text,
            "voice": normalized_voice,
            "response_format": kwargs.get("response_format", "mp3"),
            "speed": speed,
        }
        normalization_options = kwargs.get("normalization_options")
        if normalization_options is not None:
            payload["normalization_options"] = normalization_options

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self._base_url}/v1/audio/speech",
                json=payload,
            )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = (resp.text or "").strip()
                if detail:
                    message = f"{exc}. Kokoro response: {detail[:300]}"
                    raise httpx.HTTPStatusError(message, request=exc.request, response=exc.response) from exc
                raise
            return resp.content

    async def list_voices(self) -> list[dict[str, str]]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self._base_url}/v1/audio/voices")
            resp.raise_for_status()
            data = resp.json()

        voices = data.get("voices", data)
        if not isinstance(voices, list):
            return []

        normalized: list[dict[str, str]] = []
        for voice in voices:
            if isinstance(voice, str):
                voice_id = voice.strip()
                if voice_id:
                    locale, gender = _voice_metadata_from_id(voice_id)
                    normalized.append(
                        {
                            "id": voice_id,
                            "name": _friendly_voice_name(voice_id),
                            "locale": locale,
                            "gender": gender,
                        }
                    )
                continue
            if isinstance(voice, dict):
                voice_id = str(voice.get("id") or voice.get("voice") or voice.get("name") or "").strip()
                if not voice_id:
                    continue
                locale, gender = _voice_metadata_from_id(voice_id)
                normalized.append(
                    {
                        "id": voice_id,
                        "name": str(voice.get("name") or _friendly_voice_name(voice_id)),
                        "locale": str(voice.get("locale") or locale),
                        "gender": str(voice.get("gender") or gender),
                    }
                )
        return normalized
