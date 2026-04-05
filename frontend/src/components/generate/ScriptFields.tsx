"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import { FileText, Play } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { GenerateFormValues } from "@/app/generate/schema";

type Props = {
  generating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  generateLabel?: string;
  showInlineAction?: boolean;
};

export const ScriptFields = memo(function ScriptFields({
  generating,
  canGenerate,
  onGenerate,
  generateLabel = "Create scenes",
  showInlineAction = true,
}: Props) {
  const {
    register,
    watch,
    formState: { errors, touchedFields, submitCount },
  } = useFormContext<GenerateFormValues>();
  const script = watch("custom_script");
  const showScriptError = (touchedFields.custom_script || submitCount > 0) && !!errors.custom_script;
  const stats = useMemo(() => {
    const trimmed = script.trim();
    if (!trimmed) return { words: 0, readMin: 0 };
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const readMin = Math.max(1, Math.round(words / 150) || 1);
    return { words, readMin };
  }, [script]);

  return (
    <div
      role="tabpanel"
      id="content-panel-script"
      aria-labelledby="content-tab-script"
      className="space-y-2"
    >
      <Field
        id="custom-script"
        applyIdToChild={false}
        label={
          <span className="inline-flex items-center gap-2">
            <Play className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-hidden />
            Script
          </span>
        }
        required
        error={showScriptError ? (errors.custom_script?.message as string) || "Please provide a script to continue." : undefined}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <Textarea
            placeholder="Paste your script here..."
            rows={6}
            className={`min-h-[140px] flex-1 lg:min-h-[180px] ${showScriptError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            {...register("custom_script")}
            id="custom-script"
            aria-describedby="script-stats-hint"
          />
          {showInlineAction ? (
            <Button
              type="button"
              variant="animated"
              className="h-11 w-full shrink-0 px-4 text-sm font-semibold lg:mt-0 lg:w-44"
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
      <div id="script-stats-hint" className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          ~{stats.words} words · ~{stats.readMin} min read (voice pacing varies)
        </span>
        {script.trim().length > 0 && (
          <Link
            href="/scripts"
            className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            Refine in Script studio
          </Link>
        )}
      </div>
    </div>
  );
});
