from __future__ import annotations

import hashlib
from typing import Optional


class CharacterConsistencyManager:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.character_seeds: dict[str, int] = {}
        self.reference_images: dict[str, str] = {}

    def get_or_create_seed(self, character_id: str) -> int:
        if character_id not in self.character_seeds:
            seed_string = f"{self.project_id}|{character_id}"
            seed = int(hashlib.sha256(seed_string.encode()).hexdigest()[:8], 16)
            self.character_seeds[character_id] = seed
        return self.character_seeds[character_id]

    def get_reference_image(self, character_id: str) -> Optional[str]:
        return self.reference_images.get(character_id)

    def store_reference_image(self, character_id: str, image_url: str) -> None:
        if character_id and character_id not in self.reference_images and image_url:
            self.reference_images[character_id] = image_url


__all__ = ["CharacterConsistencyManager"]
