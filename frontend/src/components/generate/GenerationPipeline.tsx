"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2, Minus } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { api } from "@/lib/api";
import type { PipelineStepState } from "@/lib/types";
import {
  buildEngineStageStates,
  engineStageLabel,
  inferCurrentStage,
  inferTargetStage,
  summarizeEngineOutcome,
} from "@/lib/engine-pipeline";
import { pickLatestAsset } from "@/components/projects/scene-assets";
import { cn } from "@/lib/utils";

function normalizeStep(s: string): PipelineStepState {
  const v = (s || "").toLowerCase();
  if (v === "complete" || v === "processing" || v === "pending" || v === "failed" || v === "skipped") {
    return v as PipelineStepState;
  }
  return "pending";
}

function StepDot({ state }: { state: PipelineStepState }) {
  if (state === "complete") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />;
  }
  if (state === "processing") {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" aria-hidden />;
  }
  if (state === "failed") {
    return (
      <span className="text-[10px] font-semibold text-destructive" aria-hidden>
        !
      </span>
    );
  }
  return <Minus className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />;
}

const labels: { key: "storyboard" | "image" | "tts"; short: string }[] = [
  { key: "storyboard", short: "Plan" },
  { key: "image", short: "Img" },
  { key: "tts", short: "Voice" },
];

export const GenerationPipeline = memo(function GenerationPipeline() {
  const jobs = useProjectStore((s) => s.jobs);
  const jobDetails = useProjectStore((s) => s.jobDetails);
  const jobPipelines = useProjectStore((s) => s.jobPipelines);

  const activeJob = useMemo(
    () =>
      jobs.find(
        (j) =>
          j.type === "video_render" &&
          (j.status === "queued" || j.status === "in_progress") &&
          j.project_id,
      ),
    [jobs],
  );

  const projectId = activeJob?.project_id;
  const wsPipeline = activeJob ? jobPipelines[activeJob.id] : undefined;

  const { data: project } = useQuery({
    queryKey: ["generate", "pipeline-project", projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
    refetchInterval: activeJob ? 2000 : false,
  });

  const scenes = useMemo(() => {
    if (project?.scenes?.length) {
      return [...project.scenes].sort((a, b) => a.order_index - b.order_index);
    }
    return null;
  }, [project]);

  const rows = useMemo(() => {
    if (scenes?.length) {
      return scenes.map((scene, idx) => {
        const hasImage = !!pickLatestAsset(scene.assets, "image");
        const hasAudio = !!pickLatestAsset(scene.assets, "audio");
        return {
          index: idx,
          sceneId: scene.id,
          storyboard: "complete" as PipelineStepState,
          image: hasImage ? ("complete" as const) : ("pending" as const),
          tts: hasAudio ? ("complete" as const) : ("pending" as const),
        };
      });
    }
    const fromWs = wsPipeline?.scenes;
    if (fromWs?.length) {
      return fromWs.map((s) => ({
        index: s.index,
        sceneId: undefined as string | undefined,
        storyboard: normalizeStep(String(s.storyboard)),
        image: normalizeStep(String(s.image)),
        tts: normalizeStep(String(s.tts)),
      }));
    }
    return [];
  }, [scenes, wsPipeline]);

  if (!activeJob) {
    return null;
  }

  const detail = jobDetails[activeJob.id] || "";
  const busy = activeJob.status === "queued" || activeJob.status === "in_progress";
  const stageRows = buildEngineStageStates(activeJob, wsPipeline, detail);
  const currentStage = inferCurrentStage(activeJob, wsPipeline, detail);
  const targetStage = inferTargetStage(activeJob, wsPipeline, detail);
  const shouldShowSceneRows = rows.length > 0 && targetStage !== "storyboard" && currentStage !== "storyboard";
  const helperText = detail || summarizeEngineOutcome(activeJob, wsPipeline, detail);

  return (
    <div
      className="section-neon section-neon--pipeline rounded-xl border border-border bg-card text-card-foreground shadow-sm"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">Creation progress</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {helperText}
        </p>
      </div>
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {stageRows.map((stage) => (
            <div
              key={stage.stage}
              className={cn(
                "min-w-[112px] rounded-lg border px-3 py-2",
                stage.state === "processing" && "border-sky-500/30 bg-sky-500/5",
                stage.state === "complete" && "border-emerald-500/25 bg-emerald-500/5",
                stage.state === "failed" && "border-destructive/30 bg-destructive/5",
                (stage.state === "pending" || stage.state === "skipped") && "border-border bg-muted/15",
              )}
            >
              <div className="flex items-center gap-2">
                <StepDot state={stage.state} />
                <span className="text-xs font-medium">{stage.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {!shouldShowSceneRows ? (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          {busy ? `Working on ${engineStageLabel(currentStage).toLowerCase()}... ${activeJob.progress}%` : helperText}
        </div>
      ) : (
        <div className="p-2.5">
          <div className="mb-2 px-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            Scene asset prep
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {rows.map((row) => (
                <motion.div
                  layout
                  key={`${row.index}-${row.sceneId ?? "pending"}`}
                  className={cn(
                    "w-[100px] shrink-0 rounded-lg border px-2 py-2 text-center",
                    busy ? "border-sky-500/30 bg-sky-500/5" : "border-border bg-muted/20",
                  )}
                >
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Scene {row.index + 1}</p>
                  <div className="flex justify-center gap-1">
                    {labels.map(({ key, short }) => (
                      <div
                        key={key}
                        className="flex flex-col items-center gap-0.5"
                        title={`${key}: ${row[key]}`}
                      >
                        <StepDot state={row[key]} />
                        <span className="text-[9px] text-muted-foreground">{short}</span>
                      </div>
                    ))}
                  </div>
                  {projectId ? (
                    <Link
                      href={`/projects/${projectId}/studio`}
                      className="mt-2 inline-block text-[10px] text-primary hover:underline"
                    >
                      Studio
                    </Link>
                  ) : null}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
