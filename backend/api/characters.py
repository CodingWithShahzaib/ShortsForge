from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.core.prompts.dialogue_prompts import build_dialogue_scene_prompt
from backend.core.storage import get_storage
from backend.schemas import CharacterConfig, CharacterReferenceGenerateRequest
from backend.services.image_service import generate_image

router = APIRouter()

REFERENCE_IMAGE_STYLE_BY_PRESET = {
    "comic_book": "comic_book",
    "political_cartoon": "comic_book",
    "graphic_novel": "comic_book",
    "anime": "anime",
    "photorealistic": "realistic",
    "documentary": "realistic",
    "cinematic": "cinematic",
    "cinematic_noir": "cinematic",
    "epic_blockbuster": "cinematic",
    "watercolor": "watercolor",
}


def _character_store_path() -> Path:
    settings = get_settings()
    store_dir = settings.temp_dir / "character-library"
    store_dir.mkdir(parents=True, exist_ok=True)
    return store_dir / "characters.json"


def _load_character_library() -> list[CharacterConfig]:
    path = _character_store_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    return [CharacterConfig.model_validate(item) for item in data]


def _save_character_library(characters: list[CharacterConfig]) -> None:
    path = _character_store_path()
    payload = [character.model_dump() for character in characters]
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _find_character(characters: list[CharacterConfig], character_id: str) -> tuple[int, CharacterConfig]:
    for index, character in enumerate(characters):
        if character.id == character_id:
            return index, character
    raise HTTPException(404, "Character not found")


@router.get("", response_model=list[CharacterConfig])
async def list_characters() -> list[CharacterConfig]:
    return _load_character_library()


@router.post("", response_model=CharacterConfig, status_code=201)
async def create_character(payload: CharacterConfig) -> CharacterConfig:
    characters = _load_character_library()
    character = payload.model_copy(update={"id": payload.id or uuid.uuid4().hex})
    if any(existing.id == character.id for existing in characters):
        raise HTTPException(409, "Character ID already exists")
    characters.append(character)
    _save_character_library(characters)
    return character


@router.put("/{character_id}", response_model=CharacterConfig)
async def update_character(character_id: str, payload: CharacterConfig) -> CharacterConfig:
    characters = _load_character_library()
    index, current = _find_character(characters, character_id)
    updated = current.model_copy(update=payload.model_dump(exclude_unset=False))
    updated = updated.model_copy(update={"id": character_id})
    characters[index] = updated
    _save_character_library(characters)
    return updated


@router.delete("/{character_id}", status_code=204)
async def delete_character(character_id: str) -> None:
    characters = _load_character_library()
    index, _ = _find_character(characters, character_id)
    characters.pop(index)
    _save_character_library(characters)


@router.post("/{character_id}/generate-reference", response_model=CharacterConfig)
async def generate_character_reference(
    character_id: str,
    payload: CharacterReferenceGenerateRequest,
) -> CharacterConfig:
    characters = _load_character_library()
    index, character = _find_character(characters, character_id)
    preset = payload.style or "comic_book"
    prompt = build_dialogue_scene_prompt(
        character=character,
        dialogue_line="neutral reference pose, front-facing character turnaround",
        shot_type="medium",
        preset=preset,
    )
    image_key = await generate_image(
        prompt,
        provider=payload.provider,
        width=payload.width,
        height=payload.height,
        style=REFERENCE_IMAGE_STYLE_BY_PRESET.get(preset, "comic_book"),
    )
    storage = get_storage()
    image_url = await storage.get_url(image_key)
    updated = character.model_copy(update={"reference_image_url": image_url})
    characters[index] = updated
    _save_character_library(characters)
    return updated
