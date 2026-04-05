"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  AudioLines,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Download,
  FileText,
  Film,
  FolderOpen,
  Images,
  Layers,
  LibraryBig,
  RefreshCw,
  Sparkles,
  Subtitles,
} from "lucide-react";
import ReactPlayer from "react-player";

import type { EngineStage, EngineStageState, Job, Project, Scene } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import { cn } from "@/lib/utils";
import CelebrationOverlay from "./CelebrationOverlay";

type StageStatePresentation = {
  stage: EngineStage;
  label: string;
  state: EngineStageState;
};

type SurfaceStatus =
  | "blocked"
  | "ready"
  | "queued"
  | "working"
  | "finalizing"
  | "completed"
  | "stale"
  | "failed";

type RenderActivityMode =
  | "queued"
  | "storyboard"
  | "assets"
  | "audio"
  | "subtitles"
  | "concat"
  | "finalizing"
  | "render";

interface CompileStepProps {
  project: Project;
  scenes: Scene[];
  isCompiling: boolean;
  jobProgress: number;
  progressDetail?: string;
  activeJob?: Job | null;
  activeStage?: EngineStage | null;
  stageStates?: StageStatePresentation[];
  completedVideoUrl: string | null;
  videoIsStale?: boolean;
  lastCompiledAt?: string | null;
  compileFailed?: boolean;
  failureMessage?: string;
  onRetryCompile?: () => void | Promise<void>;
  pipelineBusy?: boolean;
  hasReadyAssets?: boolean;
  onStartCompile: () => void;
  onBack: () => void;
}

const TIPS = [
  "You can keep editing scene order and timing before exporting again.",
  "The export stage uses your current scene timing, subtitles, and transitions.",
  "A previous successful export can stay available while a fresh render is running.",
  "If pacing feels off in the final video, return to Arrange and tweak durations first.",
];

const STAGE_META: Record<
  EngineStage,
  { icon: typeof FileText; description: string }
> = {
  storyboard: {
    icon: FileText,
    description: "Validate story structure and spoken copy",
  },
  assets: {
    icon: Images,
    description: "Confirm visuals and voice assets are ready",
  },
  compile: {
    icon: Clapperboard,
    description: "Build the final export from scenes, subtitles, and audio",
  },
};

function getSurfaceBadgeVariant(status: SurfaceStatus) {
  if (status === "completed") return "success" as const;
  if (status === "stale" || status === "ready" || status === "queued") return "warning" as const;
  if (status === "working" || status === "finalizing") return "inProgress" as const;
  if (status === "failed") return "error" as const;
  return "secondary" as const;
}

function getStageStateLabel(state: EngineStageState): string {
  if (state === "complete") return "Done";
  if (state === "processing") return "Active";
  if (state === "failed") return "Failed";
  if (state === "skipped") return "Skipped";
  return "Pending";
}

function getStageStateClasses(state: EngineStageState): string {
  if (state === "complete") {
    return "border-emerald-500/25 bg-emerald-500/5";
  }
  if (state === "processing") {
    return "border-cyan-500/25 bg-cyan-500/5";
  }
  if (state === "failed") {
    return "border-rose-500/25 bg-rose-500/5";
  }
  return "border-border/50 bg-muted/25";
}

function clampDisplayedProgress(progress: number, isActive: boolean): number {
  const safe = Math.min(Math.max(progress, 0), 100);
  return isActive ? Math.min(safe, 99) : safe;
}

function inferRenderActivityMode(
  detail: string | undefined,
  stage: EngineStage | null | undefined,
  status: SurfaceStatus,
): RenderActivityMode {
  if (status === "queued") return "queued";
  if (status === "finalizing") return "finalizing";

  const normalized = (detail || "").toLowerCase();
  if (normalized.includes("concat")) return "concat";
  if (normalized.includes("subtitle")) return "subtitles";
  if (normalized.includes("audio") || normalized.includes("speech") || normalized.includes("voice")) return "audio";
  if (normalized.includes("image") || normalized.includes("asset") || normalized.includes("visual")) return "assets";
  if (stage === "storyboard") return "storyboard";
  if (stage === "assets") return "assets";
  return "render";
}

function RenderActivityPanel({
  mode,
  progress,
  detail,
  sceneCount,
}: {
  mode: RenderActivityMode;
  progress: number;
  detail: string;
  sceneCount: number;
}) {
  const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const stageItems = [
    { id: "storyboard", label: "Storyboard check", active: mode === "storyboard" || mode === "queued" },
    { id: "assets", label: "Asset stitching", active: mode === "assets" || mode === "concat" },
    { id: "audio", label: "Audio mix", active: mode === "audio" },
    { id: "subtitles", label: "Subtitle burn-in", active: mode === "subtitles" },
    { id: "finalizing", label: "Final package", active: mode === "finalizing" || mode === "render" },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-border/50 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Live export status</p>
        <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
          {roundedProgress}%
        </span>
      </div>
      <LinearProgress value={roundedProgress} className="mt-3 h-2.5" />
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {stageItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              item.active
                ? "border-primary/35 bg-primary/5 text-foreground"
                : "border-border/50 bg-background/70 text-muted-foreground",
            )}
          >
            <p className="font-medium">{item.label}</p>
            {item.id === "storyboard" ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {sceneCount} scene{sceneCount !== 1 ? "s" : ""} included
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompileStep({
  project,
  scenes,
  isCompiling,
  jobProgress,
  progressDetail,
  activeJob,
  activeStage,
  stageStates,
  completedVideoUrl,
  videoIsStale = false,
  lastCompiledAt,
  compileFailed = false,
  failureMessage,
  onRetryCompile,
  pipelineBusy = false,
  hasReadyAssets,
  onStartCompile,
  onBack,
}: CompileStepProps) {
  const router = useRouter();
  const sceneCount = scenes.length;
  const narratedScenes = scenes.filter((scene) => ((scene.narration || scene.subtitle || "").trim())).length;
  const imageReadyCount = scenes.filter((scene) => scene.assets.some((asset) => asset.type === "image" && asset.is_active !== false)).length;
  const audioReadyCount = scenes.filter((scene) => scene.assets.some((asset) => asset.type === "audio" && asset.is_active !== false)).length;
  const allAssetsReady = hasReadyAssets ?? (
    sceneCount > 0
    && narratedScenes === sceneCount
    && imageReadyCount === sceneCount
    && audioReadyCount === sceneCount
  );

  const interScenePauseMs = Number.isFinite(Number(project.settings?.inter_scene_pause_ms))
    ? Math.max(0, Number(project.settings?.inter_scene_pause_ms))
    : 600;
  const transitionOverlapMs = Number.isFinite(Number(project.settings?.transition_overlap_ms))
    ? Math.max(0, Number(project.settings?.transition_overlap_ms))
    : 250;

  const [dismissedCelebrationUrl, setDismissedCelebrationUrl] = useState<string | null>(null);
  const showCelebration = Boolean(
    completedVideoUrl && !isCompiling && completedVideoUrl !== dismissedCelebrationUrl,
  );

  const handleCelebrationDone = useCallback(() => {
    setDismissedCelebrationUrl(completedVideoUrl);
  }, [completedVideoUrl]);

  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    if (!isCompiling) return;
    const intervalId = setInterval(() => setTipIdx((current) => (current + 1) % TIPS.length), 5000);
    return () => clearInterval(intervalId);
  }, [isCompiling]);

  const checklist = useMemo(
    () => [
      { icon: Film, label: `Render ${sceneCount} scene${sceneCount !== 1 ? "s" : ""}` },
      { icon: ArrowLeftRight, label: "Blend transitions between scenes" },
      { icon: Subtitles, label: "Burn subtitles into the final export" },
      { icon: AudioLines, label: "Normalize and mix voice audio" },
      { icon: Layers, label: "Apply optional overlays and finishing effects" },
    ],
    [sceneCount],
  );

  const displayedProgress = clampDisplayedProgress(
    jobProgress,
    isCompiling && (activeJob?.status === "queued" || activeJob?.status === "in_progress"),
  );

  const phaseCards = useMemo<StageStatePresentation[]>(() => {
    if (stageStates?.length) return stageStates;
    return [
      {
        stage: "storyboard",
        label: "Storyboard",
        state: narratedScenes === sceneCount && sceneCount > 0 ? "complete" : "pending",
      },
      {
        stage: "assets",
        label: "Assets",
        state: allAssetsReady ? "complete" : "pending",
      },
      {
        stage: "compile",
        label: "Export",
        state: completedVideoUrl && !videoIsStale ? "complete" : "pending",
      },
    ];
  }, [stageStates, narratedScenes, sceneCount, allAssetsReady, completedVideoUrl, videoIsStale]);

  const surfaceStatus: SurfaceStatus = useMemo(() => {
    if (compileFailed) return "failed";
    if (isCompiling && activeJob?.status === "queued") return "queued";
    if (isCompiling && displayedProgress >= 99) return "finalizing";
    if (isCompiling) return "working";
    if (completedVideoUrl && videoIsStale) return "stale";
    if (completedVideoUrl) return "completed";
    if (allAssetsReady) return "ready";
    return "blocked";
  }, [compileFailed, isCompiling, activeJob?.status, displayedProgress, completedVideoUrl, videoIsStale, allAssetsReady]);
  const renderActivityMode = useMemo(
    () => inferRenderActivityMode(progressDetail, activeStage, surfaceStatus),
    [progressDetail, activeStage, surfaceStatus],
  );

  const statusCopy = useMemo(() => {
    const stageLabel =
      activeStage === "storyboard"
        ? "Storyboard"
        : activeStage === "assets"
          ? "Assets"
          : "Export";

    switch (surfaceStatus) {
      case "queued":
        return {
          eyebrow: "Queued for export",
          title: "The render job is waiting to start.",
          description: progressDetail?.trim() || `The backend has accepted the request and will begin ${stageLabel.toLowerCase()} work shortly.`,
        };
      case "working":
        return {
          eyebrow: stageLabel,
          title: "Rendering is underway.",
          description: progressDetail?.trim() || `The backend is currently running the ${stageLabel.toLowerCase()} stage.`,
        };
      case "finalizing":
        return {
          eyebrow: "Finalizing export",
          title: "The video is being wrapped up and saved.",
          description: progressDetail?.trim() || "The render pass is almost done. The export is finishing storage and final output work.",
        };
      case "completed":
        return {
          eyebrow: "Export ready",
          title: "Your final video export is ready.",
          description: "This preview matches the latest successful export and is ready to download or share.",
        };
      case "stale":
        return {
          eyebrow: "Export outdated",
          title: "A previous export is available, but the project has changed.",
          description: "The preview below is from an older successful render. Export again to produce a new final video.",
        };
      case "failed":
        return {
          eyebrow: "Render failed",
          title: "The last export attempt did not finish.",
          description: failureMessage?.trim() || "Review the failure details below, then retry export when you are ready.",
        };
      case "ready":
        return {
          eyebrow: "Ready to export",
          title: "Everything needed for the final render is in place.",
          description: "Scenes, visuals, voice audio, and timing are ready. Start export when you are happy with the arrangement.",
        };
      case "blocked":
      default:
        return {
          eyebrow: "Export is blocked",
          title: "Finish scene prep before exporting.",
          description: "The backend can only produce a final render once narration, visuals, and audio are ready for every scene.",
        };
    }
  }, [surfaceStatus, activeStage, progressDetail, failureMessage]);

  const failureNotice = compileFailed && onRetryCompile ? (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Latest export attempt failed</p>
          <p className="mt-1 wrap-break-word text-muted-foreground">
            {failureMessage?.trim() || "The render did not complete."}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-3"
            loading={pipelineBusy}
            loadingLabel="Retrying..."
            onClick={() => void onRetryCompile()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry export
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  if (completedVideoUrl && !isCompiling) {
    return (
      <>
        <CelebrationOverlay show={showCelebration} onDone={handleCelebrationDone} />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6"
        >
          {failureNotice}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <section className="overflow-hidden rounded-3xl border border-border/50 bg-card/85 shadow-sm">
              <div className="border-b border-border/40 px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getSurfaceBadgeVariant(surfaceStatus)}>{statusCopy.eyebrow}</Badge>
                  <Badge variant="outline">{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</Badge>
                  {lastCompiledAt ? (
                    <Badge variant="secondary">
                      {new Date(lastCompiledAt).toLocaleString()}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{statusCopy.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{statusCopy.description}</p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="overflow-hidden rounded-3xl border border-border/40 bg-black shadow-2xl">
                  <ReactPlayer
                    src={completedVideoUrl}
                    controls
                    width="100%"
                    height="auto"
                    style={{ maxHeight: "72vh" }}
                  />
                </div>
              </div>
            </section>

            <aside className="flex flex-col gap-4">
              <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Export snapshot
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scenes</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{sceneCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtitles</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">Included</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pause</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{interScenePauseMs}ms</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overlap</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{transitionOverlapMs}ms</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p>
                    {videoIsStale
                      ? "This preview reflects the last successful export, not the latest project edits."
                      : "This preview reflects the latest successful export from the backend."}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Next actions
                </p>
                <div className="mt-4 grid gap-3">
                  <Button
                    variant={videoIsStale ? "primary" : "outline"}
                    size="lg"
                    onClick={onStartCompile}
                    loading={pipelineBusy}
                    loadingLabel={videoIsStale ? "Exporting..." : "Starting export..."}
                    className="justify-center"
                  >
                    <Clapperboard className="h-4 w-4" />
                    {videoIsStale ? "Export latest version" : "Export again"}
                  </Button>
                  <Button variant="primary" size="lg" asChild>
                    <a href={completedVideoUrl} download>
                      <Download className="h-4 w-4" />
                      Download export
                    </a>
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => router.push(`/projects/${project.id}`)}>
                    <FolderOpen className="h-4 w-4" />
                    Open project
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => router.push("/projects")}>
                    <LibraryBig className="h-4 w-4" />
                    Back to library
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </motion.div>
      </>
    );
  }

  if (isCompiling) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <section className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/85 shadow-sm">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_42%),radial-gradient(circle_at_bottom_right,hsl(190_100%_55%/0.1),transparent_36%)]" />
            <div className="relative p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getSurfaceBadgeVariant(surfaceStatus)}>{statusCopy.eyebrow}</Badge>
                <Badge variant="outline">{activeStage ? STAGE_META[activeStage].description : STAGE_META.compile.description}</Badge>
                {activeJob?.id ? (
                  <Badge variant="secondary">job #{activeJob.id.slice(0, 8)}</Badge>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {statusCopy.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    {statusCopy.description}
                  </p>
                </div>
                <div className="rounded-3xl border border-border/50 bg-background/55 px-5 py-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Engine progress
                  </p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-5xl font-semibold tracking-tight tabular-nums text-foreground">
                      {Math.round(displayedProgress)}
                    </span>
                    <span className="pb-1 text-sm font-medium text-muted-foreground">%</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Progress is treated as advisory until the backend marks the job completed.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-border/40 bg-background/55 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">Render activity</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(displayedProgress)}%</span>
                </div>
                <LinearProgress value={displayedProgress} className="mt-3 h-2.5" />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={progressDetail || statusCopy.description}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-3 text-sm leading-6 text-muted-foreground"
                  >
                    {progressDetail?.trim() || statusCopy.description}
                  </motion.p>
                </AnimatePresence>
              </div>

              <RenderActivityPanel
                mode={renderActivityMode}
                progress={displayedProgress}
                detail={progressDetail?.trim() || statusCopy.description}
                sceneCount={sceneCount}
              />

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {phaseCards.map((phase) => {
                  const Icon = STAGE_META[phase.stage].icon;
                  return (
                    <div
                      key={phase.stage}
                      className={`rounded-2xl border p-4 shadow-sm ${getStageStateClasses(phase.state)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/70 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <Badge variant={phase.state === "failed" ? "error" : phase.state === "processing" ? "inProgress" : phase.state === "complete" ? "success" : "secondary"}>
                          {getStageStateLabel(phase.state)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{phase.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {STAGE_META[phase.stage].description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Arrange
                </Button>
                <Button variant="secondary" disabled>
                  <Clock3 className="h-4 w-4" />
                  Render in progress
                </Button>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Current export context
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scenes</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{sceneCount}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Narration</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{narratedScenes}/{sceneCount || 0}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Images</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{imageReadyCount}/{sceneCount || 0}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{audioReadyCount}/{sceneCount || 0}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Inter-scene pause</span>
                  <span className="font-semibold text-foreground">{interScenePauseMs}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Transition overlap</span>
                  <span className="font-semibold text-foreground">{transitionOverlapMs}ms</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Previous export
              </p>
              {completedVideoUrl ? (
                <div className="mt-3 rounded-2xl border border-border/50 bg-background/45 p-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    The last successful export is preserved in the background while the new render runs, but it is hidden here so the screen does not look frozen on an old frame.
                  </p>
                  <div className="mt-4 rounded-2xl border border-dashed border-cyan-300/15 bg-[linear-gradient(180deg,rgba(10,18,26,0.8),rgba(6,11,17,0.95))] px-4 py-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                      Stored export snapshot
                    </p>
                    <p className="mt-2 text-sm text-slate-300/75">
                      Download becomes available again as soon as the active render finishes.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-background/45 px-4 py-6 text-sm leading-6 text-muted-foreground">
                  No successful export is available yet. This area will show the latest finished video once the backend completes the render.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Render guidance
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={tipIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-3 text-sm leading-6 text-muted-foreground"
                >
                  {TIPS[tipIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </aside>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6"
    >
      {failureNotice}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <section className="overflow-hidden rounded-3xl border border-border/50 bg-card/85 shadow-sm">
          <div className="border-b border-border/40 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getSurfaceBadgeVariant(surfaceStatus)}>{statusCopy.eyebrow}</Badge>
              <Badge variant="outline">{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</Badge>
              <Badge variant="secondary">Subtitles included</Badge>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {statusCopy.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {statusCopy.description}
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scenes</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{sceneCount}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Narration</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{narratedScenes}/{sceneCount || 0}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Images</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{imageReadyCount}/{sceneCount || 0}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{audioReadyCount}/{sceneCount || 0}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {phaseCards.map((phase) => {
                const Icon = STAGE_META[phase.stage].icon;
                return (
                  <div
                    key={phase.stage}
                    className={`rounded-2xl border p-4 shadow-sm ${getStageStateClasses(phase.state)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/70 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <Badge variant={phase.state === "complete" ? "success" : "secondary"}>
                        {getStageStateLabel(phase.state)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{phase.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {STAGE_META[phase.stage].description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_320px]">
              <ul className="space-y-3">
                {checklist.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{label}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-3xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/90">
                  Render settings
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span>Inter-scene pause</span>
                    <span className="font-semibold text-foreground">{interScenePauseMs}ms</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Transition overlap</span>
                    <span className="font-semibold text-foreground">{transitionOverlapMs}ms</span>
                  </div>
                  <p className="pt-1 leading-6">
                    If the final export feels rushed or too static, go back to Arrange to adjust timing and then export again.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Latest export
            </p>
            {completedVideoUrl ? (
              <>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {videoIsStale
                    ? "A previous export is available. Exporting again will replace it with a fresh final video."
                    : "You already have a successful export. Export again if you changed scenes, timing, or settings."}
                </p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-border/40 bg-black">
                  <ReactPlayer
                    src={completedVideoUrl}
                    controls
                    width="100%"
                    height="auto"
                  />
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-border/60 bg-background/45 px-4 py-6 text-sm leading-6 text-muted-foreground">
                No successful export exists yet. Start export to produce the first final video for this project.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border/50 bg-card/80 p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Next action
            </p>
            <div className="mt-4 grid gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={onStartCompile}
                loading={pipelineBusy}
                loadingLabel="Starting export..."
                disabled={!allAssetsReady}
              >
                <Clapperboard className="h-4 w-4" />
                Export final video
              </Button>
              <Button variant="outline" size="lg" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
                Back to Arrange
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
