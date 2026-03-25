"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import type { GenerateFormValues } from "@/app/generate/schema";
import { FileText } from "lucide-react";

export const ScriptFields = memo(function ScriptFields() {
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
        label="Script"
        required
        error={showScriptError ? (errors.custom_script?.message as string) || "Please provide a script to continue." : undefined}
      >
        <Textarea
          placeholder="Paste your script here..."
          rows={6}
          className={showScriptError ? "border-red-500 focus-visible:ring-red-500" : undefined}
          {...register("custom_script")}
          aria-describedby="script-stats-hint"
        />
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
            Refine in Scripts
          </Link>
        )}
      </div>
    </div>
  );
});
