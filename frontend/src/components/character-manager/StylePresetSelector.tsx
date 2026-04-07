"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DialogueStylePreset } from "@/lib/types";

const PRESET_LABELS: Record<DialogueStylePreset, string> = {
  comic_book: "Comic Book",
  political_cartoon: "Political Cartoon",
  graphic_novel: "Graphic Novel",
  anime: "Anime",
  photorealistic: "Photorealistic",
  documentary: "Documentary",
  cinematic: "Cinematic",
  cinematic_noir: "Cinematic Noir",
  epic_blockbuster: "Epic Blockbuster",
  watercolor: "Watercolor",
};

type Props = {
  value: DialogueStylePreset;
  onChange: (value: DialogueStylePreset) => void;
};

export function StylePresetSelector({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as DialogueStylePreset)}>
      <SelectTrigger>
        <SelectValue placeholder="Select style preset" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PRESET_LABELS).map(([preset, label]) => (
          <SelectItem key={preset} value={preset}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
