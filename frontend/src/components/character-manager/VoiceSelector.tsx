"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Voice } from "@/lib/types";

type Props = {
  voices: Voice[];
  value?: string | null;
  onChange: (value: string) => void;
};

export function VoiceSelector({ voices, value, onChange }: Props) {
  const selected = value && value.trim() ? value : "__none__";

  return (
    <Select value={selected} onValueChange={(next) => onChange(next === "__none__" ? "" : next)}>
      <SelectTrigger>
        <SelectValue placeholder="Select voice" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Use project default</SelectItem>
        {voices.map((voice) => (
          <SelectItem key={voice.id} value={voice.id}>
            {voice.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
