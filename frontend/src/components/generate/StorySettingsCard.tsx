"use client";

import { memo, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SCENE_NARRATION_STYLE_IDS,
  STORY_TEMPLATE_IDS,
  type GenerateFormValues,
} from "@/app/generate/schema";
import { useStoryTemplatesQuery } from "@/lib/queries/generateCatalog";
import { resolveStoryProfileLabel } from "@/lib/story-quality";

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
  const dynamicScenes = useWatch({ control, name: "dynamic_scenes" });
  const wordCount = useWatch({ control, name: "word_count" });
  // Q11: Compute estimated narration duration from word count
  const estimatedDuration = useMemo(() => {
    const words = Number(wordCount) || 0;
    if (words < 10) return null;
    const secs = Math.round(words / 2.6);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `≈ ${m}m ${s}s narration` : `≈ ${s}s narration`;
  }, [wordCount]);
  const [showContinuityExamples, setShowContinuityExamples] = useState(false);
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
  const storyType = useWatch({ control, name: "story_type" });
  const templateHint = useMemo(() => {
    const t = storyTemplates.find((x) => x.id === storyTemplateId);
    return t?.description ?? "";
  }, [storyTemplates, storyTemplateId]);
  const resolvedProfile = useMemo(
    () => resolveStoryProfileLabel(storyType, storyTemplateId),
    [storyTemplateId, storyType]
  );
  const showError = (name: keyof GenerateFormValues) => !!(submitCount > 0 || touchedFields[name]) && !!errors[name];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Narrative core
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Story type</label>
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
          <div>
            <label className="mb-1 block text-sm font-medium">Narrative structure</label>
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
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{templateHint}</p>
            ) : null}
            {showError("story_template") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.story_template?.message}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resolved story profile</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{resolvedProfile}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Templates shape the arc, while the Story Brief card below tunes hook, payoff, pacing, and show-vs-tell inside that shared profile.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Pacing engine
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Script length (words)</label>
            <Input
              type="number"
              min={150}
              max={800}
              className={showError("word_count") ? "border-red-500 focus-visible:ring-red-500" : undefined}
              {...register("word_count", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {estimatedDuration
                ? <span className="font-medium text-violet-600 dark:text-violet-400">{estimatedDuration}</span>
                : "Longer scripts create denser narration."}
            </p>
            {showError("word_count") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.word_count?.message}</p>
            ) : null}
          </div>

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Script AI</label>
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

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Scenes</label>
            <Input
              type="number"
              min={2}
              max={100}
              disabled={dynamicScenes}
              className={showError("scene_count") && !dynamicScenes ? "border-red-500 focus-visible:ring-red-500" : undefined}
              {...register("scene_count", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {dynamicScenes ? "AI controls scene count right now." : "Manual scene count is locked in."}
            </p>
            {showError("scene_count") && !dynamicScenes ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.scene_count?.message}</p>
            ) : null}
          </div>

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Narration per scene</label>
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Controls spoken density before each cut.</p>
          </div>

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Scene length (seconds)</label>
            <Input
              type="number"
              min={1}
              max={60}
              step={0.5}
              className={showError("scene_duration") ? "border-red-500 focus-visible:ring-red-500" : undefined}
              {...register("scene_duration", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Base timing per scene before sync adjustments.</p>
            {showError("scene_duration") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.scene_duration?.message}</p>
            ) : null}
          </div>

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Keep visuals consistent</label>
            <Input
              placeholder="e.g. teal-orange palette, rain, solitary figure"
              {...register("visual_continuity")}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A global motif to keep the story visually coherent.</p>
            {/* Q12: Visual continuity examples */}
            <button
              type="button"
              onClick={() => setShowContinuityExamples((v) => !v)}
              className="mt-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline focus:outline-none"
            >
              {showContinuityExamples ? "Hide examples ▲" : "Need inspiration? ▾"}
            </button>
            {showContinuityExamples && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Click to use</p>
                {[
                  "Neon-lit Tokyo street at night, rain-slicked pavement, warm practical lights",
                  "Vintage newspaper aesthetic, sepia tones, aged paper texture",
                  "Corporate glass tower interior, cool blue-grey palette, suited professionals",
                  "Dense forest at golden hour, shafts of light through canopy, muted greens",
                  "Stark white minimalist space, single saturated accent color per scene",
                ].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      const input = document.querySelector<HTMLInputElement>('input[name="visual_continuity"]');
                      if (input) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                        nativeInputValueSetter?.call(input, ex);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                      setShowContinuityExamples(false);
                    }}
                    className="block w-full rounded-lg bg-background/60 px-2.5 py-1.5 text-left text-xs text-foreground/80 hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Timing and continuity switches
        </p>
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3">
            <label className="flex items-start gap-2 rounded-xl bg-background/55 p-3 text-sm ring-1 ring-border/20">
              <input
                type="checkbox"
                id="dynamic-scenes"
                className="mt-1 rounded"
                {...register("dynamic_scenes")}
              />
              <span>
                <span className="block font-medium">Dynamic scenes</span>
                <span className="text-xs text-muted-foreground">
                  Let the model decide the optimal scene breakdown instead of forcing a fixed count.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 rounded-xl bg-background/55 p-3 text-sm ring-1 ring-border/20">
              <input
                type="checkbox"
                id="use-production-storyboard"
                className="mt-1 rounded"
                {...register("use_production_storyboard")}
              />
              <span>
                <span className="block font-medium">Director-style scenes</span>
                <span className="text-xs text-muted-foreground">
                  Add camera, staging, and lighting direction to every scene prompt.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 rounded-xl bg-background/55 p-3 text-sm ring-1 ring-border/20">
              <input
                type="checkbox"
                id="match-scenes-to-audio"
                className="mt-1 rounded"
                {...register("match_scenes_to_audio")}
              />
              <span>
                <span className="block font-medium">Match scenes to narration</span>
                <span className="text-xs text-muted-foreground">
                  Prevent visuals from cutting away before the current spoken beat lands.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
              <label className="mb-1 block text-sm font-medium">Pause between scenes (ms)</label>
              <Input
                type="number"
                min={0}
                max={1200}
                step={50}
                className={showError("inter_scene_pause_ms") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("inter_scene_pause_ms", { valueAsNumber: true })}
              />
              {showError("inter_scene_pause_ms") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.inter_scene_pause_ms?.message}</p>
              ) : null}
            </div>
            <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
              <label className="mb-1 block text-sm font-medium">Transition overlap (ms)</label>
              <Input
                type="number"
                min={0}
                max={800}
                step={50}
                className={showError("transition_overlap_ms") ? "border-red-500 focus-visible:ring-red-500" : undefined}
                {...register("transition_overlap_ms", { valueAsNumber: true })}
              />
              {showError("transition_overlap_ms") ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.transition_overlap_ms?.message}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <p className="text-sm font-medium">Live status</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-2.5 py-1 ${dynamicScenes ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border/60 bg-muted/30 text-muted-foreground"}`}>
                {dynamicScenes ? "Dynamic scenes on" : "Manual scene count"}
              </span>
              <span className={`rounded-full border px-2.5 py-1 ${useProductionStoryboard ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" : "border-border/60 bg-muted/30 text-muted-foreground"}`}>
                {useProductionStoryboard ? "Director prompts on" : "Standard prompts"}
              </span>
              <span className={`rounded-full border px-2.5 py-1 ${matchScenesToAudio ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" : "border-border/60 bg-muted/30 text-muted-foreground"}`}>
                {matchScenesToAudio ? "Audio synced" : "Fixed timing"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
