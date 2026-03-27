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
import { useProjectStore } from "@/stores/projectStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { notify } from "@/lib/notify";
import type { Project, Scene, Job, WsMessage } from "@/lib/types";
import { pickLatestAsset } from "@/components/projects/scene-assets";
import {
  allScenesHaveImages,
  extractJobErrorMessage,
  getStudioRecoveryContext,
  pickLatestFailedVideoRender,
} from "@/components/studio/studio-recovery";
import { StudioRecoveryBanner } from "@/components/studio/StudioRecoveryBanner";

import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioAmbientBackground } from "@/components/studio/StudioAmbientBackground";
import { StudioStepper } from "@/components/studio/StudioStepper";
import ScriptStep from "@/components/studio/ScriptStep";
import AssetsStep from "@/components/studio/AssetsStep";
import ArrangeStep from "@/components/studio/ArrangeStep";
import CompileStep from "@/components/studio/CompileStep";

const STEPS = [
  { label: "Script", description: "Generate & edit your story", icon: <FileText className="h-4 w-4" /> },
  { label: "Assets", description: "Images & voiceover", icon: <Images className="h-4 w-4" /> },
  { label: "Arrange", description: "Order & preview scenes", icon: <LayoutGrid className="h-4 w-4" /> },
  { label: "Compile", description: "Render final video", icon: <Clapperboard className="h-4 w-4" /> },
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

function hasImageAssets(scenes: Scene[]): boolean {
  return scenes.some((s) => !!pickLatestAsset(s.assets, "image"));
}

function detectInitialStep(project: Project, jobs: Job[]): number {
  const scenes = project.scenes || [];
  if (scenes.length === 0) return 0;
  if (!hasImageAssets(scenes)) return 1;
  const completedRender = jobs.find(
    (j) => j.type === "video_render" && j.status === "completed" && j.result?.video_path,
  );
  if (completedRender) return 3;
  if (allScenesHaveImages(scenes)) return 2;
  return 1;
}

/** Spring-based step transition: horizontal slide + scale + blur (whole content pane). */
const STEP_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 36,
  mass: 0.88,
};

function buildStepVariants(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  const slide = 52;
  return {
    enter: (dir: number) => ({
      x: dir > 0 ? slide : -slide,
      opacity: 0,
      scale: 0.965,
      filter: "blur(12px)",
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -slide * 0.92 : slide * 0.92,
      opacity: 0,
      scale: 0.97,
      filter: "blur(10px)",
    }),
  };
}

function stepTransition(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  }
  return {
    x: STEP_SPRING,
    scale: { type: "spring" as const, stiffness: 400, damping: 38, mass: 0.85 },
    opacity: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
    filter: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
  };
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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, [projectId]);

  const refreshJobs = useCallback(async () => {
    if (!projectId) return [];
    try {
      const j = await api.listJobs({ project_id: projectId });
      setJobs(j as Job[]);
      return j as Job[];
    } catch {
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.getProject(projectId),
      api.listJobs({ project_id: projectId }),
    ])
      .then(([p, fetchedJobs]: [Project, Job[]]) => {
        setProject(p);
        setJobs(fetchedJobs);

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
          setJobProgress(activeJob.progress || 0);
        }

        const completedRender = pickMostRecentJob(
          fetchedJobs.filter((j) => j.status === "completed" && j.type === "video_render"),
        );
        if (completedRender?.result?.video_path || completedRender?.result?.video_url) {
          const raw = completedRender.result.video_url || completedRender.result.video_path;
          resolveMediaPlaybackUrl(raw).then(setCompletedVideoUrl).catch(() => {});
        }
      })
      .catch(() => notify.error("Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

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

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (activeJobId && msg.job_id !== activeJobId) return;
      if (!activeJobId) {
        const isOurJob = jobs.some((j) => j.id === msg.job_id);
        if (!isOurJob) return;
      }

      if (msg.type === "progress") {
        setJobProgress(msg.progress ?? 0);
        setProgressDetail(msg.detail || "");
      } else if (msg.type === "completed") {
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
          if (completedRender?.result?.video_path || completedRender?.result?.video_url) {
            const raw = completedRender.result.video_url || completedRender.result.video_path;
            resolveMediaPlaybackUrl(raw).then(setCompletedVideoUrl).catch(() => {});
          }
        });
      } else if (msg.type === "error") {
        setActiveJobId(null);
        setActiveJobType(null);
        setWsFailure({
          message: msg.error || "Job failed",
          jobId: msg.job_id,
        });
        notify.error(msg.error || "Job failed");
        refreshProject();
        refreshJobs();
      }
    },
    [activeJobId, jobs, refreshProject, refreshJobs],
  );

  useWebSocket(handleWsMessage);

  const scenes: Scene[] = useMemo(
    () => (project?.scenes || []).sort((a, b) => a.order_index - b.order_index),
    [project?.scenes],
  );

  const recoveryContext = useMemo(
    () => getStudioRecoveryContext(scenes, failureMessage || "Generation failed"),
    [scenes, failureMessage],
  );

  const isScriptGenerating =
    activeJobType === "video_render" &&
    !!activeJobId &&
    scenes.length === 0;

  const isStoryboardGenerating =
    activeJobType === "video_render" &&
    !!activeJobId &&
    !hasImageAssets(scenes);

  const isAssetGenerating =
    (activeJobType === "video_render" || activeJobType === "asset_generate") &&
    !!activeJobId &&
    hasImageAssets(scenes) &&
    !allScenesHaveImages(scenes);

  const isCompiling =
    activeJobType === "video_render" &&
    !!activeJobId &&
    currentStep === 3;

  const goToStep = useCallback(
    (step: number) => {
      if (step < 0 || step > 3) return;
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep],
  );

  const stepValidity = useMemo(() => {
    const hasScenes = scenes.length > 0;
    const hasImages = allScenesHaveImages(scenes);
    return {
      0: hasScenes,
      1: hasScenes && hasImages,
      2: hasScenes,
      3: hasScenes && hasImages,
    };
  }, [scenes]);

  const stepErrors = useMemo(() => {
    const errors: Record<number, string | null> = {};
    if (blockedSteps.has(0) && !stepValidity[0]) {
      errors[0] = "Add at least one scene to continue.";
    }
    if (blockedSteps.has(1) && !stepValidity[1]) {
      errors[1] = "Generate images for all scenes.";
    }
    if (blockedSteps.has(2) && !stepValidity[2]) {
      errors[2] = "Arrange at least one scene.";
    }
    if (blockedSteps.has(3) && !stepValidity[3]) {
      errors[3] = "Finalize visuals before compiling.";
    }
    return errors;
  }, [blockedSteps, stepValidity]);

  const stepHints = useMemo(() => {
    const hints: Record<number, string | null> = {};
    hints[0] = scenes.length ? `${scenes.length} scene${scenes.length !== 1 ? "s" : ""}` : "No scenes yet";
    const imagesReady = scenes.filter((s) => !!pickLatestAsset(s.assets, "image")).length;
    hints[1] = scenes.length
      ? `${imagesReady}/${scenes.length} images ready`
      : "Generate scenes first";
    hints[2] = scenes.length ? "Drag to reorder, tune timing" : "Scenes required";
    hints[3] = completedVideoUrl ? "Video compiled" : "Ready to render";
    return hints;
  }, [scenes, completedVideoUrl]);

  const stepBadges = useMemo(() => {
    const badges: Record<number, string | null> = {};
    badges[0] = stepValidity[0] ? "Ready" : "Needed";
    badges[1] = stepValidity[1] ? "Ready" : "In progress";
    badges[2] = stepValidity[2] ? "Ready" : "Needed";
    badges[3] = completedVideoUrl ? "Done" : "Render";
    return badges;
  }, [stepValidity, completedVideoUrl]);

  const handleBlocked = useCallback((step: number, message: string) => {
    setBlockedSteps((prev) => new Set([...prev, step]));
    notify.error(message);
  }, []);

  const markCompleted = useCallback((step: number) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
  }, []);

  const handleScriptNext = useCallback(() => {
    if (!stepValidity[0]) {
      handleBlocked(0, "Add at least one scene before moving to Assets.");
      return;
    }
    markCompleted(0);
    goToStep(1);
  }, [markCompleted, goToStep, handleBlocked, stepValidity]);

  const startOrRetryPipeline = useCallback(async () => {
    if (!project) return;
    const job =
      project.status === "failed"
        ? await api.retryProject(project.id)
        : await api.compileVideo(project.id);
    addJob(job);
    setActiveJobId(job.id);
    setActiveJobType(job.type || "video_render");
    setJobProgress(0);
    setProgressDetail("");
    setWsFailure(null);
    setDismissedBannerKey(null);
  }, [project, addJob]);

  const queuePipelineJob = useCallback(
    async (clearFinalVideo: boolean) => {
      if (!project) return;
      if (clearFinalVideo) setCompletedVideoUrl(null);
      setPipelineBusy(true);
      try {
        await startOrRetryPipeline();
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Request failed");
      } finally {
        setPipelineBusy(false);
      }
    },
    [project, startOrRetryPipeline],
  );

  const handleStartAssetGeneration = useCallback(async () => {
    await queuePipelineJob(false);
  }, [queuePipelineJob]);

  const handleAssetsNext = useCallback(() => {
    if (!stepValidity[1]) {
      handleBlocked(1, "Generate images for all scenes to continue.");
      return;
    }
    markCompleted(1);
    goToStep(2);
  }, [markCompleted, goToStep, handleBlocked, stepValidity]);

  const handleArrangeNext = useCallback(() => {
    if (!stepValidity[2]) {
      handleBlocked(2, "Arrange at least one scene before compiling.");
      return;
    }
    markCompleted(2);
    goToStep(3);
  }, [markCompleted, goToStep, handleBlocked, stepValidity]);

  const handleStartCompile = useCallback(async () => {
    await queuePipelineJob(true);
  }, [queuePipelineJob]);

  const handleRecoveryRetry = useCallback(async () => {
    await queuePipelineJob(currentStep === 3);
  }, [queuePipelineJob, currentStep]);

  const handleDismissRecoveryBanner = useCallback(() => {
    setDismissedBannerKey(recoveryBannerKey);
  }, [recoveryBannerKey]);

  const stepperStatus = useMemo(() => {
    if (!activeJobId) return undefined;
    if (progressDetail) return progressDetail;
    if (isCompiling) return `Compiling... ${Math.round(jobProgress)}%`;
    if (isAssetGenerating) return `Generating... ${Math.round(jobProgress)}%`;
    if (isScriptGenerating || isStoryboardGenerating) return "Writing script...";
    return undefined;
  }, [activeJobId, progressDetail, isCompiling, isAssetGenerating, isScriptGenerating, isStoryboardGenerating, jobProgress]);

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
            completedVideoUrl={completedVideoUrl}
            videoIsStale={isVideoStale}
            lastCompiledAt={lastCompiledAt}
            compileFailed={
              project.status === "failed" &&
              scenes.length > 0 &&
              allScenesHaveImages(scenes)
            }
            failureMessage={failureMessage}
            onRetryCompile={handleRecoveryRetry}
            pipelineBusy={pipelineBusy}
            onStartCompile={handleStartCompile}
            onBack={() => goToStep(2)}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
      <StudioAmbientBackground stepIndex={currentStep} />
      <StudioHeader
        projectTitle={project.title || "Untitled"}
        currentStep={currentStep + 1}
        totalSteps={STEPS.length}
        stepLabel={STEPS[currentStep]?.label}
        stepStatus={stepperStatus}
        onSaveDraft={handleSaveDraft}
        onResumeDraft={draftInfo ? handleResumeDraft : undefined}
        draftSavedAt={draftInfo?.savedAt ?? null}
        onClose={() => router.push(`/projects/${projectId}`)}
      />

      <div className="relative z-10 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-rows-1 md:grid-cols-[240px_minmax(0,1fr)]">
        {/* ── Unified stepper rail (responsive) ── */}
        <aside className="flex w-full shrink-0 flex-col border-b border-border/15 md:w-auto md:border-b-0 md:border-r md:border-border/10">
          <div className="flex-1 px-3 py-2 md:px-2.5 md:py-5">
            <StudioStepper
              currentStep={currentStep}
              steps={STEPS}
              completedSteps={completedSteps}
              variant="adaptive"
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
          <div className="hidden px-4 pb-3 md:block">
            <div className="flex items-center gap-2 text-[8px] font-mono text-muted-foreground/20 uppercase tracking-[0.2em]">
              <span className="h-px flex-1 bg-border/15" />
              ShortsForge
              <span className="h-px flex-1 bg-border/15" />
            </div>
          </div>
        </aside>

        {/* Step content fills main; individual steps own scroll regions (e.g. Assets grid). */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Film-gate corners */}
          <div className="pointer-events-none absolute inset-0 z-10 hidden md:block">
            <svg className="absolute top-4 left-4 h-4 w-4 text-muted-foreground/10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 6 L0 0 L6 0" /></svg>
            <svg className="absolute top-4 right-4 h-4 w-4 text-muted-foreground/10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1"><path d="M10 0 L16 0 L16 6" /></svg>
            <svg className="absolute bottom-4 left-4 h-4 w-4 text-muted-foreground/10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 10 L0 16 L6 16" /></svg>
            <svg className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1"><path d="M10 16 L16 16 L16 10" /></svg>
          </div>

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
      </div>
    </div>
  );
}
