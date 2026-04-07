"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterConfig, Voice } from "@/lib/types";
import { CharacterPreview } from "@/components/character-manager/CharacterPreview";
import { VoiceSelector } from "@/components/character-manager/VoiceSelector";
import { api, resolveMediaPlaybackUrl } from "@/lib/api";
import { notify } from "@/lib/notify";

type Props = {
  character: CharacterConfig;
  index: number;
  voices: Voice[];
  onChange: (next: CharacterConfig) => void;
  onRemove: () => void;
  onGenerateReference?: () => void;
  generatingReference?: boolean;
};

export function CharacterCard({
  character,
  index,
  voices,
  onChange,
  onRemove,
  onGenerateReference,
  generatingReference = false,
}: Props) {
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      const audio = previewAudioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      previewAudioRef.current = null;
    };
  }, []);

  const handlePreviewVoice = async () => {
    if (!character.voice_profile) {
      notify.error("Select a voice first.");
      return;
    }

    const existingAudio = previewAudioRef.current;
    if (existingAudio && playingPreview) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
      setPlayingPreview(false);
      return;
    }

    if (existingAudio) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
      previewAudioRef.current = null;
    }

    setPreviewingVoice(true);
    try {
      const previewName = character.name.trim() || `Character ${index + 1}`;
      const result = await api.generateAudio({
        text: `Hello, I am ${previewName}. This is my voice preview.`,
        provider: "kokoro",
        voice: character.voice_profile,
        speed: 1,
        response_format: "mp3",
        normalize: true,
      });
      const raw = result.url || result.path;
      if (!raw) {
        throw new Error("Missing audio preview URL");
      }
      const resolvedUrl = await resolveMediaPlaybackUrl(raw);
      const audio = new Audio(resolvedUrl);
      audio.addEventListener("ended", () => setPlayingPreview(false));
      previewAudioRef.current = audio;
      await audio.play();
      setPlayingPreview(true);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Voice preview failed");
      setPlayingPreview(false);
    } finally {
      setPreviewingVoice(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Character {index + 1}</p>
          <p className="text-xs text-muted-foreground">Define the look, voice, and consistency anchor.</p>
        </div>
        <div className="flex items-center gap-2">
          {onGenerateReference ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onGenerateReference}
              disabled={generatingReference || !character.description.trim()}
            >
              <Wand2 className="mr-1.5 h-4 w-4" />
              {generatingReference ? "Generating..." : "Reference"}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <Field id={`character-name-${character.id}`} label="Name">
            <Input
              value={character.name}
              onChange={(event) => onChange({ ...character, name: event.target.value })}
              placeholder="Character name"
            />
          </Field>

          <Field
            id={`character-description-${character.id}`}
            label="Description"
            hint="Focus on face, hair, clothing, silhouette, and any iconic props."
          >
            <Textarea
              value={character.description}
              onChange={(event) => onChange({ ...character, description: event.target.value })}
              rows={4}
              placeholder="Example: middle-aged policy analyst, silver hair, square glasses, navy blazer, red tie"
            />
          </Field>

          <Field id={`character-voice-${character.id}`} label="Voice">
            <div className="space-y-2">
              <VoiceSelector
                voices={voices}
                value={character.voice_profile}
                onChange={(voice) => onChange({ ...character, voice_profile: voice || null })}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-center"
                onClick={() => void handlePreviewVoice()}
                disabled={previewingVoice || !character.voice_profile}
              >
                {previewingVoice ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : playingPreview ? (
                  <Square className="mr-1.5 h-4 w-4" />
                ) : (
                  <Play className="mr-1.5 h-4 w-4" />
                )}
                {previewingVoice ? "Generating preview..." : playingPreview ? "Stop preview" : "Preview audio"}
              </Button>
            </div>
          </Field>

          <Field
            id={`character-style-${character.id}`}
            label="Style prompt (Art direction for this character)"
          >
            <Textarea
              value={character.style_prompt}
              onChange={(event) => onChange({ ...character, style_prompt: event.target.value })}
              rows={3}
              placeholder="Extra art tags..."
            />
          </Field>
        </div>

        <CharacterPreview character={character} />
      </div>
    </div>
  );
}
