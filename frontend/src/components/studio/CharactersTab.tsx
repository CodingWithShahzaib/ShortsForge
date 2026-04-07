"use client";

import { useEffect, useMemo, useState } from "react";

import { CharacterManager } from "@/components/character-manager/CharacterManager";
import { StylePresetSelector } from "@/components/character-manager/StylePresetSelector";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useVoicesQuery } from "@/lib/queries/generateCatalog";
import type { CharacterConfig, DialogueStylePreset, Project, Scene } from "@/lib/types";

type SceneDialogueConfig = {
  speaker_id: string;
  shot_type: string;
  is_reaction_shot: boolean;
};

type Props = {
  project: Project;
  scenes: Scene[];
  onRefresh: () => void;
};

export function CharactersTab({ project, scenes, onRefresh }: Props) {
  const settings = project.settings || {};
  const { data: voices = [] } = useVoicesQuery(settings.tts_provider as string || "kokoro");
  const persistedGenerationMode =
    settings.generation_mode === "dialogue" || settings.generation_mode === "standard"
      ? settings.generation_mode
      : scenes.some((scene) => scene.scene_type === "dialogue")
        ? "dialogue"
        : "standard";
  const initialCharacters = useMemo(
    () => (Array.isArray(settings.characters) ? (settings.characters as CharacterConfig[]) : []),
    [settings.characters]
  );
  const [characters, setCharacters] = useState<CharacterConfig[]>(initialCharacters);
  const [stylePreset, setStylePreset] = useState<DialogueStylePreset>(
    (settings.dialogue_style_preset as DialogueStylePreset | undefined) || "comic_book"
  );
  const [characterConsistencyEnabled, setCharacterConsistencyEnabled] = useState(
    Boolean(settings.character_consistency_enabled ?? true)
  );
  const [saving, setSaving] = useState(false);
  const [sceneConfig, setSceneConfig] = useState<Record<string, SceneDialogueConfig>>({});

  useEffect(() => {
    setCharacters(initialCharacters);
  }, [initialCharacters]);

  useEffect(() => {
    const next: Record<string, SceneDialogueConfig> = {};
    for (const scene of scenes) {
      next[scene.id] = {
        speaker_id: String(scene.scene_settings?.speaker_id || ""),
        shot_type: String(scene.scene_settings?.shot_type || "medium"),
        is_reaction_shot: Boolean(scene.scene_settings?.is_reaction_shot || false),
      };
    }
    setSceneConfig(next);
  }, [scenes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProject(project.id, {
        settings: {
          ...(project.settings || {}),
          generation_mode: persistedGenerationMode,
          characters,
          dialogue_style_preset: stylePreset,
          character_consistency_enabled: characterConsistencyEnabled,
        },
      });

      await Promise.all(
        scenes.map((scene) =>
          api.updateScene(project.id, scene.id, {
            scene_settings: {
              ...(scene.scene_settings || {}),
              speaker_id: sceneConfig[scene.id]?.speaker_id || null,
              shot_type: sceneConfig[scene.id]?.shot_type || "medium",
              is_reaction_shot: Boolean(sceneConfig[scene.id]?.is_reaction_shot),
            },
          })
        )
      );

      notify.success("Character settings saved");
      onRefresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save characters");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Characters</h2>
              <p className="text-sm text-muted-foreground">
                Fine-tune the dialogue cast, style preset, and per-scene speaker assignments.
              </p>
            </div>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field id="studio-dialogue-style" label="Dialogue style preset">
              <StylePresetSelector value={stylePreset} onChange={setStylePreset} />
            </Field>

            <label className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={characterConsistencyEnabled}
                onChange={(event) => setCharacterConsistencyEnabled(event.target.checked)}
              />
              <span>
                <span className="block font-medium">Enable character consistency</span>
                <span className="text-xs text-muted-foreground">
                  Keep faces, clothing, and silhouettes stable across dialogue scenes.
                </span>
              </span>
            </label>
          </div>
        </div>

        <CharacterManager characters={characters} voices={voices} onChange={setCharacters} />

        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Per-scene speaker control</h3>
            <p className="text-sm text-muted-foreground">
              Assign who is speaking in each scene and whether the shot should read like a reaction cut.
            </p>
          </div>

          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="grid gap-3 rounded-xl border border-border/50 bg-muted/10 p-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_160px]"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">Scene {index + 1}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {scene.narration || scene.subtitle || scene.image_prompt || "No scene copy yet."}
                  </p>
                </div>

                <Field id={`scene-speaker-${scene.id}`} label="Speaker">
                  <Select
                    value={sceneConfig[scene.id]?.speaker_id || "__none__"}
                    onValueChange={(value) =>
                      setSceneConfig((prev) => ({
                        ...prev,
                        [scene.id]: {
                          ...prev[scene.id],
                          speaker_id: value === "__none__" ? "" : value,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No speaker</SelectItem>
                      {characters.map((character) => (
                        <SelectItem key={character.id} value={character.id}>
                          {character.name || "Unnamed character"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id={`scene-shot-${scene.id}`} label="Shot type">
                  <Select
                    value={sceneConfig[scene.id]?.shot_type || "medium"}
                    onValueChange={(value) =>
                      setSceneConfig((prev) => ({
                        ...prev,
                        [scene.id]: {
                          ...prev[scene.id],
                          shot_type: value,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shot type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="closeup">Closeup</SelectItem>
                      <SelectItem value="two-shot">Two-shot</SelectItem>
                      <SelectItem value="reaction">Reaction</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <label className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(sceneConfig[scene.id]?.is_reaction_shot)}
                    onChange={(event) =>
                      setSceneConfig((prev) => ({
                        ...prev,
                        [scene.id]: {
                          ...prev[scene.id],
                          is_reaction_shot: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>
                    <span className="block font-medium">Reaction shot</span>
                    <span className="text-xs text-muted-foreground">Use shorter, punchier pacing.</span>
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
