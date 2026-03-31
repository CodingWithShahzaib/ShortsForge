"use client";

import { memo, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SCENE_NARRATION_STYLE_IDS,
  STORY_TEMPLATE_IDS,
  type GenerateFormValues,
} from "@/app/generate/schema";
import { useStoryTemplatesQuery } from "@/lib/queries/generateCatalog";

type Provider = { name: string; configured: boolean };

type Props = {
  storyTypes: { id: string; name: string }[];
  llmProviders: Provider[];
};

export const StorySettingsCard = memo(function StorySettingsCard({
  storyTypes,
  llmProviders,
}: Props) {
  const {
    control,
    register,
    formState: { errors, touchedFields, submitCount },
  } = useFormContext<GenerateFormValues>();
  const useProductionStoryboard = useWatch({ control, name: "use_production_storyboard" });
  const matchScenesToAudio = useWatch({ control, name: "match_scenes_to_audio" });
  const { data: storyTemplatesRemote = [] } = useStoryTemplatesQuery();
  const storyTemplates = useMemo(
    () =>
      storyTemplatesRemote.length > 0
        ? storyTemplatesRemote
        : STORY_TEMPLATE_IDS.map((id) => ({
            id,
            name: id === "default" ? "Standard" : id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            description: "",
          })),
    [storyTemplatesRemote]
  );
  const storyTemplateId = useWatch({ control, name: "story_template" });
  const templateHint = useMemo(() => {
    const t = storyTemplates.find((x) => x.id === storyTemplateId);
    return t?.description ?? "";
  }, [storyTemplates, storyTemplateId]);
  const showError = (name: keyof GenerateFormValues) => !!(submitCount > 0 || touchedFields[name]) && !!errors[name];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-1 block">Story Type</label>
        <Controller
          control={control}
          name="story_type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select story type" />
              </SelectTrigger>
              <SelectContent>
                {storyTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {showError("story_type") ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.story_type?.message}</p>
        ) : null}
      </div>
      <details className="rounded-md border border-border/70 p-2.5">
        <summary className="cursor-pointer text-sm font-medium">Advanced story controls</summary>
        <div className="mt-2.5 space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Narrative structure</label>
            <Controller
              control={control}
              name="story_template"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select structure" />
                  </SelectTrigger>
                  <SelectContent>
                    {storyTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {templateHint ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{templateHint}</p>
            ) : null}
            {showError("story_template") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.story_template?.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Script length (words)</label>
              <Input
                type="number"
                min={150}
                max={800}
                className={showError("word_count") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("word_count", { valueAsNumber: true })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Longer scripts = more substantial narration</p>
              {showError("word_count") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.word_count?.message}</p>
              ) : null}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Script AI</label>
              <Controller
                control={control}
                name="llm_provider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {llmProviders
                        .filter((p) => p.configured)
                        .map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {showError("llm_provider") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.llm_provider?.message}</p>
              ) : null}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Scenes</label>
              <Input
                type="number"
                min={2}
                max={100}
                className={showError("scene_count") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("scene_count", { valueAsNumber: true })}
              />
              {showError("scene_count") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.scene_count?.message}</p>
              ) : null}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Narration per scene</label>
            <Controller
              control={control}
              name="scene_narration_style"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select narration density" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENE_NARRATION_STYLE_IDS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id === "short" ? "Short" : id === "long" ? "Long" : "Balanced"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Controls how much spoken copy each scene carries before the next cut.
            </p>
            {showError("scene_narration_style") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.scene_narration_style?.message}
              </p>
            ) : null}
          </div>
          <div>
              <label className="text-sm font-medium mb-1 block">Scene length (seconds)</label>
            <Input
              type="number"
              min={1}
              max={60}
              step={0.5}
              className={showError("scene_duration") ? "border-red-500 focus-visible:ring-red-500" : undefined}
              {...register("scene_duration", { valueAsNumber: true })}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Applies to each scene; auto-extends to match narration.
            </p>
            {showError("scene_duration") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.scene_duration?.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Pause between scenes (ms)</label>
              <Input
                type="number"
                min={0}
                max={1200}
                step={50}
                className={showError("inter_scene_pause_ms") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("inter_scene_pause_ms", { valueAsNumber: true })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Default 600ms pause between scenes.</p>
              {showError("inter_scene_pause_ms") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.inter_scene_pause_ms?.message}</p>
              ) : null}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Transition overlap (ms)</label>
              <Input
                type="number"
                min={0}
                max={800}
                step={50}
                className={showError("transition_overlap_ms") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("transition_overlap_ms", { valueAsNumber: true })}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Default 250ms crossfade blend.</p>
              {showError("transition_overlap_ms") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.transition_overlap_ms?.message}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="use-production-storyboard"
                className="rounded"
                {...register("use_production_storyboard")}
              />
              <label htmlFor="use-production-storyboard" className="text-sm font-medium cursor-pointer">
                Director-style scenes (camera + lighting details)
                <span className="block text-xs text-muted-foreground font-normal">
                  Builds more realistic, film-like prompts.
                </span>
              </label>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="match-scenes-to-audio"
                className="rounded"
                {...register("match_scenes_to_audio")}
              />
              <label htmlFor="match-scenes-to-audio" className="text-sm font-medium cursor-pointer">
                Match scenes to narration length
                <span className="block text-xs text-muted-foreground font-normal">
                  Prevents scenes from ending before narration finishes.
                </span>
              </label>
            </div>
          </div>
          <div>
              <label className="text-sm font-medium mb-1 block">Keep visuals consistent</label>
            <Input
              placeholder="e.g. teal-orange palette, rain, solitary figure"
              {...register("visual_continuity")}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Reuses the same look and mood across the video.
            </p>
          </div>
          {useProductionStoryboard ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Director-style scenes are enabled.
            </p>
          ) : null}
          {matchScenesToAudio ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Scene lengths will follow narration.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
});
