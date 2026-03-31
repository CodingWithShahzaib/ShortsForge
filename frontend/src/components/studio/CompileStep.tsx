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
    description: "Render scenes, subtitles, overlays, and final audio mix",
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
  const sceneTiles = Array.from({ length: Math.min(Math.max(sceneCount, 3), 6) }, (_, index) => index);
  const waveformBars = Array.from({ length: 18 }, (_, index) => index);
  const captionRows = Array.from({ length: 3 }, (_, index) => index);

  return (
    <div className="relative mt-6 overflow-hidden rounded-[28px] border border-border/40 bg-[#07111a] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/60 to-transparent" />

      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
            Live render activity
          </p>
          <p className="mt-1 text-sm text-slate-300/80">
            {detail}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Observed progress</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{Math.round(progress)}%</p>
        </div>
      </div>

      <div className="relative mt-5 min-h-[320px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(4,10,16,0.96),rgba(7,16,25,0.92))]">
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-70"
          animate={{
            background: [
              "radial-gradient(circle at 20% 30%, rgba(34,211,238,0.18), transparent 30%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.14), transparent 28%)",
              "radial-gradient(circle at 28% 36%, rgba(34,211,238,0.24), transparent 32%), radial-gradient(circle at 72% 64%, rgba(16,185,129,0.18), transparent 30%)",
              "radial-gradient(circle at 20% 30%, rgba(34,211,238,0.18), transparent 30%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.14), transparent 28%)",
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="absolute inset-y-0 left-0 w-24 border-r border-dashed border-white/8">
          {sceneTiles.map((tile) => (
            <motion.div
              key={tile}
              className="absolute left-4 flex h-10 items-center gap-2 rounded-2xl border border-cyan-400/15 bg-cyan-400/8 px-3"
              style={{ top: 26 + tile * 44 }}
              animate={{
                x:
                  mode === "concat" || mode === "render"
                    ? [0, 10, 0]
                    : mode === "queued"
                      ? [0, 0, 0]
                      : [0, 6, 0],
                opacity: [0.45, 1, 0.45],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: tile * 0.14,
                ease: "easeInOut",
              }}
            >
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              <span className="text-[11px] font-medium text-slate-200">S{tile + 1}</span>
            </motion.div>
          ))}
        </div>

        {(mode === "concat" || mode === "render" || mode === "assets" || mode === "storyboard") && (
          <>
            {sceneTiles.map((tile) => (
              <motion.div
                key={`scene-card-${tile}`}
                className="absolute top-10 h-40 w-20 overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(21,32,43,0.95),rgba(8,15,23,0.95))] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                style={{ left: 120 + tile * 42 }}
                animate={{
                  x:
                    mode === "concat"
                      ? [0, 48, 96]
                      : mode === "render"
                        ? [0, 18, 0]
                        : [0, 10, 0],
                  y: [0, tile % 2 === 0 ? -10 : 10, 0],
                  scale:
                    mode === "storyboard"
                      ? [0.96, 1.03, 0.96]
                      : [1, 1.04, 1],
                  opacity: [0.48, 1, 0.48],
                }}
                transition={{
                  duration: mode === "concat" ? 2.4 : 2.8,
                  repeat: Infinity,
                  delay: tile * 0.12,
                  ease: "easeInOut",
                }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.25),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
                <div className="absolute inset-x-3 top-4 h-16 rounded-2xl bg-linear-to-br from-cyan-300/25 via-emerald-300/10 to-transparent" />
                <div className="absolute inset-x-3 bottom-6 h-2 rounded-full bg-white/14" />
                <div className="absolute inset-x-6 bottom-11 h-2 rounded-full bg-white/8" />
              </motion.div>
            ))}
          </>
        )}

        <div className="absolute inset-y-8 right-6 left-[46%] rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(10,24,36,0.92),rgba(5,12,18,0.98))] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_18px_60px_rgba(0,0,0,0.45)]">
          <motion.div
            className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-cyan-200/85 to-transparent"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-x-6 h-16 bg-linear-to-b from-cyan-300/15 to-transparent"
            animate={{ y: [0, 190, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="absolute inset-x-6 top-6 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Output frame
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">
              {mode}
            </span>
          </div>

          <div className="absolute inset-x-6 top-14 bottom-6 overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,27,40,0.96),rgba(4,8,13,0.98))]">
            <motion.div
              className="absolute inset-0"
              animate={{
                background: [
                  "radial-gradient(circle at 30% 25%, rgba(251,191,36,0.22), transparent 26%), linear-gradient(180deg, rgba(15,32,46,0.96), rgba(3,9,15,0.98))",
                  "radial-gradient(circle at 62% 22%, rgba(251,191,36,0.26), transparent 28%), linear-gradient(180deg, rgba(15,32,46,0.96), rgba(3,9,15,0.98))",
                  "radial-gradient(circle at 30% 25%, rgba(251,191,36,0.22), transparent 26%), linear-gradient(180deg, rgba(15,32,46,0.96), rgba(3,9,15,0.98))",
                ],
              }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />

            {(mode === "audio" || mode === "render" || mode === "concat" || mode === "finalizing") && (
              <div className="absolute inset-x-6 bottom-8 flex items-end justify-center gap-1.5">
                {waveformBars.map((bar) => (
                  <motion.span
                    key={bar}
                    className="w-1.5 rounded-full bg-linear-to-t from-cyan-400/55 via-cyan-300/95 to-white/95"
                    animate={{
                      height:
                        mode === "audio"
                          ? [16, 56, 22, 48, 18]
                          : [10, 26, 14, 22, 10],
                      opacity: [0.5, 1, 0.6, 0.9, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: bar * 0.04,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            )}

            {(mode === "subtitles" || mode === "render" || mode === "finalizing") && (
              <div className="absolute inset-x-8 bottom-16 space-y-3">
                {captionRows.map((row) => (
                  <motion.div
                    key={row}
                    className="h-5 rounded-full border border-white/12 bg-black/35"
                    animate={{
                      x: [row === 1 ? 12 : -10, row === 1 ? -12 : 10, row === 1 ? 12 : -10],
                      opacity: [0.45, 0.95, 0.45],
                      width: row === 1 ? ["74%", "82%", "74%"] : ["58%", "66%", "58%"],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      delay: row * 0.2,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            )}

            {mode === "finalizing" && (
              <>
                <motion.div
                  className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/30"
                  animate={{ scale: [0.85, 1.18, 0.85], opacity: [0.25, 0.85, 0.25] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20"
                  animate={{ scale: [0.9, 1.06, 0.9], opacity: [0.18, 0.55, 0.18] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                />
              </>
            )}
          </div>
        </div>
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
        label: "Compile",
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
          : "Compile";

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
          title: "Your final video is compiled.",
          description: "This preview matches the latest successful export and is ready to download or share.",
        };
      case "stale":
        return {
          eyebrow: "Export outdated",
          title: "A previous export is available, but the project has changed.",
          description: "The preview below is from an older successful render. Recompile to produce a new final video.",
        };
      case "failed":
        return {
          eyebrow: "Render failed",
          title: "The last export attempt did not finish.",
          description: failureMessage?.trim() || "Review the failure details below, then retry the compile stage when you are ready.",
        };
      case "ready":
        return {
          eyebrow: "Ready to export",
          title: "Everything needed for the final render is in place.",
          description: "Scenes, visuals, voice audio, and timing are ready. Start compile when you are happy with the arrangement.",
        };
      case "blocked":
      default:
        return {
          eyebrow: "Export is blocked",
          title: "Finish scene prep before compiling.",
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
          <p className="font-semibold text-foreground">Latest compile attempt failed</p>
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
            Retry compile stage
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
                    loadingLabel={videoIsStale ? "Recompiling..." : "Starting compile..."}
                    className="justify-center"
                  >
                    <Clapperboard className="h-4 w-4" />
                    {videoIsStale ? "Recompile video" : "Compile again"}
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
                    If the final export feels rushed or too static, go back to Arrange to adjust timing and then compile again.
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
                    ? "A previous export is available. Recompiling will replace it with a fresh final video."
                    : "You already have a successful export. Compile again if you changed scenes, timing, or settings."}
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
                No successful export exists yet. Compile will produce the first final video for this project.
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
                loadingLabel="Starting compile..."
                disabled={!allAssetsReady}
              >
                <Clapperboard className="h-4 w-4" />
                Compile final video
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
