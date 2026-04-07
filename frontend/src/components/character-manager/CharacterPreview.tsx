"use client";

import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import type { CharacterConfig } from "@/lib/types";

type Props = {
  character: CharacterConfig;
};

export function CharacterPreview({ character }: Props) {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        {character.reference_image_url ? (
          <Image
            src={character.reference_image_url}
            alt={`${character.name} preview`}
            width={80}
            height={80}
            className="h-20 w-20 rounded-lg border border-border/60 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background text-lg font-semibold text-muted-foreground">
            {initials || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{character.name || "Untitled character"}</p>
            {character.voice_profile ? <Badge variant="outline">{character.voice_profile}</Badge> : null}
          </div>
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {character.description || "Add a physical description to keep this character consistent across scenes."}
          </p>
        </div>
      </div>
    </div>
  );
}
