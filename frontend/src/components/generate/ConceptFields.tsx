"use client";

import { memo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { GenerateFormValues } from "@/app/generate/schema";

const SNIPPETS: Record<string, string[]> = {
  scary: [
    "Three hikers ignored the warning signs on the mountain trail. By nightfall, only footprints remained—leading back to the cabin they had left hours ago.",
  ],
  mystery: [
    "The antique shop owner swore the pocket watch had never been opened. When it ticked at midnight, the buyer finally understood why.",
  ],
  bedtime: [
    "A sleepy fox follows a trail of fireflies through a quiet forest until the moon tucks everyone in beneath the pines.",
  ],
  philosophy: [
    "What if the thoughts you dismiss as distractions are the only honest signals your mind still sends?",
  ],
  life_pro_tips: [
    "Five tiny habits that compound: a two-minute reset between tasks, one clear priority before noon, and saying no once a day on purpose.",
  ],
  fun_facts: [
    "Why your brain confuses déjà vu with prediction, and what that says about memory, pattern recognition, and time.",
  ],
  motivational: [
    "You do not need a perfect plan—you need one honest step today that your future self will thank you for.",
  ],
  science: [
    "How bioluminescence turns ordinary oceans into living constellations, and what it teaches us about energy on a budget.",
  ],
  history: [
    "The forgotten postal route that carried secret messages across a divided city—and the riders who never made the history books.",
  ],
  general: [
    "Five mysterious places on Earth that scientists still argue about, from singing sands to lights that appear without a storm.",
  ],
};

export const ConceptFields = memo(function ConceptFields() {
  const {
    register,
    setValue,
    control,
    formState: { errors, touchedFields, submitCount },
  } = useFormContext<GenerateFormValues>();
  const storyType = useWatch({ control, name: "story_type" });
  const examples = SNIPPETS[storyType] ?? SNIPPETS.general;
  const showTitleError = (touchedFields.title || submitCount > 0) && !!errors.title;

  return (
    <div
      role="tabpanel"
      id="content-panel-concept"
      aria-labelledby="content-tab-concept"
      className="space-y-3"
    >
      <Field
        id="gen-title"
        label="Title / Concept"
        required
        error={showTitleError ? (errors.title?.message as string) || "Please enter a concept or switch to script mode." : undefined}
      >
        <Input
          placeholder="e.g., 5 Mysterious Places on Earth..."
          className={showTitleError ? "border-red-500 focus-visible:ring-red-500" : undefined}
          {...register("title")}
        />
      </Field>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 dark:text-slate-400">Try an example:</span>
        {examples.map((text, i) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setValue("title", text, { shouldDirty: true })}
          >
            Example {i + 1}
          </Button>
        ))}
      </div>
    </div>
  );
});
