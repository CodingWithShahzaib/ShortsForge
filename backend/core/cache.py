from __future__ import annotations
import hashlib
from typing import Any
from cachetools import LRUCache


class MediaCache:
    def __init__(self, maxsize: int = 50):
        self._cache: LRUCache = LRUCache(maxsize=maxsize)

    @staticmethod
    def _key(prompt: str, provider: str, **kwargs: Any) -> str:
        raw = f"{provider}:{prompt}:{sorted(kwargs.items())}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, prompt: str, provider: str, **kwargs: Any) -> bytes | None:
        return self._cache.get(self._key(prompt, provider, **kwargs))

    def put(self, prompt: str, provider: str, data: bytes, **kwargs: Any) -> None:
        self._cache[self._key(prompt, provider, **kwargs)] = data

    def clear(self) -> None:
        self._cache.clear()


image_cache = MediaCache(maxsize=100)
