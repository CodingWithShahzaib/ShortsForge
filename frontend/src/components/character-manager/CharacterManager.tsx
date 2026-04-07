"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CharacterConfig, Voice } from "@/lib/types";
import { CharacterCard } from "@/components/character-manager/CharacterCard";

const DEFAULT_STYLE_PROMPT =
  "comic book illustration, bold black outlines, dramatic shading, graphic novel style, political cartoon aesthetic";

function createCharacter(index: number): CharacterConfig {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `character_${Date.now()}_${index}`;
  return {
    id,
    name: "",
    description: "",
    voice_profile: null,
    reference_image_url: null,
    style_prompt: DEFAULT_STYLE_PROMPT,
    color_palette: null,
  };
}

type Props = {
  characters: CharacterConfig[];
  voices: Voice[];
  onChange: (characters: CharacterConfig[]) => void;
  onGenerateReference?: (character: CharacterConfig) => void;
  generatingCharacterId?: string | null;
};

export function CharacterManager({
  characters,
  voices,
  onChange,
  onGenerateReference,
  generatingCharacterId = null,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Characters</p>
          <p className="text-xs text-muted-foreground">
            Add at least two characters to enable shot-reverse-shot dialogue scenes.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...characters, createCharacter(characters.length + 1)])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add character
        </Button>
      </div>

      <div className="space-y-4">
        {characters.map((character, index) => (
          <CharacterCard
            key={character.id}
            character={character}
            index={index}
            voices={voices}
            onChange={(next) => {
              const updated = [...characters];
              updated[index] = next;
              onChange(updated);
            }}
            onRemove={() => onChange(characters.filter((item) => item.id !== character.id))}
            onGenerateReference={
              onGenerateReference
                ? () => onGenerateReference(character)
                : undefined
            }
            generatingReference={generatingCharacterId === character.id}
          />
        ))}
      </div>
    </div>
  );
}
