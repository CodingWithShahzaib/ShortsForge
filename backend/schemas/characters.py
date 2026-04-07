from __future__ import annotations

from pydantic import BaseModel, Field


DEFAULT_CHARACTER_STYLE_PROMPT = (
    "comic book illustration, bold black outlines, dramatic shading, "
    "graphic novel style, political cartoon aesthetic"
)


class CharacterConfig(BaseModel):
    id: str
    name: str
    description: str
    voice_profile: str | None = None
    reference_image_url: str | None = None
    style_prompt: str = Field(
        default=DEFAULT_CHARACTER_STYLE_PROMPT,
        description="Style modifiers appended to all image prompts for this character.",
    )
    color_palette: list[str] | None = None


class ProjectCharacters(BaseModel):
    characters: list[CharacterConfig] = Field(default_factory=list)
    default_interaction_style: str = Field(
        default="alternating medium shots",
        description="alternating|two-shot|dynamic",
    )


class CharacterReferenceGenerateRequest(BaseModel):
    provider: str | None = None
    width: int = 1080
    height: int = 1920
    style: str | None = None
