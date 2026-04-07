"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { StylePresetSelector } from "@/components/character-manager/StylePresetSelector";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { GenerateFormValues } from "@/app/generate/schema";

/**
 * DialogueControlsCard — shows only dialogue settings that materially affect
 * the current generate flow. Character management stays in the page-level
 * input step, and advanced scene-level controls stay in Studio.
 */
export function DialogueControlsCard() {
  const { control, register } = useFormContext<GenerateFormValues>();
  const generationMode = useWatch({ control, name: "generation_mode" });

  if (generationMode !== "dialogue") return null;

  return (
    <div id="gen-dialogue-controls" className="space-y-4">
      <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-3 text-sm text-muted-foreground">
        Set the dialogue style, pacing, and subtitle labeling used when your speaker-tagged script is turned into scenes.
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Dialogue behavior
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field id="dialogue-style-preset" label="Visual preset">
            <Controller
              control={control}
              name="dialogue_style_preset"
              render={({ field }) => (
                <StylePresetSelector value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>

          <Field id="pause-between-speakers-ms" label="Pause between speakers (ms)">
            <Input
              type="number"
              min={0}
              max={1500}
              step={50}
              {...register("pause_between_speakers_ms", { valueAsNumber: true })}
            />
          </Field>

          <Field id="dialogue-scene-duration" label="Base scene duration (s)">
            <Input
              type="number"
              min={1}
              max={60}
              step={0.5}
              {...register("scene_duration", { valueAsNumber: true })}
            />
          </Field>

          <label className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 text-sm md:col-span-2 xl:col-span-1">
            <input type="checkbox" className="mt-1" {...register("speaker_labels_in_subtitles")} />
            <span>
              <span className="block font-medium">Label subtitles by speaker</span>
              <span className="text-xs text-muted-foreground">
                Prefix subtitle lines with the current speaker name.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-sm">
          <p className="font-medium text-foreground">Derived automatically</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Image style and transitions come from the selected dialogue preset, so they are no longer tuned separately here.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/15 p-3 text-sm">
          <p className="font-medium text-foreground">Edit scene shots later</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Shot type defaults and reaction-cut timing are only meaningful once scenes exist, so those stay in Studio controls.
          </p>
        </div>
      </div>
    </div>
  );
}
