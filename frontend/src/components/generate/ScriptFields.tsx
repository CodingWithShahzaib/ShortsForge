"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import type { GenerateFormValues } from "@/app/generate/schema";
import { FileText } from "lucide-react";

export const ScriptFields = memo(function ScriptFields() {
  const { register, watch } = useFormContext<GenerateFormValues>();
  const script = watch("custom_script");
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
      <Textarea
        placeholder="Paste your script here..."
        rows={6}
        {...register("custom_script")}
        aria-describedby="script-stats-hint"
      />
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
