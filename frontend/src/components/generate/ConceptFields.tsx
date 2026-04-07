"use client";

import { memo, useState } from "react";
import { motion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { GenerateFormValues } from "@/app/generate/schema";
import { fieldFocusVariants, prefersReducedMotion } from "@/lib/micro-interactions";

type Props = {
  generating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  generateLabel?: string;
  showInlineAction?: boolean;
};

export const ConceptFields = memo(function ConceptFields({
  generating,
  canGenerate,
  onGenerate,
  generateLabel = "Create scenes",
  showInlineAction = true,
}: Props) {
  const {
    register,
    formState: { errors, touchedFields, submitCount },
  } = useFormContext<GenerateFormValues>();
  const showTitleError = (touchedFields.title || submitCount > 0) && !!errors.title;
  const [titleFocused, setTitleFocused] = useState(false);
  const reduceMotion = prefersReducedMotion();
  const titleField = register("title");

  return (
    <div
      role="tabpanel"
      id="content-panel-concept"
      aria-labelledby="content-tab-concept"
      className="space-y-3"
    >
      <div className="rounded-2xl border border-border/70 bg-background/45 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Premise</p>
            <p className="text-sm text-muted-foreground">Use one high-signal concept line. You can shape structure, pacing, visuals, and dialogue below.</p>
          </div>
        </div>
        <Field
          id="gen-title"
          applyIdToChild={false}
          label={
            <span className="inline-flex items-center gap-2">
              <Play className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-hidden />
              Title / Concept
            </span>
          }
          required
          className="space-y-1.5"
          error={showTitleError ? (errors.title?.message as string) || "Please enter a concept or switch to script mode." : undefined}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <motion.div
              className="min-w-0 flex-1 rounded-md"
              variants={fieldFocusVariants}
              initial="initial"
              animate={!reduceMotion && titleFocused ? "focus" : "initial"}
            >
              <Input
                id="gen-title"
                placeholder="e.g., 5 Mysterious Places on Earth..."
                className={`h-12 text-sm ${showTitleError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                {...titleField}
                onBlur={(e) => {
                  void titleField.onBlur(e);
                  setTitleFocused(false);
                }}
                onFocus={() => setTitleFocused(true)}
              />
            </motion.div>
            {showInlineAction ? (
              <Button
                type="button"
                variant="animated"
                className="h-10 w-full shrink-0 px-3 text-sm font-semibold sm:w-auto sm:min-w-40"
                disabled={!canGenerate || generating}
                onClick={onGenerate}
              >
                {generating ? (
                  <>
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />{" "}
                    Generating…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 shrink-0" /> {generateLabel}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </Field>
      </div>
    </div>
  );
});
