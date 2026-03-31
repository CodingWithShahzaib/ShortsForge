"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft, RotateCcw, Copy, Square, Clapperboard,
  Download, ChevronLeft, ChevronRight, Plus, Trash2,
  RefreshCw, Image as ImageIcon, Loader2, Film,
  Upload, ExternalLink, Settings, Play, Clock, Hash,
  Sparkles, Eye, Check, AlertTriangle, Calendar,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/video/video-player";
import { api, ApiError, resolveMediaPlaybackUrl, type YouTubeChannelsStatus } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { appConfirm } from "@/stores/confirmDialogStore";
import type { Project, Scene, Job } from "@/lib/types";
import { sceneDurationSec, scenesTotalDuration } from "@/components/projects/scene-timeline-utils";
import { pickLatestAsset, assetMediaSrc } from "@/components/projects/scene-assets";
import { ProjectDetailShellSkeleton } from "@/components/projects/project-detail-skeletons";
import { cn } from "@/lib/utils";

type ExportPreset = { id: string; label: string };
type ExportPresets = { resolutions: ExportPreset[]; quality: ExportPreset[] };

function pickLatestOutputVideoJob(jobs: Job[]): Job | null {
  const candidates = jobs.filter(
    (j) =>
      j.status === "completed" &&
      j.type === "video_render" &&
      j.result &&
      (j.result.video_path || j.result.video_url),
  );
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

function pickMostRecentJob(jobs: Job[]): Job | null {
  if (!jobs.length) return null;
  return [...jobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function ProjectSceneSortableThumb({
  scene,
  idx,
  isSelected,
  imgSrc,
  onSelect,
}: {
  scene: Scene;
  idx: number;
  isSelected: boolean;
  imgSrc: string | undefined;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative shrink-0 snap-start",
        isDragging && "z-30 opacity-90",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`
                        group relative shrink-0 snap-start overflow-hidden rounded-xl bg-zinc-800
                        w-28 sm:w-32 transition-colors duration-150
                        border-2 box-border
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
                        ${isSelected
          ? "border-cyan-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
          : "border-zinc-700/90 hover:border-zinc-500"
        }
                      `}
      >
        <div className="aspect-16/10 relative w-full">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-zinc-600" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-black/55 to-transparent" />
          <div className="absolute bottom-1.5 left-2 right-2 flex items-end justify-between gap-1">
            <span className="text-[10px] font-semibold text-white tabular-nums drop-shadow-sm">
              {idx + 1}
            </span>
            <span className="text-[9px] font-medium text-white/85 tabular-nums drop-shadow-sm">
              {sceneDurationSec(scene).toFixed(1)}s
            </span>
          </div>
        </div>
      </button>
      <button
        type="button"
        className="absolute left-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white/95 backdrop-blur-sm cursor-grab touch-none active:cursor-grabbing hover:bg-black/70"
        aria-label={`Drag to reorder scene ${idx + 1}`}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    generating: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400", label: "Creating" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", label: "Done" },
    failed: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400", label: "Failed" },
    draft: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400", label: "Draft" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "generating" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export default function ProjectDetailPage() {
  const addJob = useProjectStore((s) => s.addJob);
  const pathname = usePathname();
  const router = useRouter();
  const projectId = pathname.split("/").filter(Boolean).pop() || "";

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [outputJob, setOutputJob] = useState<Job | null>(null);
  const [mostRecentJob, setMostRecentJob] = useState<Job | null>(null);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const [exportPresets, setExportPresets] = useState<ExportPresets | null>(null);
  const [exportRes, setExportRes] = useState("youtube_landscape");
  const [exportQual, setExportQual] = useState("medium");
  const [exporting, setExporting] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const [subtitleConfig, setSubtitleConfig] = useState({
    subtitle_enabled: true,
    subtitle_source: "llm" as "llm" | "transcription",
    generate_subtitles: true,
    transcription_provider: "openai",
    transcription_language: "en",
    subtitle_font: "Arial",
    subtitle_size: 48,
    subtitle_color: "#FFFFFF",
    subtitle_position: "bottom" as "bottom" | "top" | "center",
  });
  const [matchScenesToAudio, setMatchScenesToAudio] = useState(false);
  const [ytStatus, setYtStatus] = useState<YouTubeChannelsStatus | null>(null);

  const refreshProject = useCallback(async () => {
    const p = await api.getProject(projectId);
    setProject(p);
    if (p?.settings) {
      setSubtitleConfig((prev) => ({
        ...prev,
        subtitle_enabled: p.settings.subtitle_enabled ?? prev.subtitle_enabled,
        subtitle_source: p.settings.subtitle_source ?? prev.subtitle_source,
        generate_subtitles: p.settings.generate_subtitles ?? prev.generate_subtitles,
        transcription_provider: p.settings.transcription_provider ?? prev.transcription_provider,
        transcription_language: p.settings.transcription_language ?? prev.transcription_language,
        subtitle_font: p.settings.subtitle_font ?? prev.subtitle_font,
        subtitle_size: p.settings.subtitle_size ?? prev.subtitle_size,
        subtitle_color: p.settings.subtitle_color ?? prev.subtitle_color,
        subtitle_position: p.settings.subtitle_position ?? prev.subtitle_position,
      }));
      setMatchScenesToAudio(p.settings.match_scenes_to_audio ?? false);
    }
    return p;
  }, [projectId]);

  const scenes = useMemo(
    () => [...(project?.scenes ?? [])].sort((a, b) => a.order_index - b.order_index),
    [project?.scenes],
  );
  const sceneIds = useMemo(() => scenes.map((s) => s.id), [scenes]);

  const timelineStripRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const scrollTimelineStrip = useCallback((dir: -1 | 1) => {
    const el = timelineStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: "smooth" });
  }, []);

  const handleSceneReorder = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = scenes.map((s) => s.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(ids, oldIndex, newIndex);
      try {
        await api.reorderScenes(projectId, next);
        await refreshProject();
      } catch (e: unknown) {
        notify.error(e instanceof Error ? e.message : "Could not reorder scenes");
      }
    },
    [projectId, scenes, refreshProject],
  );

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) || null;
  const selectedIdx = selectedScene ? scenes.indexOf(selectedScene) : -1;
  const totalDuration = useMemo(() => scenesTotalDuration(scenes), [scenes]);

  const refreshLatestJob = useCallback(async () => {
    const jobs = await api.listJobs({ limit: 100, project_id: projectId });
    setOutputJob(pickLatestOutputVideoJob(jobs));
    setMostRecentJob(pickMostRecentJob(jobs));
  }, [projectId]);

  useEffect(() => {
    const job = outputJob;
    if (!job || job.status !== "completed" || !job.result) {
      setOutputVideoUrl(null);
      return;
    }
    const keyRaw = job.result.video_path;
    const legacyRaw = job.result.video_url;
    const keyStr = typeof keyRaw === "string" ? keyRaw : "";
    const legacyStr = typeof legacyRaw === "string" ? legacyRaw : "";
    let cancelled = false;
    (async () => {
      let url = "";
      if (keyStr && !keyStr.startsWith("http"))
        url = await resolveMediaPlaybackUrl(keyStr);
      else if (legacyStr)
        url = legacyStr.startsWith("http")
          ? legacyStr
          : await resolveMediaPlaybackUrl(legacyStr);
      else if (keyStr) url = await resolveMediaPlaybackUrl(keyStr);
      if (!cancelled) setOutputVideoUrl(url || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    outputJob?.id,
    outputJob?.status,
    outputJob?.result?.video_path,
    outputJob?.result?.video_url,
  ]);

  useEffect(() => {
    refreshProject()
      .then((p) => {
        if (p?.scenes?.length)
          setSelectedSceneId((prev) => prev || p.scenes[0].id);
      })
      .catch(() => router.push("/projects"))
      .finally(() => setLoading(false));
    refreshLatestJob().catch(() => {});
    api
      .listExportPresets()
      .then((x) => setExportPresets(x as ExportPresets))
      .catch(() => {});
    api.youtubeChannels().then(setYtStatus).catch(() => {});
  }, [projectId, refreshLatestJob, refreshProject, router]);

  useEffect(() => {
    if (!projectId || project?.status !== "generating") return;
    const interval = setInterval(() => {
      refreshProject().catch(() => {});
      refreshLatestJob().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, project?.status, refreshLatestJob, refreshProject]);

  const handleCompile = async () => {
    if (!projectId || !project) return;
    if (project.status === "completed") {
      const ok = await appConfirm({
        title: "Recompile video?",
        description: "The current final video will be deleted and replaced. Old download/export links will stop working.",
        confirmLabel: "Recompile",
        variant: "default",
      });
      if (!ok) return;
    }
    setCompiling(true);
    try {
      const mergedSettings = {
        ...(project.settings || {}),
        ...subtitleConfig,
        match_scenes_to_audio: matchScenesToAudio,
      };
      try {
        await api.updateProject(projectId, {
          settings: mergedSettings,
          expected_version: project.version,
        });
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 409) {
          notify.error("Version conflict — refreshed.");
          setProject(await api.getProject(projectId));
          return;
        }
        throw e;
      }
      const job = await api.compileVideo(projectId);
      addJob(job);
      setProject((p) =>
        p ? { ...p, status: "generating", settings: mergedSettings } : null,
      );
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setCompiling(false);
    }
  };

  const handleExport = async () => {
    if (!outputJob) return;
    setExporting(true);
    try {
      const result = await api.exportVideo({
        job_id: outputJob.id,
        resolution: exportRes,
        quality: exportQual,
      });
      if (result?.url) {
        window.open(result.url, "_blank");
        notify.success("Export ready!");
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.retryProject(projectId);
      setProject((p) => (p ? { ...p, status: "generating" } : null));
      refreshLatestJob().catch(() => {});
      notify.success("Retry added to queue");
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelProject(projectId);
      setProject((p) => (p ? { ...p, status: "failed" } : null));
      notify.success("Creation stopped");
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDuplicate = async () => {
    if (!project) return;
    setDuplicating(true);
    try {
      const newProject = await api.createProject({
        title: `${project.title} (Copy)`,
        story_type: project.story_type,
        script: project.script,
        control_mode: project.control_mode || "co_pilot",
        settings: project.settings,
        scenes: project.scenes.map((s) => ({
          narration: s.narration,
          subtitle: s.subtitle || s.narration,
          image_prompt: s.image_prompt,
          transition_type: s.transition_type,
          duration: s.duration,
          scene_type: s.scene_type,
          scene_settings: s.scene_settings ?? null,
        })),
      });
      router.push(`/projects/${newProject.id}`);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setDuplicating(false);
    }
  };

  const handleAddScene = async () => {
    setAddingScene(true);
    try {
      await api.addScene(projectId, {
        narration: "",
        subtitle: "",
        image_prompt: "",
        transition_type: "fade",
        duration: 5,
      });
      const updated = await refreshProject();
      const newest = updated.scenes[updated.scenes.length - 1];
      if (newest) setSelectedSceneId(newest.id);
    } finally {
      setAddingScene(false);
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    const ok = await appConfirm({
      title: "Delete scene?",
      description: "This scene and its assets will be permanently removed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.deleteScene(projectId, sceneId);
      const updated = await refreshProject();
      setSelectedSceneId((prev) =>
        prev !== sceneId ? prev : updated.scenes[0]?.id || null,
      );
      notify.success("Scene deleted");
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleRegenerateImage = async (sceneId: string) => {
    setRegeneratingSceneId(sceneId);
    try {
      await api.regenerateSceneImage(projectId, sceneId);
      setProject(await refreshProject());
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegeneratingSceneId(null);
    }
  };

  const handleUploadImage = async (sceneId: string, file: File) => {
    try {
      await api.uploadSceneImage(projectId, sceneId, file);
      refreshProject().catch(() => {});
    } catch {}
  };

  const hasOutputVideo =
    outputJob?.status === "completed" &&
    outputJob.result &&
    !!(outputJob.result.video_path || outputJob.result.video_url);

  if (loading) {
    return <ProjectDetailShellSkeleton />;
  }

  if (!project) return null;

  const isGenerating = project.status === "generating";
  const isFailed = project.status === "failed";
  const selectedImageAsset = selectedScene ? pickLatestAsset(selectedScene.assets, "image") : undefined;
  const selectedImgSrc = assetMediaSrc(selectedImageAsset);
  const ytChannels = ytStatus?.channels || [];
  const ytDefaultId =
    ytStatus?.default_channel_id ||
    ytChannels.find((c) => c.is_default)?.channel_id ||
    null;
  const ytDefaultChannel =
    (ytDefaultId ? ytChannels.find((c) => c.channel_id === ytDefaultId) : undefined) ||
    ytChannels[0];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border/60 bg-zinc-950 text-zinc-100 shadow-sm">
      {/* ─── Breadcrumb + Title Bar ─── */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/80 border-b border-white/6">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center gap-4">
            <button
              onClick={() => router.push("/projects")}
              className="group flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span className="text-sm hidden sm:inline">Library</span>
            </button>

            <ChevronRight className="h-3.5 w-3.5 text-zinc-700" />

            <div className="flex items-center gap-3 min-w-0 flex-1">
              <h1 className="text-base font-semibold text-zinc-100 truncate">
                {project.title}
              </h1>
              <StatusPill status={project.status} />
            </div>

            <div className="flex items-center gap-2">
              {isFailed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                  Retry
                </Button>
              )}
              {isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  <Square className="h-3 w-3 mr-1.5" /> Stop
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-200"
                onClick={handleDuplicate}
                disabled={duplicating}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicate
              </Button>
              <Button
                size="sm"
                className="bg-linear-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shadow-lg shadow-violet-500/20 border-0"
                onClick={() => router.push(`/projects/${projectId}/studio`)}
              >
                <Film className="h-3.5 w-3.5 mr-1.5" />
                Open Studio
              </Button>
              <Button
                size="sm"
                className="bg-linear-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white shadow-lg shadow-cyan-500/20 border-0"
                onClick={handleCompile}
                disabled={compiling || isGenerating}
              >
                {compiling ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Clapperboard className="h-3.5 w-3.5 mr-1.5" />
                )}
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stats Strip ─── */}
      <div className="border-b border-white/4 bg-zinc-900/40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="min-h-11 py-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Hash className="h-3 w-3 shrink-0" />
              <span className="text-zinc-300 font-medium tabular-nums">{scenes.length}</span> scenes
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="text-zinc-300 font-medium tabular-nums">{formatDuration(totalDuration)}</span> runtime
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span className="text-zinc-300 font-medium capitalize truncate max-w-48">{project.story_type || "—"}</span>
            </span>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Calendar className="h-3 w-3 shrink-0" />
              <span className="text-zinc-400">Updated {formatShortDate(project.updated_at)}</span>
            </span>
            {hasOutputVideo && (
              <>
                <div className="h-3 w-px bg-zinc-800" />
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Check className="h-3 w-3" /> Video ready
                </span>
              </>
            )}
            {mostRecentJob?.status === "failed" && mostRecentJob.error && (
              <>
                <div className="h-3 w-px bg-zinc-800" />
                <span className="flex items-center gap-1.5 text-red-400 truncate max-w-xs">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {typeof mostRecentJob.error === "object" && "message" in mostRecentJob.error
                    ? String((mostRecentJob.error as { message?: unknown }).message)
                    : "Error"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-6">

          {/* ─── Left: Preview & Timeline ─── */}
          <div className="space-y-4 min-w-0">

            {/* Preview Area — actions sit below the player so they never cover native video controls */}
            <div className="rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/8 shadow-lg shadow-black/20">
              {isGenerating ? (
                <div className="aspect-video max-h-[56vh] flex flex-col items-center justify-center gap-5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-cyan-500/5 via-transparent to-violet-500/5" />
                  <div className="relative">
                    <div className="h-16 w-16 rounded-2xl bg-linear-to-br from-cyan-500/20 to-violet-500/20 backdrop-blur flex items-center justify-center border border-white/10">
                      <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
                    </div>
                  </div>
                  <div className="text-center relative">
                    <p className="text-sm font-medium text-zinc-200">Creating your video</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                      Scenes and assets are being created. This updates automatically.
                    </p>
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-1 w-8 rounded-full bg-cyan-500/30 overflow-hidden"
                      >
                        <div
                          className="h-full bg-cyan-400 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 200}ms` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : hasOutputVideo && outputVideoUrl ? (
                <>
                  <VideoPlayer
                    url={outputVideoUrl}
                    variant="responsive"
                    className="w-full rounded-none max-h-[56vh]"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-zinc-950/95 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => window.open(outputVideoUrl, "_blank")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      Download
                    </button>
                    {exportPresets && (
                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors disabled:pointer-events-none disabled:opacity-50"
                      >
                        {exporting ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        )}
                        Export
                      </button>
                    )}
                  </div>
                </>
              ) : hasOutputVideo && !outputVideoUrl ? (
                <div className="aspect-video max-h-[56vh] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                </div>
              ) : (
                <div className="aspect-video max-h-[56vh] flex flex-col items-center justify-center gap-5 relative">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-violet-600/[0.07] via-transparent to-transparent" />
                  <div className="relative">
                    <div className="h-20 w-20 rounded-3xl bg-linear-to-br from-violet-500/10 to-cyan-500/10 backdrop-blur border border-white/8 flex items-center justify-center">
                      <Play className="h-8 w-8 text-violet-400 ml-0.5" />
                    </div>
                  </div>
                  <div className="text-center space-y-2 relative">
                    <h2 className="text-lg font-semibold text-zinc-100">No final video yet</h2>
                    <p className="text-sm text-zinc-500 max-w-sm">
                      Review your scenes below, then click <span className="text-cyan-400 font-medium">Export</span> to create the final video.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Filmstrip Timeline ─── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">Scene timeline</h3>
                  <p className="text-[11px] text-zinc-600 mt-0.5 hidden sm:block">
                    Tap a frame to edit. Scroll the strip (or use arrows) to browse. Drag the grip on a scene to reorder.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-white/10 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 shrink-0"
                  onClick={handleAddScene}
                  disabled={addingScene}
                >
                  {addingScene ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Add scene
                </Button>
              </div>

              <div className="flex items-center gap-4 sm:gap-5">
                <button
                  type="button"
                  onClick={() => scrollTimelineStrip(-1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label="Scroll timeline left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => void handleSceneReorder(e)}
                >
                  <SortableContext items={sceneIds} strategy={horizontalListSortingStrategy}>
                    <div
                      ref={timelineStripRef}
                      className={`
                        flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-7
                        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-600/50 hover:scrollbar-thumb-zinc-500/70
                      `}
                      aria-label="Scene thumbnails"
                    >
                      {scenes.length === 0 && (
                        <div className="w-full rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-10 px-4 text-center">
                          <ImageIcon className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                          <p className="text-sm text-zinc-400 mb-3">No scenes in this project yet.</p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                            onClick={handleAddScene}
                            disabled={addingScene}
                          >
                            {addingScene ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                            Add first scene
                          </Button>
                        </div>
                      )}
                      {scenes.map((scene, idx) => {
                        const imageAsset = pickLatestAsset(scene.assets, "image");
                        const imgSrc = assetMediaSrc(imageAsset);
                        const isSelected = scene.id === selectedSceneId;
                        return (
                          <ProjectSceneSortableThumb
                            key={scene.id}
                            scene={scene}
                            idx={idx}
                            isSelected={isSelected}
                            imgSrc={imgSrc}
                            onSelect={() => setSelectedSceneId(scene.id)}
                          />
                        );
                      })}
                      {scenes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAddScene}
                          disabled={addingScene}
                          className="group box-border flex shrink-0 snap-start w-28 sm:w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700/90 bg-zinc-900/40 aspect-16/10 transition-colors hover:border-zinc-500 hover:bg-zinc-900/70 disabled:opacity-50"
                        >
                          {addingScene ? (
                            <Loader2 className="h-4 w-4 text-zinc-600 animate-spin" />
                          ) : (
                            <Plus className="h-5 w-5 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                          )}
                        </button>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>

                <button
                  type="button"
                  onClick={() => scrollTimelineStrip(1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label="Scroll timeline right"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ─── Right: Scene Inspector ─── */}
          <div className="space-y-5 lg:pt-0 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            {selectedScene ? (
              <>
                {/* Scene Preview Card */}
                <div className="rounded-2xl overflow-hidden border border-white/8 bg-zinc-900/60 shadow-md shadow-black/15">
                  <div className="relative aspect-video bg-zinc-800">
                    {selectedImgSrc ? (
                      <img src={selectedImgSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50">
                        <ImageIcon className="h-10 w-10 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-xs font-medium text-white/80">
                        Scene {selectedIdx + 1}
                      </span>
                    </div>
                    {/* Scene image actions */}
                    <div className="absolute bottom-3 right-3 flex gap-1.5">
                      <button
                        onClick={() => handleRegenerateImage(selectedScene.id)}
                        disabled={regeneratingSceneId === selectedScene.id}
                        className="h-8 w-8 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-black/70 transition-colors disabled:opacity-50"
                      >
                        {regeneratingSceneId === selectedScene.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <label className="h-8 w-8 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-black/70 transition-colors cursor-pointer">
                        <Upload className="h-3.5 w-3.5" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadImage(selectedScene.id, f);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Scene Details */}
                  <div className="p-4 space-y-4">
                    {/* Narration */}
                    {selectedScene.narration && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
                          Narration
                        </label>
                        <p className="text-sm text-zinc-300 leading-relaxed">
                          {selectedScene.narration}
                        </p>
                      </div>
                    )}

                    {/* Image Prompt */}
                    {selectedScene.image_prompt && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
                          Image Prompt
                        </label>
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {selectedScene.image_prompt}
                        </p>
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-4 pt-2 border-t border-white/4">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Clock className="h-3 w-3" />
                        <span className="text-zinc-300">{sceneDurationSec(selectedScene).toFixed(1)}s</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="capitalize">{selectedScene.transition_type}</span>
                      </div>
                      {selectedScene.scene_type && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {selectedScene.scene_type}
                        </span>
                      )}
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDeleteScene(selectedScene.id)}
                        aria-label="Delete scene"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
                <Eye className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-400">Select a scene</p>
                <p className="text-xs text-zinc-600 mt-1 max-w-[220px] mx-auto">
                  Choose a frame from the timeline to view narration, prompts, and image tools.
                </p>
              </div>
            )}

            {/* Compile & export — project-wide (not tied to scene selection) */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/50 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Export settings</h3>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  These options apply on the next render. Export uses your latest final video.
                </p>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Render</p>
                <label className="flex items-center gap-3 group cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={subtitleConfig.subtitle_enabled}
                      onChange={(e) =>
                        setSubtitleConfig((c) => ({
                          ...c,
                          subtitle_enabled: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="h-5 w-9 rounded-full bg-zinc-700 peer-checked:bg-cyan-600 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    Enable subtitles
                  </span>
                </label>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative shrink-0">
                      <input
                        type="checkbox"
                        checked={matchScenesToAudio}
                        onChange={(e) => setMatchScenesToAudio(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="h-5 w-9 rounded-full bg-zinc-700 peer-checked:bg-cyan-600 transition-colors" />
                      <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      Sync scenes to audio
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-600 leading-snug pl-12">
                    Each scene stays on-screen for the full narration. Re-render applies this to all scene clips.
                  </p>
                </div>
              </div>

              {hasOutputVideo && exportPresets && (
                <div className="space-y-3 border-t border-white/8 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Export</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-500">Resolution</label>
                      <select
                        className="w-full bg-zinc-800/80 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                        value={exportRes}
                        onChange={(e) => setExportRes(e.target.value)}
                      >
                        {exportPresets.resolutions.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-500">Quality</label>
                      <select
                        className="w-full bg-zinc-800/80 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                        value={exportQual}
                        onChange={(e) => setExportQual(e.target.value)}
                      >
                        {exportPresets.quality.map((q) => (
                          <option key={q.id} value={q.id}>{q.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white sm:w-auto"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
                    Export Video
                  </Button>
                </div>
              )}
            </div>

            {ytStatus && (
              <div className="rounded-2xl border border-white/8 bg-zinc-900/50 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">YouTube</h3>
                {ytStatus.connected ? (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-zinc-400">
                      {ytDefaultChannel?.channel_title || "Connected"}{ytChannels.length > 1 ? ` · ${ytChannels.length} channels` : ""}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-zinc-600" />
                    <span className="text-sm text-zinc-500">Not connected</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-cyan-400 hover:text-cyan-300 ml-auto"
                      onClick={() => router.push("/settings")}
                    >
                      <Settings className="h-3 w-3 mr-1" /> Connect
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
