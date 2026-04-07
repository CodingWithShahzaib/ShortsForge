"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  FileText,
  Images,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { api, resolveMediaPlaybackUrl } from "@/lib/api";
import { buildEngineStageStates, engineStageLabel, inferCurrentStage } from "@/lib/engine-pipeline";
import { wsErrorMessage } from "@/lib/job-ws";
import { useProjectStore } from "@/stores/projectStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { notify } from "@/lib/notify";
import type { EngineStage, EngineStageState, Project, Scene, Job, WsMessage } from "@/lib/types";
import { pickLatestAsset } from "@/components/projects/scene-assets";
import {
  allScenesHaveAudio,
  allScenesHaveImages,
  allScenesHaveNarration,
  extractJobErrorMessage,
  getStudioRecoveryContext,
  pickLatestFailedVideoRender,
} from "@/components/studio/studio-recovery";
import { StudioRecoveryBanner } from "@/components/studio/StudioRecoveryBanner";

import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioStepper } from "@/components/studio/StudioStepper";
import ScriptStep from "@/components/studio/ScriptStep";
import AssetsStep from "@/components/studio/AssetsStep";
import ArrangeStep from "@/components/studio/ArrangeStep";
import CompileStep from "@/components/studio/CompileStep";
import { CharactersTab } from "@/components/studio/CharactersTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STEPS = [
  { label: "Script", description: "Create and edit your story", icon: <FileText className="h-4 w-4" /> },
  { label: "Assets", description: "Images and voice", icon: <Images className="h-4 w-4" /> },
  { label: "Arrange", description: "Order and preview scenes", icon: <LayoutGrid className="h-4 w-4" /> },
  { label: "Export", description: "Create final video", icon: <Clapperboard className="h-4 w-4" /> },
];

type DraftInfo = {
  step: number;
  savedAt: string;
};

function pickMostRecentJob(jobs: Job[], type?: string): Job | null {
  const filtered = type ? jobs.filter((j) => j.type === type) : jobs;
  if (!filtered.length) return null;
  return [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

function getRenderVideoSource(job: Job | null): string | null {
  if (!job?.result) return null;
  const candidates = [job.result.video_url, job.result.video_path];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function hasImageAssets(scenes: Scene[]): boolean {
  return scenes.some((s) => !!pickLatestAsset(s.assets, "image"));
}

function hasAudioAssets(scenes: Scene[]): boolean {
  return scenes.some((s) => !!pickLatestAsset(s.assets, "audio"));
}

function isActiveJob(job: Job): boolean {
  return job.status === "queued" || job.status === "in_progress";
}

function mergePolledJobs(previousJobs: Job[], nextJobs: Job[]): Job[] {
  const previousById = new Map(previousJobs.map((job) => [job.id, job]));
  return nextJobs.map((job) => {
    const previous = previousById.get(job.id);
    if (!previous || !isActiveJob(previous) || !isActiveJob(job)) {
      return job;
    }
    return {
      ...job,
      progress: Math.max(job.progress || 0, previous.progress || 0),
    };
  });
}

function detectInitialStep(project: Project, jobs: Job[]): number {
  const scenes = project.scenes || [];
  if (scenes.length === 0) return 0;
  if (project.status === "ready_for_compile") return 3;
  if (!hasImageAssets(scenes) || !hasAudioAssets(scenes)) return 1;
  const completedRender = jobs.find(
    (j) =>
      j.type === "video_render" &&
      j.status === "completed" &&
      !!(j.result?.video_path || j.result?.video_url),
  );
  if (completedRender) return 3;
  if (allScenesHaveImages(scenes) && allScenesHaveAudio(scenes)) return 2;
  return 1;
}

function buildStepVariants(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return {
    enter: () => ({
      opacity: 0,
      y: 8,
    }),
    center: {
      opacity: 1,
      y: 0,
    },
    exit: () => ({
      opacity: 0,
      y: -6,
    }),
  };
}

function stepTransition(reduceMotion: boolean | null) {
  const duration = reduceMotion ? 0.16 : 0.22;
  return { duration, ease: [0.22, 1, 0.36, 1] as const };
}

export default function StudioPage() {
  const pathname = usePathname();
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const reduceMotion = useReducedMotion();

  const stepVariants = useMemo(
    () => buildStepVariants(reduceMotion),
    [reduceMotion],
  );
  const stepTransitionCfg = useMemo(
    () => stepTransition(reduceMotion),
    [reduceMotion],
  );

  const projectId = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("projects");
    return idx >= 0 && idx + 1 < parts.length ? parts[idx + 1] : "";
  }, [pathname]);

  const [project, setProject] = useState<Project | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [studioView, setStudioView] = useState<"studio" | "characters">("studio");
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [direction, setDirection] = useState(0);

  const [jobProgress, setJobProgress] = useState(0);
  const [progressDetail, setProgressDetail] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobType, setActiveJobType] = useState<string | null>(null);
  const [completedVideoUrl, setCompletedVideoUrl] = useState<string | null>(null);

  /** Captures WS error text before jobs list refreshes. */
  const [wsFailure, setWsFailure] = useState<{ message: string; jobId?: string } | null>(null);
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [blockedSteps, setBlockedSteps] = useState<Set<number>>(new Set());
  const [draftInfo, setDraftInfo] = useState<DraftInfo | null>(null);
  const [requestedStage, setRequestedStage] = useState<EngineStage | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveAssetRefreshAtRef = useRef(0);
  const liveAssetRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressJobIdRef = useRef<string | null>(null);

  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const p = await api.getProject(projectId);
      setProject(p);
      return p as Project;
    } catch {
      notify.error("Failed to load project");
    }
  }, [projectId]);

  const syncTrackedJobProgress = useCallback((jobId: string, progress: number) => {
    setJobProgress((previous) => {
      if (progressJobIdRef.current !== jobId) {
        progressJobIdRef.current = jobId;
        return progress;
      }
      return Math.max(previous, progress);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const key = `studio-draft:${projectId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      setDraftInfo(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as DraftInfo;
      if (typeof parsed?.step === "number" && typeof parsed?.savedAt === "string") {
        setDraftInfo(parsed);
      }
    } catch {
      setDraftInfo(null);
    }
  }, [projectId, syncTrackedJobProgress]);

  const refreshJobs = useCallback(async () => {
    if (!projectId) return [];
    try {
      const j = await api.listJobs({ project_id: projectId });
      setJobs((previous) => mergePolledJobs(previous, j as Job[]));
      return j as Job[];
    } catch {
      return [];
    }
  }, [projectId]);

  const maybeRefreshAssetsLive = useCallback((msg: WsMessage) => {
    if (currentStep !== 1) return;
    if (msg.job_type !== "video_render" && msg.job_type !== "asset_generate") return;
    const detail = (msg.detail || "").toLowerCase();
    const hintsImageReady =
      detail.includes("image for scene") ||
      detail.includes("saving image");
    if (!hintsImageReady) return;

    const now = Date.now();
    // Throttle eager refreshes while still reacting quickly to per-scene image completions.
    if (now - liveAssetRefreshAtRef.current < 700) return;
    liveAssetRefreshAtRef.current = now;
    if (liveAssetRefreshTimeoutRef.current) clearTimeout(liveAssetRefreshTimeoutRef.current);
    liveAssetRefreshTimeoutRef.current = setTimeout(() => {
      void refreshProject();
    }, 180);
  }, [currentStep, refreshProject]);

  useEffect(() => {
    if (!jobs.length) return;
    const tracked = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;

    if (tracked) {
      if (isActiveJob(tracked)) {
        setActiveJobType(tracked.type || "video_render");
        syncTrackedJobProgress(tracked.id, tracked.progress || 0);
        return;
      }
      // WS completion can be missed; reconcile from polled jobs.
      progressJobIdRef.current = null;
      setActiveJobId(null);
      setActiveJobType(null);
      setProgressDetail("");
      if (tracked.status === "completed") {
        setJobProgress(100);
      }
      return;
    }

    const fallbackActive = jobs.find(isActiveJob);
    if (fallbackActive) {
      setActiveJobId(fallbackActive.id);
      setActiveJobType(fallbackActive.type || "video_render");
      syncTrackedJobProgress(fallbackActive.id, fallbackActive.progress || 0);
      return;
    }
    // Do not clear optimistic active state here; a freshly queued job may not
    // appear in polled jobs yet. WS/poll will reconcile shortly.
  }, [jobs, activeJobId, syncTrackedJobProgress]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.getProject(projectId),
      api.listJobs({ project_id: projectId }),
    ])
      .then(([p, fetchedJobs]: [Project, Job[]]) => {
        setProject(p);
        setJobs(mergePolledJobs([], fetchedJobs));

        const step = detectInitialStep(p, fetchedJobs);
        setCurrentStep(step);
        const done = new Set<number>();
        for (let i = 0; i < step; i++) done.add(i);
        setCompletedSteps(done);

        const activeJob = fetchedJobs.find(
          (j) => j.status === "queued" || j.status === "in_progress",
        );
        if (activeJob) {
          setActiveJobId(activeJob.id);
          setActiveJobType(activeJob.type);
          syncTrackedJobProgress(activeJob.id, activeJob.progress || 0);
        }

        const completedRender = pickMostRecentJob(
          fetchedJobs.filter((j) => j.status === "completed" && j.type === "video_render"),
        );
        const raw = getRenderVideoSource(completedRender);
        if (raw) {
          resolveMediaPlaybackUrl(raw).then(setCompletedVideoUrl).catch(() => {});
        }
      })
      .catch(() => notify.error("Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId, syncTrackedJobProgress]);

  const latestCompletedRender = useMemo(
    () =>
      pickMostRecentJob(
        jobs.filter((j) => j.status === "completed" && j.type === "video_render"),
      ),
    [jobs],
  );

  const lastCompiledAt = latestCompletedRender?.completed_at || latestCompletedRender?.created_at || null;

  const isVideoStale = useMemo(() => {
    if (!project || !latestCompletedRender) return false;
    const rawVersion = latestCompletedRender.result?.project_version;
    const resultVersion = typeof rawVersion === "number" ? rawVersion : Number(rawVersion);
    if (Number.isFinite(resultVersion) && typeof project.version === "number") {
      return project.version !== resultVersion;
    }
    if (project.updated_at && latestCompletedRender.completed_at) {
      return (
        new Date(project.updated_at).getTime() >
        new Date(latestCompletedRender.completed_at).getTime()
      );
    }
    return false;
  }, [project, latestCompletedRender]);

  useEffect(() => {
    if (!activeJobId || !projectId) return;
    pollRef.current = setInterval(async () => {
      const [p] = await Promise.all([
        api.getProject(projectId).catch(() => null),
        refreshJobs(),
      ]);
      if (p) setProject(p);
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeJobId, projectId, refreshJobs]);

  useEffect(() => {
    return () => {
      if (liveAssetRefreshTimeoutRef.current) {
        clearTimeout(liveAssetRefreshTimeoutRef.current);
      }
    };
  }, []);

  const latestFailedVideoJob = useMemo(() => {
    if (!project || project.status !== "failed") return null;
    return pickLatestFailedVideoRender(project.id, jobs);
  }, [project, jobs]);

  const failureMessage = useMemo(() => {
    if (wsFailure?.message) return wsFailure.message;
    return extractJobErrorMessage(latestFailedVideoJob);
  }, [wsFailure, latestFailedVideoJob]);

  const recoveryBannerKey = useMemo(
    () => String(latestFailedVideoJob?.id ?? wsFailure?.jobId ?? "ws"),
    [latestFailedVideoJob?.id, wsFailure?.jobId],
  );

  const showRecoveryBanner =
    project?.status === "failed" &&
    Boolean(failureMessage.trim()) &&
    dismissedBannerKey !== recoveryBannerKey;

  const scenes: Scene[] = useMemo(
    () => (project?.scenes || []).sort((a, b) => a.order_index - b.order_index),
    [project?.scenes],
  );

  const recoveryContext = useMemo(
    () => getStudioRecoveryContext(scenes, failureMessage || "Generation failed"),
    [scenes, failureMessage],
  );

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (activeJobId && msg.job_id !== activeJobId) return;
      if (!activeJobId) {
        const isOurJob = jobs.some((j) => j.id === msg.job_id);
        if (!isOurJob) return;
      }

      if (msg.type === "progress") {
        setRequestedStage(null);
        syncTrackedJobProgress(msg.job_id, msg.progress ?? 0);
        setProgressDetail(msg.detail || "");
        maybeRefreshAssetsLive(msg);
      } else if (msg.type === "completed") {
        progressJobIdRef.current = null;
        setRequestedStage(null);
        setJobProgress(100);
        setActiveJobId(null);
        setActiveJobType(null);
        setWsFailure(null);
        setDismissedBannerKey(null);

        Promise.all([refreshProject(), refreshJobs()]).then(([p, refreshedJobs]) => {
          if (!p) return;
          const jobsList = refreshedJobs || [];
          const completedRender = pickMostRecentJob(
            jobsList.filter((j) => j.status === "completed" && j.type === "video_render"),
          );
          const raw = getRenderVideoSource(completedRender);
          if (raw) {
            resolveMediaPlaybackUrl(raw).then(setCompletedVideoUrl).catch(() => {});
          }
        });
      } else if (msg.type === "error") {
        progressJobIdRef.current = null;
        setRequestedStage(null);
        setActiveJobId(null);
        setActiveJobType(null);
        const message = wsErrorMessage(msg);
        setWsFailure({
          message,
          jobId: msg.job_id,
        });
        notify.error(message);
        refreshProject();
        refreshJobs();
      }
    },
    [activeJobId, jobs, refreshProject, refreshJobs, maybeRefreshAssetsLive, syncTrackedJobProgress],
  );

  useWebSocket(handleWsMessage);

  const activeJob = useMemo(
    () => (activeJobId ? jobs.find((job) => job.id === activeJobId) ?? null : null),
    [jobs, activeJobId],
  );

  const activeVideoJob = useMemo(
    () => (activeJob?.type === "video_render" ? activeJob : null),
    [activeJob],
  );

  const activeEngineStage = useMemo(
    () => (activeJob ? inferCurrentStage(activeJob, undefined, progressDetail) : null),
    [activeJob, progressDetail],
  );
  const effectiveEngineStage = activeEngineStage ?? requestedStage;

  const isScriptGenerating =
    activeJobType === "video_render" &&
    !!activeJobId &&
    activeEngineStage === "storyboard" &&
    scenes.length === 0;

  const isStoryboardGenerating =
    activeJobType === "video_render" &&
    !!activeJobId &&
    activeEngineStage === "storyboard";

  const isAssetGenerating =
    (activeJobType === "video_render" || activeJobType === "asset_generate") &&
    !!activeJobId &&
    (activeEngineStage === "assets" || activeJobType === "asset_generate");

  const isCompiling =
    (activeJobType === "video_render" &&
      !!activeJobId &&
      activeEngineStage === "compile") ||
    (requestedStage === "compile" && pipelineBusy);

  const goToStep = useCallback(
    (step: number) => {
      if (step < 0 || step > 3) return;
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep],
  );

  useEffect(() => {
    if (!showRecoveryBanner || activeJobId) return;
    if (currentStep !== recoveryContext.stepHint) {
      goToStep(recoveryContext.stepHint);
    }
  }, [showRecoveryBanner, activeJobId, currentStep, recoveryContext.stepHint, goToStep]);

  const stepValidity = useMemo(() => {
    const hasScenes = scenes.length > 0;
    const hasNarration = allScenesHaveNarration(scenes);
    const hasImages = allScenesHaveImages(scenes);
    const hasAudio = allScenesHaveAudio(scenes);
    return {
      0: hasScenes && hasNarration,
      1: hasScenes && hasNarration && hasImages && hasAudio,
      2: hasScenes,
      3: hasScenes && hasNarration && hasImages && hasAudio,
    };
  }, [scenes]);

  const stepErrors = useMemo(() => {
    const errors: Record<number, string | null> = {};
    if (blockedSteps.has(0) && !stepValidity[0]) {
      errors[0] = "All scenes must have narration.";
    }
    if (blockedSteps.has(1) && !stepValidity[1]) {
      errors[1] = "Generate images for all scenes.";
    }
    if (blockedSteps.has(2) && !stepValidity[2]) {
      errors[2] = "Arrange at least one scene.";
    }
    if (blockedSteps.has(3) && !stepValidity[3]) {
      errors[3] = "Finalize visuals before exporting.";
    }
    return errors;
  }, [blockedSteps, stepValidity]);

  const assetsReadyForExport = stepValidity[3];

  const exportStageStates = useMemo<Array<{ stage: EngineStage; label: string; state: EngineStageState }>>(() => {
    if (activeVideoJob) {
      return buildEngineStageStates(activeVideoJob, undefined, progressDetail);
    }
    return [
      {
        stage: "storyboard" as const,
        label: "Storyboard",
        state: stepValidity[0] ? "complete" : "pending",
      },
      {
        stage: "assets" as const,
        label: "Assets",
        state: stepValidity[1] ? "complete" : "pending",
      },
      {
        stage: "compile" as const,
        label: "Export",
        state:
          project?.status === "failed"
            ? "failed"
            : completedVideoUrl && !isVideoStale
              ? "complete"
              : assetsReadyForExport
                ? "pending"
                : "pending",
      },
    ];
  }, [activeVideoJob, progressDetail, stepValidity, project?.status, completedVideoUrl, isVideoStale, assetsReadyForExport]);

  const stepHints = useMemo(() => {
    const hints: Record<number, string | null> = {};
    hints[0] = scenes.length ? `${scenes.length} scene${scenes.length !== 1 ? "s" : ""}` : "No scenes yet";
    if (scenes.length && !allScenesHaveNarration(scenes)) {
      const missing = scenes.filter((s) => !((s.narration || s.subtitle || "").trim())).length;
      hints[0] = `${missing} scene${missing !== 1 ? "s" : ""} missing narration`;
    }
    const imagesReady = scenes.filter((s) => !!pickLatestAsset(s.assets, "image")).length;
    const audioReady = scenes.filter((s) => !!pickLatestAsset(s.assets, "audio")).length;
    hints[1] = scenes.length
      ? `${imagesReady}/${scenes.length} images, ${audioReady}/${scenes.length} audio`
      : "Generate scenes first";
    hints[2] = scenes.length ? "Drag to reorder, tune timing" : "Scenes required";
    hints[3] = completedVideoUrl
      ? "Export ready"
      : project?.status === "ready_for_compile"
        ? "Assets ready, export next"
        : "Ready to export";
    return hints;
  }, [scenes, completedVideoUrl, project?.status]);

  const stepBadges = useMemo(() => {
    const badges: Record<number, string | null> = {};
    badges[0] = isStoryboardGenerating ? "Working" : stepValidity[0] ? "Ready" : "Needed";
    badges[1] = isAssetGenerating ? "Working" : stepValidity[1] ? "Ready" : "Needed";
    badges[2] = stepValidity[2] ? "Ready" : "Needed";
    badges[3] = isCompiling
      ? "Working"
      : completedVideoUrl
        ? "Done"
        : project?.status === "ready_for_compile"
          ? "Ready"
          : "Export";
    return badges;
  }, [stepValidity, completedVideoUrl, isStoryboardGenerating, isAssetGenerating, isCompiling, project?.status]);

  const handleBlocked = useCallback((step: number, message: string) => {
    setBlockedSteps((prev) => new Set([...prev, step]));
    notify.error(message);
  }, []);

  const markCompleted = useCallback((step: number) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
  }, []);

  const handleScriptNext = useCallback(() => {
    if (!stepValidity[0]) {
      if (!scenes.length) {
        handleBlocked(0, "Add at least one scene before moving to Assets.");
      } else {
        handleBlocked(0, "Some scenes are missing narration. Recover or edit scene text first.");
      }
      return;
    }
    markCompleted(0);
    goToStep(1);
  }, [markCompleted, goToStep, handleBlocked, stepValidity, scenes]);

  const runStudioStage = useCallback(async (stage: EngineStage) => {
    if (!project) return;
    const isFailedRecovery = project.status === "failed";
    const job = isFailedRecovery
      ? await api.retryProject(project.id)
      : stage === "storyboard"
        ? await api.retryProject(project.id)
        : stage === "assets"
          ? await api.prepareAssets(project.id)
          : await api.compileVideo(project.id);
    addJob(job);
    setJobs((previous) => {
      const index = previous.findIndex((existingJob) => existingJob.id === job.id);
      if (index >= 0) {
        return previous.map((existingJob) => (
          existingJob.id === job.id ? { ...existingJob, ...job } : existingJob
        ));
      }
      return [job, ...previous];
    });
    setProject((previous) => (
      previous ? { ...previous, status: "generating" } : previous
    ));
    setActiveJobId(job.id);
    setActiveJobType(job.type || "video_render");
    syncTrackedJobProgress(job.id, Math.max(1, job.progress || 0));
    setProgressDetail(`${engineStageLabel(stage)} queued...`);
    setWsFailure(null);
    setDismissedBannerKey(null);
    // Force immediate sync so compile/generation state reflects instantly.
    void refreshJobs();
    void refreshProject();
  }, [project, addJob, refreshJobs, refreshProject, syncTrackedJobProgress]);

  const queuePipelineJob = useCallback(
    async (stage: EngineStage) => {
      if (!project) return;
      setRequestedStage(stage);
      setProgressDetail(`${engineStageLabel(stage)} queued...`);
      setJobProgress((previous) => Math.max(previous, 1));
      setPipelineBusy(true);
      try {
        await runStudioStage(stage);
      } catch (err: unknown) {
        setRequestedStage(null);
        notify.error(err instanceof Error ? err.message : "Request failed");
      } finally {
        setPipelineBusy(false);
      }
    },
    [project, runStudioStage],
  );

  const handleStartAssetGeneration = useCallback(async () => {
    await queuePipelineJob("assets");
  }, [queuePipelineJob]);

  const handleAssetsNext = useCallback(() => {
    if (!stepValidity[1]) {
      handleBlocked(1, "Prepare image and audio assets for all scenes to continue.");
      return;
    }
    markCompleted(1);
    goToStep(2);
  }, [markCompleted, goToStep, handleBlocked, stepValidity]);

  const handleArrangeNext = useCallback(() => {
    if (!stepValidity[2]) {
      handleBlocked(2, "Arrange at least one scene before exporting.");
      return;
    }
    markCompleted(2);
    goToStep(3);
  }, [markCompleted, goToStep, handleBlocked, stepValidity]);

  const handleStartCompile = useCallback(async () => {
    await queuePipelineJob("compile");
  }, [queuePipelineJob]);

  const recoveryStage = useMemo<EngineStage>(() => {
    if (recoveryContext.stepHint === 0) return "storyboard";
    if (recoveryContext.stepHint === 1) return "assets";
    return "compile";
  }, [recoveryContext.stepHint]);

  const handleRecoveryRetry = useCallback(async () => {
    await queuePipelineJob(recoveryStage);
  }, [queuePipelineJob, recoveryStage]);

  const handleDismissRecoveryBanner = useCallback(() => {
    setDismissedBannerKey(recoveryBannerKey);
  }, [recoveryBannerKey]);

  const stepperStatus = useMemo(() => {
    if (!activeJobId) return undefined;
    if (progressDetail) return progressDetail;
    if (effectiveEngineStage === "compile") return `Compiling video... ${Math.round(jobProgress)}%`;
    if (effectiveEngineStage === "assets") return `Generating assets... ${Math.round(jobProgress)}%`;
    if (effectiveEngineStage === "storyboard") return "Building storyboard...";
    if (isCompiling) return `Exporting... ${Math.round(jobProgress)}%`;
    if (isAssetGenerating) return `Generating... ${Math.round(jobProgress)}%`;
    if (isScriptGenerating || isStoryboardGenerating) return `Working on ${engineStageLabel("storyboard").toLowerCase()}...`;
    return undefined;
  }, [
    activeJobId,
    progressDetail,
    effectiveEngineStage,
    isCompiling,
    isAssetGenerating,
    isScriptGenerating,
    isStoryboardGenerating,
    jobProgress,
  ]);

  const handleSaveDraft = useCallback(() => {
    if (!projectId) return;
    const next: DraftInfo = {
      step: currentStep,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(`studio-draft:${projectId}`, JSON.stringify(next));
    setDraftInfo(next);
    notify.success("Draft saved.");
  }, [projectId, currentStep]);

  const handleResumeDraft = useCallback(() => {
    if (!draftInfo) return;
    goToStep(draftInfo.step);
    notify.info("Resumed saved draft.");
  }, [draftInfo, goToStep]);

  useEffect(() => {
    const raw = getRenderVideoSource(latestCompletedRender);
    if (!raw) return;
    resolveMediaPlaybackUrl(raw)
      .then((url) => {
        setCompletedVideoUrl(url);
        setProgressDetail("Export complete");
      })
      .catch(() => {});
  }, [latestCompletedRender]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border/60 bg-background py-16 shadow-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Sparkles className="h-10 w-10 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading studio...</p>
        </motion.div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border/60 bg-background py-16 shadow-sm">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">Project not found</p>
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="text-primary underline text-sm"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const stepContent = (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
      {currentStep === 0 && (
        <motion.div
          key="script"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden will-change-transform"
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={stepTransitionCfg}
        >
          <ScriptStep
            project={project}
            scenes={scenes}
            isGenerating={isScriptGenerating || isStoryboardGenerating}
            progressDetail={progressDetail}
            projectFailed={project.status === "failed"}
            failureMessage={failureMessage}
            onRetryGeneration={handleRecoveryRetry}
            pipelineBusy={pipelineBusy}
            onScenesChange={() => { refreshProject(); }}
            onNext={handleScriptNext}
          />
        </motion.div>
      )}

      {currentStep === 1 && (
        <motion.div
          key="assets"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden will-change-transform"
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={stepTransitionCfg}
        >
          <AssetsStep
            project={project}
            scenes={scenes}
            isGenerating={isAssetGenerating || (activeJobType === "video_render" && !!activeJobId && currentStep === 1)}
            jobProgress={jobProgress}
            projectFailed={project.status === "failed"}
            failureMessage={failureMessage}
            pipelineBusy={pipelineBusy}
            onRefresh={() => { refreshProject(); }}
            onStartGeneration={handleStartAssetGeneration}
            onNext={handleAssetsNext}
            onBack={() => goToStep(0)}
          />
        </motion.div>
      )}

      {currentStep === 2 && (
        <motion.div
          key="arrange"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden will-change-transform"
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={stepTransitionCfg}
        >
          <ArrangeStep
            project={project}
            scenes={scenes}
            onRefresh={() => { refreshProject(); }}
            onNext={handleArrangeNext}
            onBack={() => goToStep(1)}
          />
        </motion.div>
      )}

      {currentStep === 3 && (
        <motion.div
          key="compile"
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden will-change-transform"
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={stepTransitionCfg}
        >
          <CompileStep
            project={project}
            scenes={scenes}
            isCompiling={isCompiling}
            jobProgress={jobProgress}
            progressDetail={progressDetail}
            activeJob={activeVideoJob}
            activeStage={effectiveEngineStage}
            stageStates={exportStageStates}
            completedVideoUrl={completedVideoUrl}
            videoIsStale={isVideoStale}
            lastCompiledAt={lastCompiledAt}
            compileFailed={
              project.status === "failed" &&
              scenes.length > 0 &&
              allScenesHaveImages(scenes) &&
              allScenesHaveAudio(scenes)
            }
            failureMessage={failureMessage}
            onRetryCompile={handleRecoveryRetry}
            pipelineBusy={pipelineBusy}
            hasReadyAssets={assetsReadyForExport}
            onStartCompile={handleStartCompile}
            onBack={() => goToStep(2)}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );

  return (
    <Tabs
      value={studioView}
      onValueChange={(value) => setStudioView(value === "characters" ? "characters" : "studio")}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm"
    >
      <StudioHeader
        projectTitle={project.title || "Untitled"}
        currentStep={studioView === "characters" ? 1 : currentStep + 1}
        totalSteps={studioView === "characters" ? 1 : STEPS.length}
        stepLabel={studioView === "characters" ? "Characters" : STEPS[currentStep]?.label}
        stepStatus={stepperStatus}
        projectStatus={project.status}
        onSaveDraft={handleSaveDraft}
        onResumeDraft={draftInfo ? handleResumeDraft : undefined}
        draftSavedAt={draftInfo?.savedAt ?? null}
        onClose={() => router.push(`/projects/${projectId}`)}
        centerNav={
          <TabsList className="h-8">
            <TabsTrigger value="studio" className="px-3 text-xs">Studio</TabsTrigger>
            <TabsTrigger value="characters" className="px-3 text-xs">Characters</TabsTrigger>
          </TabsList>
        }
      />

      <TabsContent value="studio" className="relative z-10 mt-0 h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex">
        <div className="shrink-0 border-b border-border/15 bg-card/40 px-4 py-2 sm:px-6 md:py-2.5 flex justify-center">
          <div className="w-full max-w-3xl">
            <StudioStepper
              currentStep={currentStep}
              steps={STEPS}
              completedSteps={completedSteps}
              variant="horizontal"
              activeStatus={stepperStatus}
              stepErrors={stepErrors}
              stepHints={stepHints}
              stepBadges={stepBadges}
              onStepClick={(step) => {
                if (step <= currentStep || completedSteps.has(step)) {
                  goToStep(step);
                }
              }}
            />
          </div>
        </div>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 pb-6 sm:px-5 md:px-6 lg:px-8 md:pt-5">
            {showRecoveryBanner && (
              <StudioRecoveryBanner
                message={failureMessage}
                stepHint={recoveryContext.stepHint}
                onRetry={handleRecoveryRetry}
                onDismiss={handleDismissRecoveryBanner}
                retrying={pipelineBusy}
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{stepContent}</div>
          </div>
        </main>
      </TabsContent>

      <TabsContent value="characters" className="relative z-10 mt-0 h-full min-h-0 flex-1 flex-col overflow-hidden data-[state=active]:flex">
        <CharactersTab
          project={project}
          scenes={scenes}
          onRefresh={() => {
            refreshProject();
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
