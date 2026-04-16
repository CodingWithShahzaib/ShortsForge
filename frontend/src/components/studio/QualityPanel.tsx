"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";

import { api } from "@/lib/api";
import type { Project, Scene, StoryQualityReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinearProgress } from "@/components/ui/progress-linear";
import { notify } from "@/lib/notify";

function metricVariant(value: number) {
  if (value >= 75) return "success" as const;
  if (value >= 55) return "warning" as const;
  return "error" as const;
}

export function QualityPanel({
  project,
  scenes,
  onSelectScene,
}: {
  project: Project;
  scenes: Scene[];
  onSelectScene?: (sceneId: string) => void;
}) {
  const scriptFixReport = useMemo(() => {
    const raw = project.settings?.script_fix_report;
    if (!raw || typeof raw !== "object") return null;
    return raw as {
      changed?: boolean;
      issues?: string[];
      duplicate_sentences_removed?: number;
      initialism_spacing_fixed?: boolean;
      original_word_count?: number;
      normalized_word_count?: number;
    };
  }, [project.settings]);
  const initialReport = useMemo(() => {
    const maybeReport = project.settings?.story_quality_report ?? project.settings?.quality_report;
    return maybeReport && typeof maybeReport === "object" ? maybeReport as StoryQualityReport : null;
  }, [project.settings]);
  const [report, setReport] = useState<StoryQualityReport | null>(initialReport);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await api.analyzeStoryStructure({
        story_type: project.story_type,
        story_template: typeof project.settings?.story_template === "string" ? project.settings.story_template : "default",
        story_brief:
          project.settings?.story_brief && typeof project.settings.story_brief === "object"
            ? project.settings.story_brief
            : undefined,
        script: project.script || undefined,
        scenes: scenes.map((scene) => ({
          narration: scene.narration || undefined,
          subtitle: scene.subtitle || undefined,
          image_prompt: scene.image_prompt || undefined,
          duration: scene.duration,
          transition: scene.transition_type,
          scene_type: scene.scene_type,
          scene_settings: scene.scene_settings || undefined,
        })),
      });
      setReport(result);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to analyze story structure.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/40 bg-background/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/90">
              Story quality
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shared hook, payoff, escalation, visual variety, and show-vs-tell analysis for the whole short.
            </p>
          </div>
          {report ? (
            <Badge variant={metricVariant(report.overall_score)}>
              {report.overall_score}/100
            </Badge>
          ) : null}
        </div>

        {report ? (
          <div className="mt-3 space-y-3">
            {scriptFixReport?.changed ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Script auto-fix applied
                </p>
                <div className="mt-1 space-y-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                  {(scriptFixReport.issues || []).map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {scriptFixReport.original_word_count ?? 0} → {scriptFixReport.normalized_word_count ?? 0} words
                  </Badge>
                  {(scriptFixReport.duplicate_sentences_removed || 0) > 0 ? (
                    <Badge variant="outline">
                      Removed {scriptFixReport.duplicate_sentences_removed} duplicate sentence{scriptFixReport.duplicate_sentences_removed === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{report.profile_label} profile</span>
                <span>{report.quality_posture}</span>
              </div>
              <LinearProgress value={report.overall_score} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hook</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{report.hook_score}/100</p>
              </div>
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Payoff</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{report.payoff_score}/100</p>
              </div>
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Escalation</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{report.escalation_score}/100</p>
              </div>
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Visual variety</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{report.visual_variety_score}/100</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Show/Tell {Math.round(report.show_tell_ratio * 100)}%</Badge>
              <Badge variant="outline">Repetition {report.repetition_score}/100</Badge>
              <Badge variant="outline">{report.scene_count} scenes</Badge>
              <Badge variant="outline">{report.estimated_word_count} words</Badge>
            </div>

            {report.scene_roles.length > 0 ? (
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Arc map
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.scene_roles.map((role) => (
                    <button
                      key={`${role.scene_index}-${role.role}`}
                      type="button"
                      className="rounded-full border border-border/60 bg-background/50 px-2 py-1 text-[11px] text-foreground/85 hover:bg-muted/50"
                      onClick={() => {
                        const scene = scenes[role.scene_index];
                        if (scene && onSelectScene) onSelectScene(scene.id);
                      }}
                    >
                      {`S${role.scene_index + 1} ${role.label}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {report.issues.length > 0 ? (
              <div className="space-y-2">
                {report.issues.map((issue) => {
                  const sceneIds = (issue.scene_indexes || [])
                    .map((index) => scenes[index]?.id)
                    .filter((value): value is string => Boolean(value));
                  return (
                    <button
                      key={`${issue.code}-${issue.message}`}
                      type="button"
                      className="w-full rounded-md border border-border/40 bg-card/70 px-2.5 py-2 text-left hover:bg-muted/30"
                      onClick={() => {
                        if (sceneIds[0] && onSelectScene) onSelectScene(sceneIds[0]);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "secondary"}>
                          {issue.code}
                        </Badge>
                        {issue.scene_indexes?.length ? (
                          <span className="text-[11px] text-muted-foreground">
                            {issue.scene_indexes.map((index) => `S${index + 1}`).join(", ")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.message}</p>
                      {issue.fix_hint ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-foreground/80">
                          {issue.fix_hint}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 text-xs text-muted-foreground">
                No major whole-story issues detected right now.
              </div>
            )}

            {report.suggestions.length > 0 ? (
              <div className="rounded-md border border-border/40 bg-card/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Guided fixes
                </p>
                <div className="mt-2 space-y-1.5">
                  {report.suggestions.map((suggestion) => (
                    <p key={suggestion} className="text-xs leading-relaxed text-foreground/90">
                      {suggestion}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-border/40 bg-card/70 px-2.5 py-2 text-xs text-muted-foreground">
            Run analysis to get a whole-story quality report before exporting.
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={() => void runAnalysis()}
        loading={analyzing}
        loadingLabel="Analyzing…"
      >
        {report ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        {report ? "Refresh Story Analysis" : "Analyze Story Structure"}
      </Button>
    </div>
  );
}
