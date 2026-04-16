"use client";

import { memo, type ReactNode, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { AlertTriangle, FileText, Play, WandSparkles } from "lucide-react";
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
  footerAction?: ReactNode;
  scriptFixWarning?: string[];
  scriptFixLoading?: boolean;
  onAutoFixScript?: () => void;
};

export const ScriptFields = memo(function ScriptFields({
  generating,
  canGenerate,
  onGenerate,
  generateLabel = "Create scenes",
  showInlineAction = true,
  footerAction,
  scriptFixWarning = [],
  scriptFixLoading = false,
  onAutoFixScript,
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
      className="space-y-3"
    >
      <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Script source</p>
            <p className="text-sm text-muted-foreground">Paste the exact story beats and speaker lines you want the pipeline to respect.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
              ~{stats.words} words
            </span>
            <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
              ~{stats.readMin} min read
            </span>
          </div>
        </div>
      </div>

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
            className={`min-h-[180px] flex-1 rounded-2xl bg-background/45 lg:min-h-[240px] ${showScriptError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
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
        {script.trim().length > 0
          ? footerAction || (
            <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
              <FileText className="h-3.5 w-3.5" />
              Script ready
            </span>
          )
          : null}
      </div>
      {scriptFixWarning.length > 0 ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Script cleanup recommended
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-amber-800/90 dark:text-amber-200/90">
                {scriptFixWarning.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
            {onAutoFixScript ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAutoFixScript}
                loading={scriptFixLoading}
                loadingLabel="Fixing…"
                className="shrink-0"
              >
                <WandSparkles className="h-3.5 w-3.5" />
                Auto-fix
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
