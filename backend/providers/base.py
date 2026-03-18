from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class LLMProvider(ABC):
    """Base class for LLM providers (OpenAI, Groq, OpenRouter)."""

    @abstractmethod
    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        ...

    @abstractmethod
    async def chat_completion_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        ...


class ImageProvider(ABC):
    """Base class for image generation providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        style: str = "realistic",
        **kwargs: Any,
    ) -> bytes:
        """Return raw image bytes."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    def available_models(self) -> list[str]:
        return []


class TTSProvider(ABC):
    """Base class for text-to-speech providers."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice: str,
        speed: float = 1.0,
        **kwargs: Any,
    ) -> bytes:
        """Return raw audio bytes (MP3)."""
        ...

    @abstractmethod
    async def list_voices(self) -> list[dict[str, str]]:
        """Return list of available voices with id and name."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...


class TranscriptionProvider(ABC):
    """Base class for speech-to-text."""

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        word_timestamps: bool = True,
    ) -> dict:
        """Return transcription with word-level timestamps."""
        ...
