"use client";

import { memo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  STORY_BRIEF_ENDING_TYPE_IDS,
  STORY_BRIEF_HOOK_TYPE_IDS,
  STORY_BRIEF_PACING_PROFILE_IDS,
  STORY_BRIEF_SHOW_TELL_IDS,
  STORY_BRIEF_VISUAL_VARIETY_IDS,
  type GenerateFormValues,
} from "@/app/generate/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveStoryProfileLabel, qualityPostureTone, describeProfileSpecificTuning } from "@/lib/story-quality";

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name:
    | "story_brief.hook_type"
    | "story_brief.ending_type"
    | "story_brief.pacing_profile"
    | "story_brief.visual_variety"
    | "story_brief.show_vs_tell_priority"
    | "story_brief.horror.scare_frequency"
    | "story_brief.horror.tension_curve"
    | "story_brief.news.fact_density"
    | "story_brief.news.source_prominence"
    | "story_brief.motivational.emotional_tone"
    | "story_brief.motivational.takeaway_clarity"
    | "story_brief.mystery.clue_density"
    | "story_brief.mystery.twist_style";
  options: readonly string[];
}) {
  const { control } = useFormContext<GenerateFormValues>();
  return (
    <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={String(field.value || "")} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

export const StoryBriefCard = memo(function StoryBriefCard() {
  const { control } = useFormContext<GenerateFormValues>();
  const storyType = useWatch({ control, name: "story_type" });
  const storyTemplate = useWatch({ control, name: "story_template" });
  const storyBrief = useWatch({ control, name: "story_brief" });
  const profileLabel = resolveStoryProfileLabel(storyType, storyTemplate);
  const posture = qualityPostureTone(storyBrief);
  const tuning = describeProfileSpecificTuning(storyType, storyBrief);

  const showHorror = storyType === "scary" || storyType === "horror";
  const showNews = storyType === "news";
  const showMotivational = storyType === "motivational" || storyType === "life_pro_tips";
  const showMystery = storyType === "mystery";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Universal Story Brief
            </p>
            <p className="mt-1 text-sm font-semibold">Quality targets before generation</p>
            <p className="text-xs text-muted-foreground">
              Tune the hook, ending, pacing, and visual posture once, then let the shared story engine apply it to any content type.
            </p>
          </div>
          <div className="rounded-xl bg-background/55 px-3 py-2 ring-1 ring-border/20">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resolved profile</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{profileLabel}</p>
            <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">{posture}</p>
            {tuning ? <p className="mt-1 text-[11px] text-muted-foreground">{tuning}</p> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="Hook type" name="story_brief.hook_type" options={STORY_BRIEF_HOOK_TYPE_IDS} />
          <SelectField label="Ending type" name="story_brief.ending_type" options={STORY_BRIEF_ENDING_TYPE_IDS} />
          <SelectField label="Pacing profile" name="story_brief.pacing_profile" options={STORY_BRIEF_PACING_PROFILE_IDS} />
          <SelectField label="Visual variety" name="story_brief.visual_variety" options={STORY_BRIEF_VISUAL_VARIETY_IDS} />
          <SelectField label="Show vs tell" name="story_brief.show_vs_tell_priority" options={STORY_BRIEF_SHOW_TELL_IDS} />
        </div>
      </div>

      {showHorror ? (
        <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Horror tuning</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField label="Scare frequency" name="story_brief.horror.scare_frequency" options={["low", "medium", "high"]} />
            <SelectField label="Tension curve" name="story_brief.horror.tension_curve" options={["steady", "peaked", "escalating"]} />
          </div>
        </div>
      ) : null}

      {showNews ? (
        <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">News tuning</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField label="Fact density" name="story_brief.news.fact_density" options={["light", "balanced", "dense"]} />
            <SelectField label="Source prominence" name="story_brief.news.source_prominence" options={["minimal", "standard", "high"]} />
          </div>
        </div>
      ) : null}

      {showMotivational ? (
        <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Motivational tuning</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField label="Emotional tone" name="story_brief.motivational.emotional_tone" options={["gentle", "energetic", "intense"]} />
            <SelectField label="Takeaway clarity" name="story_brief.motivational.takeaway_clarity" options={["subtle", "balanced", "explicit"]} />
          </div>
        </div>
      ) : null}

      {showMystery ? (
        <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mystery tuning</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField label="Clue density" name="story_brief.mystery.clue_density" options={["light", "balanced", "dense"]} />
            <SelectField label="Twist style" name="story_brief.mystery.twist_style" options={["subtle", "sharp", "late"]} />
          </div>
        </div>
      ) : null}
    </div>
  );
});
