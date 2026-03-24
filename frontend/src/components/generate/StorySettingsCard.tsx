"use client";

import { memo, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STORY_TEMPLATE_IDS, type GenerateFormValues } from "@/app/generate/schema";
import { useStoryTemplatesQuery } from "@/lib/queries/generateCatalog";

type Provider = { name: string; configured: boolean };

type Props = {
  storyTypes: { id: string; name: string }[];
  llmProviders: Provider[];
};

export const StorySettingsCard = memo(function StorySettingsCard({ storyTypes, llmProviders }: Props) {
  const { control, register } = useFormContext<GenerateFormValues>();
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

  return (
    <>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Creation mode</label>
        <Controller
          control={control}
          name="control_mode"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autopilot">Autopilot — AI creates images and voice, then you compile</SelectItem>
                <SelectItem value="co_pilot">Co-pilot — storyboard only; add assets per scene in the editor</SelectItem>
                <SelectItem value="manual">Manual — storyboard first (same as co-pilot entry)</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Co-pilot and Manual skip automatic image and TTS until you generate them on the project page.
        </p>
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Story Type</label>
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
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Narrative structure</label>
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
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Script length (words)</label>
          <Input
            type="number"
            min={150}
            max={800}
            {...register("word_count", { valueAsNumber: true })}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Longer scripts = more substantial narration</p>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">LLM Provider</label>
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
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Scenes</label>
          <Input
            type="number"
            min={2}
            max={15}
            {...register("scene_count", { valueAsNumber: true })}
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Scene Duration (seconds)</label>
        <Input
          type="number"
          min={1}
          max={60}
          step={0.5}
          {...register("scene_duration", { valueAsNumber: true })}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Applies to each scene; auto-extends to match narration.
        </p>
      </div>
    </>
  );
});
