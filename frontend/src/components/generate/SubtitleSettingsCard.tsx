"use client";

import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  TRANSCRIPTION_PROVIDERS,
  type GenerateFormValues,
} from "@/app/generate/schema";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SubtitleSettingsCard() {
  const { control, register, setValue } = useFormContext<GenerateFormValues>();
  const subtitleEnabled = useWatch({ control, name: "subtitle_enabled" });

  useEffect(() => {
    setValue("subtitle_source", "transcription", { shouldDirty: false, shouldValidate: true });
  }, [setValue]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Captions
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl bg-background/55 p-3 text-sm ring-1 ring-border/20">
            <input type="checkbox" className="mt-1 rounded" {...register("subtitle_enabled")} />
            <span>
              <span className="block font-medium">Enable subtitles</span>
              <span className="text-xs text-muted-foreground">
                Burn captions into the final export for short-form platforms.
              </span>
            </span>
          </label>
        </div>
      </div>

      {subtitleEnabled ? (
        <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Caption source
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field id="subtitle-source" label="Subtitle source">
              <div className="flex min-h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                Transcribe final audio
              </div>
              <Controller
                control={control}
                name="subtitle_source"
                render={({ field }) => <input type="hidden" value={field.value} onChange={field.onChange} />}
              />
            </Field>
            <Field id="transcription-provider" label="Transcription provider">
              <Controller
                control={control}
                name="transcription_provider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSCRIPTION_PROVIDERS.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field id="transcription-language" label="Language code">
              <Input
                placeholder="en"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                {...register("transcription_language")}
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}
