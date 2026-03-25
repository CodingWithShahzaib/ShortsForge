"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Play, GripVertical, ImageIcon, Volume2, Trash2, RefreshCw, Plus, RotateCcw, Download, Copy, Upload, Share, StopCircle, Film, Type, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, getMediaUrl, ApiError } from "@/lib/api";
import { AICoPilot } from "@/components/editor/AICoPilot";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import type { Project, Scene, Job, Asset, SceneSettings } from "@/lib/types";

type ExportPreset = { id: string; label: string };
type ExportPresets = { resolutions: ExportPreset[]; quality: ExportPreset[] };

function pickLatestAsset(assets: Asset[] | undefined, type: string): Asset | undefined {
  if (!assets?.length) return undefined;
  return [...assets]
    .filter((a) => a.type === type && a.is_active !== false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

function assetMediaSrc(asset: Asset | undefined): string {
  if (!asset) return "";
  return getMediaUrl(asset.url || asset.file_path || "");
}

function formatAssetWhen(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function pickLatestProjectJob(jobs: Job[]): Job | null {
  if (!jobs.length) return null;
  const statusWeight: Record<string, number> = {
    in_progress: 5,
    queued: 4,
    failed: 3,
    completed: 2,
    cancelled: 1,
  };
  return [...jobs].sort((a, b) => {
    const wa = statusWeight[a.status] ?? 0;
    const wb = statusWeight[b.status] ?? 0;
    if (wa !== wb) return wb - wa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

export default function ProjectDetailPage() {
  const addJob = useProjectStore((s) => s.addJob);
  const pathname = usePathname();
  const router = useRouter();
  const projectId = pathname.split("/").filter(Boolean).pop() || "";
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [sceneEditorDirty, setSceneEditorDirty] = useState(false);
  const [latestJob, setLatestJob] = useState<Job | null>(null);
  const [exportPresets, setExportPresets] = useState<ExportPresets | null>(null);
  const [exportRes, setExportRes] = useState("youtube_landscape");
  const [exportQual, setExportQual] = useState("medium");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; resolution: string } | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [addingScene, setAddingScene] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const [incrementingSceneId, setIncrementingSceneId] = useState<string | null>(null);
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
  const [syncingSubtitles, setSyncingSubtitles] = useState(false);
  const [pendingDeleteSceneId, setPendingDeleteSceneId] = useState<string | null>(null);
  const [armedAction, setArmedAction] = useState<string | null>(null);
  const activePollersRef = useRef(new Set<string>());
  const projectStatus = project?.status;

  const requireConfirm = (key: string, message: string) => {
    if (armedAction !== key) {
      setArmedAction(key);
      toast.message(message);
      return false;
    }
    setArmedAction(null);
    return true;
  };

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

  const refreshLatestJob = useCallback(async () => {
    const jobs = await api.listJobs({ limit: 100 });
    const projectJobs = jobs.filter((j: Job) => j.project_id === projectId);
    setLatestJob(pickLatestProjectJob(projectJobs));
  }, [projectId]);

  useEffect(() => {
    refreshProject()
      .then((p) => {
        if (p?.scenes?.length) setSelectedSceneId((prev) => prev || p.scenes[0].id);
      })
      .catch(() => router.push("/projects"))
      .finally(() => setLoading(false));
    refreshLatestJob().catch(() => {});
    api.listExportPresets().then((x) => setExportPresets(x as ExportPresets)).catch(() => {});
  }, [projectId, refreshLatestJob, refreshProject, router]);

  // Poll project when generating so we pick up ready_for_edit status
  useEffect(() => {
    if (!projectId || projectStatus !== "generating") return;
    const interval = setInterval(() => {
      refreshProject().catch(() => {});
      refreshLatestJob().catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, projectStatus, refreshLatestJob, refreshProject]);

  useEffect(() => {
    if (!project?.scenes?.length) {
      setSelectedSceneId(null);
      return;
    }
    if (!selectedSceneId || !project.scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(project.scenes[0].id);
    }
  }, [project, selectedSceneId]);

  const handleExport = async () => {
    if (!latestJob) return;
    setExporting(true);
    setExportResult(null);
    try {
      const result = await api.exportVideo({ job_id: latestJob.id, resolution: exportRes, quality: exportQual });
      setExportResult(result);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const startPollJob = useCallback((jobId: string, onDone: () => void) => {
    if (activePollersRef.current.has(jobId)) return;
    activePollersRef.current.add(jobId);
    const iv = setInterval(async () => {
      try {
        const j = await api.getJob(jobId);
        if (j.status === "completed" || j.status === "failed") {
          clearInterval(iv);
          activePollersRef.current.delete(jobId);
          onDone();
          if (j.status === "failed") {
            const msg =
              typeof j.error === "object" && j.error && "message" in j.error
                ? String((j.error as { message?: string }).message)
                : "Job failed";
            toast.error(msg);
          }
        }
      } catch {
        clearInterval(iv);
        activePollersRef.current.delete(jobId);
      }
    }, 2000);
  }, []);

  const handleQueueAssetJob = async (sceneId: string, asset_type: "image" | "audio") => {
    try {
      const job = await api.queueSceneAssetGenerate(projectId, sceneId, { asset_type });
      addJob(job);
      startPollJob(job.id, () => {
        refreshProject().catch(() => {});
        refreshLatestJob().catch(() => {});
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not queue generation");
    }
  };

  const handleIncrementalScene = async (sceneId: string) => {
    if (!requireConfirm(`incremental-${sceneId}`, "Press incremental again to confirm scene-only render.")) {
      return;
    }
    setIncrementingSceneId(sceneId);
    try {
      const job = await api.incrementalRenderVideo(projectId, [sceneId]);
      addJob(job);
      setProject((p) => (p ? { ...p, status: "generating" } : null));
      startPollJob(job.id, () => {
        refreshProject().catch(() => {});
        refreshLatestJob().catch(() => {});
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Incremental render failed");
    } finally {
      setIncrementingSceneId(null);
    }
  };

  const handleUpdateScene = async (sceneId: string, data: Partial<Scene>) => {
    try {
      await api.updateScene(projectId, sceneId, {
        ...data,
        expected_version: project?.version,
      } as Record<string, unknown>);
      const updated = await refreshProject();
      setSelectedSceneId(updated.scenes.some((s) => s.id === sceneId) ? sceneId : updated.scenes[0]?.id || null);
      setSceneEditorDirty(false);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Someone else saved changes first — refreshed the project.");
        try {
          const updated = await refreshProject();
          setProject(updated);
        } catch {
          /* ignore */
        }
        return;
      }
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!requireConfirm(`delete-scene-${sceneId}`, "Press delete again to confirm scene deletion.")) return;
    setPendingDeleteSceneId(sceneId);
    try {
      await api.deleteScene(projectId, sceneId);
      const updated = await refreshProject();
      setSelectedSceneId((prev) => {
        if (prev !== sceneId) return prev;
        return updated.scenes[0]?.id || null;
      });
      toast.success("Scene deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setPendingDeleteSceneId(null);
    }
  };

  const handleAddScene = async () => {
    setAddingScene(true);
    try {
      await api.addScene(projectId, { narration: "", subtitle: "", image_prompt: "", transition_type: "fade", duration: 5 });
      const updated = await refreshProject();
      const newest = updated.scenes[updated.scenes.length - 1];
      if (newest) setSelectedSceneId(newest.id);
    } finally {
      setAddingScene(false);
    }
  };

  const handleSyncAllSubtitlesFromNarration = async () => {
    if (!project?.scenes.length) return;
    setSyncingSubtitles(true);
    const total = project.scenes.length;
    if (!requireConfirm("sync-subtitles", `Press again to copy narration into subtitle for ${total} scenes.`)) {
      setSyncingSubtitles(false);
      return;
    }
    try {
      await Promise.all(
        project.scenes.map((s) => api.updateScene(projectId, s.id, { subtitle: s.narration || "" })),
      );
      const updated = await refreshProject();
      setProject(updated);
      toast.success("Subtitles updated to match narration for all scenes");
    } catch (e) {
      toast.error((e as Error).message || "Could not update scenes");
    } finally {
      setSyncingSubtitles(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.retryProject(projectId);
      setProject((p) => (p ? { ...p, status: "generating" } : null));
      refreshLatestJob().catch(() => {});
      toast.success("Retry queued");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!requireConfirm("cancel-project", "Press stop again to confirm cancel.")) return;
    setCancelling(true);
    try {
      await api.cancelProject(projectId);
      setProject((p) => (p ? { ...p, status: "failed" } : null));
      toast.success("Generation stopped");
    } catch (e) {
      toast.error((e as Error).message);
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
        control_mode: project.control_mode || "autopilot",
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
      toast.error((e as Error).message);
    } finally {
      setDuplicating(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project) return;
    const oldIdx = project.scenes.findIndex((s) => s.id === active.id);
    const newIdx = project.scenes.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(project.scenes, oldIdx, newIdx);
    const prevScenes = project.scenes;
    setProject({ ...project, scenes: reordered });
    try {
      await api.reorderScenes(projectId, reordered.map((s) => s.id));
    } catch (e: unknown) {
      setProject({ ...project, scenes: prevScenes });
      toast.error(e instanceof Error ? e.message : "Could not reorder scenes");
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) return null;

  const handleRegenerateImage = async (sceneId: string) => {
    setRegeneratingSceneId(sceneId);
    try {
      await api.regenerateSceneImage(projectId, sceneId);
      const updated = await refreshProject();
      setProject(updated);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegeneratingSceneId(null);
    }
  };
  const handleCompile = async () => {
    if (!projectId || !project) return;
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
          toast.error("Version conflict while saving compile options — refreshed.");
          const updated = await api.getProject(projectId);
          setProject(updated);
          return;
        }
        throw e;
      }
      const job = await api.compileVideo(projectId);
      addJob(job);
      setProject((p) => (p ? { ...p, status: "generating", settings: mergedSettings } : null));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Compile failed");
    } finally {
      setCompiling(false);
    }
  };

  const videoPath = latestJob?.status === "completed"
    ? (latestJob.result?.video_url || latestJob.result?.video_path)
    : null;
  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) || project.scenes[0] || null;

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <section className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/projects")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={project.status} />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {project.story_type} &middot; {project.scenes.length} scenes
              {project.control_mode && project.control_mode !== "autopilot" ? (
                <> &middot; <span className="text-cyan-600 dark:text-cyan-400">{project.control_mode}</span></>
              ) : null}
              {typeof project.version === "number" ? <> &middot; v{project.version}</> : null}
            </span>
          </div>
        </div>
      </section>

      <Card className="sticky top-2 z-20 border-cyan-500/20">
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            Primary action:
            <span className="ml-1 font-medium text-foreground">
              {project.status === "ready_for_edit"
                ? "Compile video"
                : project.status === "generating"
                  ? "Stop generation"
                  : project.status === "failed"
                    ? "Retry generation"
                    : "Review output"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {project.status === "ready_for_edit" && (
              <Button variant="animated" onClick={handleCompile} loading={compiling} loadingLabel="Compiling...">
                <Film className="h-4 w-4" /> Compile Video
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDuplicate} loading={duplicating} loadingLabel="Cloning...">
              <Copy className="h-4 w-4" /> Clone
            </Button>
            {project.status === "generating" && (
              <Button variant="destructive" size="sm" onClick={handleCancel} loading={cancelling} loadingLabel="Stopping...">
                <StopCircle className="h-4 w-4" /> Stop
              </Button>
            )}
            {project.status === "failed" && (
              <Button variant="animated" onClick={handleRetry} loading={retrying} loadingLabel="Retrying...">
                <RotateCcw className="h-4 w-4" /> Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {project.status === "ready_for_edit" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Type className="h-5 w-5" /> Compile Options</CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">Configure video compilation before building the final video.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="match-audio"
                checked={matchScenesToAudio}
                onChange={(e) => setMatchScenesToAudio(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="match-audio" className="text-sm font-medium cursor-pointer">Match scenes to audio duration</label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">When enabled, each scene will display for exactly its narration audio length. If your audio is 2 seconds total, the video will be 2 seconds.</p>
            <div className="border-t border-slate-200 dark:border-zinc-700 pt-4">
              <p className="text-sm font-medium mb-2">Subtitles</p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sub-enable"
                checked={subtitleConfig.subtitle_enabled}
                onChange={(e) => setSubtitleConfig((c) => ({ ...c, subtitle_enabled: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="sub-enable" className="text-sm font-medium cursor-pointer">Enable subtitles</label>
            </div>
            {subtitleConfig.subtitle_enabled && (
              <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Subtitle Source</label>
                  <Select value={subtitleConfig.subtitle_source} onValueChange={(v: "llm" | "transcription") => setSubtitleConfig((c) => ({ ...c, subtitle_source: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm">LLM-generated</SelectItem>
                      <SelectItem value="transcription">Audio transcription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {subtitleConfig.subtitle_source === "llm" && (
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="proj-gen-sub" checked={subtitleConfig.generate_subtitles} onChange={(e) => setSubtitleConfig((c) => ({ ...c, generate_subtitles: e.target.checked }))} className="rounded" />
                    <label htmlFor="proj-gen-sub" className="text-sm font-medium cursor-pointer">Generate with LLM</label>
                  </div>
                )}
                {subtitleConfig.subtitle_source === "transcription" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcription provider</label>
                      <Select value={subtitleConfig.transcription_provider} onValueChange={(v) => setSubtitleConfig((c) => ({ ...c, transcription_provider: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI (Whisper)</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                      <Input placeholder="en" value={subtitleConfig.transcription_language} onChange={(e) => setSubtitleConfig((c) => ({ ...c, transcription_language: e.target.value }))} className="mt-1" />
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Font</label>
                  <Select value={subtitleConfig.subtitle_font} onValueChange={(v) => setSubtitleConfig((c) => ({ ...c, subtitle_font: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Font" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Arial", "Montserrat", "Roboto", "Impact", "Open Sans", "Georgia"].map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Size</label>
                  <Input
                    type="number"
                    min={12}
                    max={72}
                    value={subtitleConfig.subtitle_size}
                    onChange={(e) => setSubtitleConfig((c) => ({ ...c, subtitle_size: parseInt(e.target.value) || 48 }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Color</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={subtitleConfig.subtitle_color}
                      onChange={(e) => setSubtitleConfig((c) => ({ ...c, subtitle_color: e.target.value }))}
                      className="h-10 w-14 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={subtitleConfig.subtitle_color}
                      onChange={(e) => setSubtitleConfig((c) => ({ ...c, subtitle_color: e.target.value }))}
                      className="flex-1 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Position</label>
                  <Select value={subtitleConfig.subtitle_position} onValueChange={(v: "bottom" | "top" | "center") => setSubtitleConfig((c) => ({ ...c, subtitle_position: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom">Bottom</SelectItem>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </>
            )}
            </div>
          </CardContent>
        </Card>
      )}

      {project.status === "completed" && videoPath && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Play className="h-5 w-5" /> Output Video</CardTitle>
              <a href={getMediaUrl(videoPath)} download>
                <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Download MP4</Button>
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <video controls className="w-full rounded-lg max-h-[500px] bg-black">
              <source src={getMediaUrl(videoPath)} type="video/mp4" />
            </video>
            {latestJob?.result && (
              <div className="flex gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                {latestJob.result.duration && <span>Duration: {Math.round(latestJob.result.duration)}s</span>}
                {latestJob.result.resolution && <span>Resolution: {latestJob.result.resolution}</span>}
                {latestJob.result.scenes && <span>Scenes: {latestJob.result.scenes}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {project.status === "completed" && videoPath && exportPresets && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Share className="h-5 w-5" /> Export to Different Format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Resolution / Platform</label>
                <Select value={exportRes} onValueChange={setExportRes}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    {exportPresets.resolutions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Quality</label>
                <Select value={exportQual} onValueChange={setExportQual}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {exportPresets.quality.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exporting...</>
                ) : (
                  <><Share className="h-4 w-4 mr-1" /> Export Video</>
                )}
              </Button>
              {exportResult && (
                <a href={getMediaUrl(exportResult.url)} download>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Download ({exportResult.resolution})</Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {latestJob?.status === "failed" && latestJob.error && (
        <Card className="border-rose-200 dark:border-rose-800">
          <CardContent className="py-4">
            <p className="text-sm text-rose-600 dark:text-rose-400">
              Last job failed: {typeof latestJob.error === "object"
                ? ((latestJob.error as { message?: unknown }).message
                    ? String((latestJob.error as { message?: unknown }).message)
                    : JSON.stringify(latestJob.error))
                : String(latestJob.error)}
            </p>
          </CardContent>
        </Card>
      )}

      {project.script && (
        <Card>
          <CardHeader><CardTitle className="text-base">Script</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{project.script}</p></CardContent>
        </Card>
      )}

      <section className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Scenes ({project.scenes.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAllSubtitlesFromNarration}
            disabled={syncingSubtitles || !project.scenes.length}
            title="Set each scene’s subtitle to its narration (saved immediately)"
            loading={syncingSubtitles}
            loadingLabel="Syncing..."
          >
            <ArrowDownToLine className="h-4 w-4" />
            Copy narration → subtitle (all)
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddScene} loading={addingScene} loadingLabel="Adding...">
            <Plus className="h-4 w-4" /> Add Scene
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 items-start">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={project.scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {project.scenes.map((scene, idx) => (
                <SortableSceneCard
                  key={scene.id}
                  scene={scene}
                  idx={idx}
                  selected={selectedScene?.id === scene.id}
                  onSelect={() => {
                    if (sceneEditorDirty && selectedScene && selectedScene.id !== scene.id) {
                      const leave = window.confirm("You have unsaved scene edits. Discard and switch scene?");
                      if (!leave) return;
                      setSceneEditorDirty(false);
                    }
                    setSelectedSceneId(scene.id);
                  }}
                  onDelete={handleDeleteScene}
                  deleteLoading={pendingDeleteSceneId === scene.id}
                  onRegenerate={() => handleRegenerateImage(scene.id)}
                  regenerating={regeneratingSceneId === scene.id}
                  projectId={projectId}
                  onRefresh={() => refreshProject().catch(() => {})}
                  projectSettings={project.settings}
                  matchScenesToAudio={matchScenesToAudio}
                  projectStatus={project.status}
                  onQueueAsset={(type) => handleQueueAssetJob(scene.id, type)}
                  incrementing={incrementingSceneId === scene.id}
                  onIncremental={() => handleIncrementalScene(scene.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle className="text-base">Selected Scene Details</CardTitle>
          </CardHeader>
          <CardContent className="xl:max-h-[calc(100vh-9rem)] xl:overflow-auto">
            {selectedScene ? (
              <SceneEditor
                key={selectedScene.id}
                scene={selectedScene}
                onSave={(data) => handleUpdateScene(selectedScene.id, data)}
                onCancel={() => setSceneEditorDirty(false)}
                onDirtyChange={setSceneEditorDirty}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a scene to edit.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <AICoPilot projectId={projectId} controlMode={project.control_mode || "autopilot"} />
    </div>
  );
}

function SortableSceneCard({
  scene,
  idx,
  selected,
  onSelect,
  onDelete,
  deleteLoading,
  onRegenerate,
  regenerating,
  projectId,
  onRefresh,
  projectSettings,
  matchScenesToAudio,
  projectStatus,
  onQueueAsset,
  incrementing,
  onIncremental,
}: {
  scene: Scene;
  idx: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
  deleteLoading: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
  projectId: string;
  onRefresh: () => void;
  projectSettings?: Record<string, unknown>;
  matchScenesToAudio: boolean;
  projectStatus: string;
  onQueueAsset: (type: "image" | "audio") => void;
  incrementing: boolean;
  onIncremental: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const imageAsset = pickLatestAsset(scene.assets, "image");
  const audioAsset = pickLatestAsset(scene.assets, "audio");
  const imageSrc = assetMediaSrc(imageAsset);
  const ss = scene.scene_settings || {};
  const res = projectSettings?.resolution as string | undefined;
  const imgProv = (ss.image_provider as string) || (projectSettings?.image_provider as string) || "—";
  const imgStyle = (ss.image_style as string) || (projectSettings?.image_style as string) || "—";
  const meta = imageAsset?.metadata && typeof imageAsset.metadata === "object" ? imageAsset.metadata as Record<string, unknown> : null;
  const renderedStyle = meta && typeof meta.style === "string" ? meta.style : null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadSceneImage(projectId, scene.id, file);
      onRefresh();
    } catch {}
    e.target.value = "";
  };

  const imgAlt = scene.image_prompt ? scene.image_prompt.slice(0, 120) : `Scene ${idx + 1}`;

  return (
    <Card ref={setNodeRef} style={style} className={cn("overflow-hidden", selected && "border-cyan-500/50")}>
      <div className="flex">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-12 bg-slate-50 dark:bg-zinc-800/70 border-r border-slate-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        <div className="flex-1 p-4 min-w-0" role="button" tabIndex={0} onClick={onSelect} onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Scene {idx + 1}</Badge>
              {selected ? <Badge variant="inProgress">selected</Badge> : null}
              {scene.is_locked ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
                  locked
                </Badge>
              ) : null}
              <Badge variant="secondary">
                <ImageIcon className="h-3 w-3 mr-1" />
                {scene.scene_type || "image"}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {scene.duration}s &middot; {scene.transition_type}
              </span>
              {matchScenesToAudio && (
                <span className="text-[10px] text-amber-600/90 dark:text-amber-400/90" title="After compile, scene length follows narration audio when this option is enabled">
                  audio-sync
                </span>
              )}
            </div>
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <label className="cursor-pointer" title="Upload image">
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif" onChange={handleImageUpload} className="hidden" />
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                  <Upload className="h-3.5 w-3.5" />
                </span>
              </label>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Regenerate from prompt" onClick={onRegenerate} disabled={regenerating || !scene.image_prompt}>
                {regenerating ? <div className="h-3.5 w-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              {(projectStatus === "ready_for_edit" || projectStatus === "completed") && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px]"
                    title="Queue background image generation"
                    onClick={() => onQueueAsset("image")}
                    disabled={!scene.image_prompt}
                  >
                    Generate image job
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px]"
                    title="Queue background narration generation"
                    onClick={() => onQueueAsset("audio")}
                    disabled={!scene.narration?.trim()}
                  >
                    Generate narration job
                  </Button>
                </>
              )}
              {projectStatus === "completed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[10px]"
                  title="Re-render final video; only this scene gets new clips"
                  onClick={onIncremental}
                  disabled={incrementing}
                >
                  {incrementing ? <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none" /> : "Re-render scene"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => onDelete(scene.id)} loading={deleteLoading} loadingLabel="">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[168px_minmax(0,1fr)] sm:items-start">
            <div className="w-full sm:w-[168px] justify-self-center sm:justify-self-start">
              <div className="relative aspect-9/16 w-full max-w-[168px] mx-auto sm:mx-0 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-900">
                {imageSrc ? (
                  <a href={imageSrc} target="_blank" rel="noopener noreferrer" className="block h-full w-full" title="Open full image">
                    <img src={imageSrc} alt={imgAlt} className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center p-2 text-center text-xs text-slate-500 dark:text-slate-400">
                    No image yet
                    {scene.image_prompt ? (
                      <button type="button" className="mt-2 text-cyan-600 dark:text-cyan-400 hover:underline" onClick={onRegenerate} disabled={regenerating}>
                        Generate
                      </button>
                    ) : null}
                  </div>
                )}
                {regenerating && (
                  <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                    <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {imageAsset && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-500 dark:text-slate-400 max-w-[168px] mx-auto sm:mx-0">
                  <div className="flex flex-wrap gap-1">
                    {imageAsset.provider && <Badge variant="outline" className="text-[9px] px-1 py-0">{imageAsset.provider}</Badge>}
                    {formatAssetWhen(imageAsset.created_at) && <span>{formatAssetWhen(imageAsset.created_at)}</span>}
                  </div>
                  {meta && Object.keys(meta).length > 0 && (
                    <p className="font-mono truncate" title={JSON.stringify(meta)}>
                      {Object.entries(meta)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="min-w-0 w-full max-w-2xl space-y-3">
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {res && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {res}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="font-normal text-muted-foreground"
                  title="Provider used the last time this image was generated or when you click Regenerate"
                >
                  img: {imgProv}
                </Badge>
                <Badge
                  variant="outline"
                  className="font-normal text-muted-foreground"
                  title="Style preset for Regenerate / full render. Thumbnails keep older files if you change settings afterward."
                >
                  preset: {imgStyle}
                </Badge>
                {renderedStyle && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-normal",
                      imgStyle !== "—" &&
                        renderedStyle.toLowerCase() !== String(imgStyle).toLowerCase() &&
                        "border-amber-500/40 text-amber-700 dark:text-amber-300/90",
                    )}
                    title="Style stored on this image when it was generated (may differ from the current preset above)"
                  >
                    file: {renderedStyle}
                  </Badge>
                )}
                {(ss.image_provider || ss.image_style || ss.negative_prompt || ss.seed !== undefined) && (
                  <Badge variant="secondary" className="text-[9px]">
                    scene overrides
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                {scene.narration && (
                  <p className="text-sm leading-relaxed line-clamp-2">
                    <Volume2 className="h-3.5 w-3.5 inline mr-1 text-slate-400 align-text-bottom" />
                    {scene.narration}
                  </p>
                )}
                {scene.subtitle && scene.subtitle !== scene.narration && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-1">
                    <Type className="h-3 w-3 inline mr-1 align-text-bottom" />
                    Subtitle: {scene.subtitle}
                  </p>
                )}
                {scene.image_prompt && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                    <ImageIcon className="h-3 w-3 inline mr-1 align-text-bottom" />
                    {scene.image_prompt}
                  </p>
                )}
                {(scene.trim_start_sec || scene.trim_end_sec) ? (
                  <p className="text-[10px] text-muted-foreground">
                    Trim: start {scene.trim_start_sec ?? 0}s · end {scene.trim_end_sec ?? 0}s
                  </p>
                ) : null}
                {audioAsset && assetMediaSrc(audioAsset) && (
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Narration audio</p>
                    <audio controls className="h-9 w-full max-w-md" src={assetMediaSrc(audioAsset)} preload="metadata" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

const IMAGE_STYLES = [
  { id: "realistic", name: "Realistic" },
  { id: "anime", name: "Anime" },
  { id: "cinematic", name: "Cinematic" },
  { id: "illustration", name: "Illustration" },
];

function SceneEditor({
  scene,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  scene: Scene;
  onSave: (data: Partial<Scene>) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState({
    narration: scene.narration || "",
    subtitle: scene.subtitle || scene.narration || "",
    image_prompt: scene.image_prompt || "",
    transition_type: scene.transition_type,
    duration: scene.duration,
    scene_type: scene.scene_type,
    is_locked: !!scene.is_locked,
    user_notes: scene.user_notes || "",
    trim_start_sec: scene.trim_start_sec ?? 0,
    trim_end_sec: scene.trim_end_sec ?? 0,
  });
  const baseSs = (scene.scene_settings || {}) as SceneSettings;
  const [ovProvider, setOvProvider] = useState(String(baseSs.image_provider || ""));
  const [ovStyle, setOvStyle] = useState(String(baseSs.image_style || ""));
  const [ovNeg, setOvNeg] = useState(String(baseSs.negative_prompt || ""));
  const [ovSeed, setOvSeed] = useState(baseSs.seed !== undefined && baseSs.seed !== null ? String(baseSs.seed) : "");
  const [transitions, setTransitions] = useState<{ id: string; name: string; description?: string }[]>([]);
  const [imageProviders, setImageProviders] = useState<{ name: string; configured?: boolean }[]>([]);

  useEffect(() => {
    const baseNarration = scene.narration || "";
    const baseSubtitle = scene.subtitle || scene.narration || "";
    const basePrompt = scene.image_prompt || "";
    const baseNotes = scene.user_notes || "";
    const baseStart = scene.trim_start_sec ?? 0;
    const baseEnd = scene.trim_end_sec ?? 0;
    const dirty =
      form.narration !== baseNarration ||
      form.subtitle !== baseSubtitle ||
      form.image_prompt !== basePrompt ||
      form.user_notes !== baseNotes ||
      form.trim_start_sec !== baseStart ||
      form.trim_end_sec !== baseEnd ||
      form.duration !== scene.duration ||
      form.transition_type !== scene.transition_type ||
      form.scene_type !== scene.scene_type ||
      form.is_locked !== !!scene.is_locked ||
      ovProvider !== String(baseSs.image_provider || "") ||
      ovStyle !== String(baseSs.image_style || "") ||
      ovNeg !== String(baseSs.negative_prompt || "") ||
      ovSeed !== (baseSs.seed !== undefined && baseSs.seed !== null ? String(baseSs.seed) : "");
    onDirtyChange(dirty);
  }, [baseSs.image_provider, baseSs.image_style, baseSs.negative_prompt, baseSs.seed, form, onDirtyChange, ovNeg, ovProvider, ovSeed, ovStyle, scene.duration, scene.image_prompt, scene.is_locked, scene.narration, scene.scene_type, scene.subtitle, scene.transition_type, scene.trim_end_sec, scene.trim_start_sec, scene.user_notes]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTransitions(), api.listProviders()])
      .then(([t, p]) => {
        if (cancelled) return;
        setTransitions(Array.isArray(t) ? t : []);
        setImageProviders(p?.image || []);
      })
      .catch(() => {
        if (!cancelled) {
          setTransitions([]);
          setImageProviders([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildSceneSettings = (): SceneSettings | null => {
    const next: SceneSettings = { ...(scene.scene_settings || {}) };
    if (ovProvider.trim()) next.image_provider = ovProvider.trim();
    else delete next.image_provider;
    if (ovStyle.trim()) next.image_style = ovStyle.trim();
    else delete next.image_style;
    if (ovNeg.trim()) next.negative_prompt = ovNeg.trim();
    else delete next.negative_prompt;
    if (ovSeed.trim()) next.seed = ovSeed.trim();
    else delete next.seed;
    const keys = Object.keys(next).filter((k) => next[k] !== undefined && next[k] !== "");
    if (keys.length === 0) return null;
    const cleaned: SceneSettings = {};
    for (const k of keys) cleaned[k] = next[k];
    return cleaned;
  };

  const handleSave = () => {
    onSave({
      ...form,
      scene_settings: buildSceneSettings(),
      user_notes: form.user_notes.trim() || null,
    });
    onDirtyChange(false);
  };

  const transitionFallback = useMemo(
    () => [
      { id: "fade", name: "Fade" },
      { id: "dissolve", name: "Dissolve" },
      { id: "wipeleft", name: "Wipe Left" },
      { id: "zoom_in", name: "Zoom In" },
      { id: "zoom_out", name: "Zoom Out" },
      { id: "pan_left", name: "Pan Left" },
      { id: "pan_right", name: "Pan Right" },
    ],
    [],
  );

  const transitionItems = useMemo(() => {
    const base = transitions.length > 0 ? transitions : transitionFallback;
    if (base.some((t) => t.id === form.transition_type)) return base;
    return [...base, { id: form.transition_type, name: form.transition_type }];
  }, [transitions, transitionFallback, form.transition_type]);

  return (
    <div className="space-y-3">
      <Textarea placeholder="Narration text..." rows={2} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
      <div className="flex justify-end mt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setForm((f) => ({ ...f, subtitle: f.narration }))}
          disabled={!form.narration.trim()}
          title="Fill subtitle with the same text as narration (apply with Save)"
        >
          <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />
          Copy narration → subtitle
        </Button>
      </div>
      <Textarea placeholder="Subtitle (on-screen caption, optional)..." rows={2} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
      <Textarea placeholder="Image prompt..." rows={2} value={form.image_prompt} onChange={(e) => setForm({ ...form, image_prompt: e.target.value })} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_locked}
            onChange={(e) => setForm({ ...form, is_locked: e.target.checked })}
            className="rounded"
          />
          Lock scene (skip automated overwrites of narration / prompts when merging storyboards)
        </label>
      </div>
      <Textarea
        placeholder="Private notes (not burned into video)…"
        rows={2}
        value={form.user_notes}
        onChange={(e) => setForm({ ...form, user_notes: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Trim start (sec)</label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={form.trim_start_sec}
            onChange={(e) => setForm({ ...form, trim_start_sec: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Trim end (sec)</label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={form.trim_end_sec}
            onChange={(e) => setForm({ ...form, trim_end_sec: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select value={form.scene_type || "image"} onValueChange={(value) => setForm({ ...form, scene_type: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Scene type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.transition_type} onValueChange={(value) => setForm({ ...form, transition_type: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Transition" />
          </SelectTrigger>
          <SelectContent>
            {transitionItems.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name || t.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" min={2} max={30} step={0.5} value={form.duration} onChange={(e) => setForm({ ...form, duration: parseFloat(e.target.value) })} />
      </div>

      <details className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/40 px-3 py-2">
        <summary className="text-sm font-medium cursor-pointer text-slate-700 dark:text-slate-200">Image generation overrides (optional)</summary>
        <p className="text-xs text-muted-foreground mt-2 mb-3">Leave blank to use project defaults. Applies to regenerate and full render.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Image provider</label>
            <Select value={ovProvider || "__default__"} onValueChange={(v) => setOvProvider(v === "__default__" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Project default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Project default</SelectItem>
                {imageProviders.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                    {p.configured === false ? " (not configured)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Image style</label>
            <Select value={ovStyle || "__default__"} onValueChange={(v) => setOvStyle(v === "__default__" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Project default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Project default</SelectItem>
                {IMAGE_STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Negative prompt</label>
            <Textarea className="mt-1" rows={2} value={ovNeg} onChange={(e) => setOvNeg(e.target.value)} placeholder="Things to avoid (provider-dependent)" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Seed</label>
            <Input className="mt-1" value={ovSeed} onChange={(e) => setOvSeed(e.target.value)} placeholder="Optional integer" />
          </div>
        </div>
      </details>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
