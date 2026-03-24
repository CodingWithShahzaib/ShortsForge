"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Play, GripVertical, Image, Volume2, Trash2, RefreshCw, Plus, RotateCcw, Download, Copy, Upload, Share, StopCircle, Pencil, Film, Type, ArrowDownToLine } from "lucide-react";
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

export default function ProjectDetailPage() {
  const addJob = useProjectStore((s) => s.addJob);
  const pathname = usePathname();
  const router = useRouter();
  const projectId = pathname.split("/").filter(Boolean).pop() || "";
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [latestJob, setLatestJob] = useState<Job | null>(null);
  const [exportPresets, setExportPresets] = useState<{ resolutions: any[]; quality: any[] } | null>(null);
  const [exportRes, setExportRes] = useState("youtube_landscape");
  const [exportQual, setExportQual] = useState("medium");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; resolution: string } | null>(null);
  const [compiling, setCompiling] = useState(false);
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

  useEffect(() => {
    api.getProject(projectId)
      .then((p) => {
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
      })
      .catch(() => router.push("/projects"))
      .finally(() => setLoading(false));
    api.listJobs({ limit: 100 })
      .then((jobs) => {
        const projectJobs = jobs
          .filter((j: Job) => j.project_id === projectId)
          .sort((a: Job, b: Job) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (projectJobs.length > 0) setLatestJob(projectJobs[0]);
      })
      .catch(() => {});
    api.listExportPresets().then(setExportPresets).catch(() => {});
  }, [projectId, router]);

  // Poll project when generating so we pick up ready_for_edit status
  useEffect(() => {
    if (!projectId || !project || project.status !== "generating") return;
    const interval = setInterval(() => {
      api.getProject(projectId).then(setProject).catch(() => {});
      api.listJobs({ limit: 100 }).then((jobs) => {
        const projectJobs = jobs
          .filter((j: Job) => j.project_id === projectId)
          .sort((a: Job, b: Job) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (projectJobs.length > 0) setLatestJob(projectJobs[0]);
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, project?.status]);

  const handleExport = async () => {
    if (!latestJob) return;
    setExporting(true);
    setExportResult(null);
    try {
      const result = await api.exportVideo({ job_id: latestJob.id, resolution: exportRes, quality: exportQual });
      setExportResult(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  const startPollJob = useCallback((jobId: string, onDone: () => void) => {
    const iv = setInterval(async () => {
      try {
        const j = await api.getJob(jobId);
        if (j.status === "completed" || j.status === "failed") {
          clearInterval(iv);
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
      }
    }, 2000);
  }, []);

  const handleQueueAssetJob = async (sceneId: string, asset_type: "image" | "audio") => {
    try {
      const job = await api.queueSceneAssetGenerate(projectId, sceneId, { asset_type });
      addJob(job);
      startPollJob(job.id, () => {
        api.getProject(projectId).then(setProject);
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not queue generation");
    }
  };

  const handleIncrementalScene = async (sceneId: string) => {
    if (
      !confirm(
        "Re-build the final video while only regenerating clips for this scene? Other scenes keep their existing clips.",
      )
    ) {
      return;
    }
    setIncrementingSceneId(sceneId);
    try {
      const job = await api.incrementalRenderVideo(projectId, [sceneId]);
      addJob(job);
      setProject((p) => (p ? { ...p, status: "generating" } : null));
      startPollJob(job.id, () => {
        api.getProject(projectId).then(setProject);
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
      const updated = await api.getProject(projectId);
      setProject(updated);
      setEditingScene(null);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Someone else saved changes first — refreshed the project.");
        try {
          const updated = await api.getProject(projectId);
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
    if (!confirm("Delete this scene?")) return;
    await api.deleteScene(projectId, sceneId);
    const updated = await api.getProject(projectId);
    setProject(updated);
  };

  const handleAddScene = async () => {
    await api.addScene(projectId, { narration: "", subtitle: "", image_prompt: "", transition_type: "fade", duration: 5 });
    const updated = await api.getProject(projectId);
    setProject(updated);
  };

  const handleSyncAllSubtitlesFromNarration = async () => {
    if (!project?.scenes.length) return;
    setSyncingSubtitles(true);
    try {
      await Promise.all(
        project.scenes.map((s) => api.updateScene(projectId, s.id, { subtitle: s.narration || "" })),
      );
      const updated = await api.getProject(projectId);
      setProject(updated);
      toast.success("Subtitles updated to match narration for all scenes");
    } catch (e) {
      toast.error((e as Error).message || "Could not update scenes");
    } finally {
      setSyncingSubtitles(false);
    }
  };

  const handleRetry = async () => {
    try {
      await api.retryProject(projectId);
      setProject((p) => (p ? { ...p, status: "generating" } : null));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Stop generating this video? You can retry later.")) return;
    try {
      await api.cancelProject(projectId);
      setProject((p) => (p ? { ...p, status: "failed" } : null));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleDuplicate = async () => {
    if (!project) return;
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
      alert((e as Error).message);
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
    setProject({ ...project, scenes: reordered });
    await api.reorderScenes(projectId, reordered.map((s) => s.id));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) return null;

  const handleRegenerateImage = async (sceneId: string) => {
    setRegeneratingSceneId(sceneId);
    try {
      await api.regenerateSceneImage(projectId, sceneId);
      const updated = await api.getProject(projectId);
      setProject(updated);
    } catch (e: any) {
      alert(e?.message || "Regenerate failed");
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
    } catch (e: any) {
      alert(e?.message || "Compile failed");
    } finally {
      setCompiling(false);
    }
  };

  const videoPath = latestJob?.status === "completed"
    ? (latestJob.result?.video_url || latestJob.result?.video_path)
    : null;

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex items-center gap-4">
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
        <div className="flex gap-2">
          {project.status === "ready_for_edit" && (
            <Button variant="animated" onClick={handleCompile} disabled={compiling}>
              {compiling ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Compiling...</> : <><Film className="h-4 w-4 mr-1" /> Compile Video</>}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDuplicate}><Copy className="h-4 w-4 mr-1" /> Clone</Button>
          {project.status === "generating" && (
            <Button variant="destructive" size="sm" onClick={handleCancel}><StopCircle className="h-4 w-4 mr-1" /> Stop</Button>
          )}
          {project.status === "failed" && (
            <Button variant="animated" onClick={handleRetry}><RotateCcw className="h-4 w-4 mr-2" /> Retry</Button>
          )}
        </div>
      </div>

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
              Last job failed: {typeof latestJob.error === "object" ? (latestJob.error as any).message || JSON.stringify(latestJob.error) : String(latestJob.error)}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Scenes ({project.scenes.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAllSubtitlesFromNarration}
            disabled={syncingSubtitles || !project.scenes.length}
            title="Set each scene’s subtitle to its narration (saved immediately)"
          >
            {syncingSubtitles ? (
              <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowDownToLine className="h-4 w-4" />
            )}
            Copy narration → subtitle (all)
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddScene}>
            <Plus className="h-4 w-4" /> Add Scene
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={project.scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {project.scenes.map((scene, idx) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                idx={idx}
                editingScene={editingScene}
                setEditingScene={setEditingScene}
                onUpdate={handleUpdateScene}
                onDelete={handleDeleteScene}
                onRegenerate={() => handleRegenerateImage(scene.id)}
                regenerating={regeneratingSceneId === scene.id}
                projectId={projectId}
                onRefresh={() => api.getProject(projectId).then(setProject)}
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

      <AICoPilot projectId={projectId} controlMode={project.control_mode || "autopilot"} />
    </div>
  );
}

function SortableSceneCard({
  scene,
  idx,
  editingScene,
  setEditingScene,
  onUpdate,
  onDelete,
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
  editingScene: string | null;
  setEditingScene: (id: string | null) => void;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
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
    <Card ref={setNodeRef} style={style} className="overflow-hidden">
      <div className="flex">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-12 bg-slate-50 dark:bg-zinc-800/70 border-r border-slate-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Scene {idx + 1}</Badge>
              {scene.is_locked ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
                  locked
                </Badge>
              ) : null}
              <Badge variant="secondary">
                <Image className="h-3 w-3 mr-1" />
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
            <div className="flex gap-1 shrink-0">
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
                    title="Queue async image generation (background job)"
                    onClick={() => onQueueAsset("image")}
                    disabled={!scene.image_prompt}
                  >
                    Job img
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px]"
                    title="Queue async TTS (background job)"
                    onClick={() => onQueueAsset("audio")}
                    disabled={!scene.narration?.trim()}
                  >
                    Job TTS
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
                  {incrementing ? <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" /> : "Δ video"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit scene" onClick={() => setEditingScene(editingScene === scene.id ? null : scene.id)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => onDelete(scene.id)}>
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

              {editingScene === scene.id ? (
                <SceneEditor scene={scene} onSave={(data) => onUpdate(scene.id, data)} onCancel={() => setEditingScene(null)} />
              ) : (
                <div className="space-y-2">
                  {scene.narration && (
                    <p className="text-sm leading-relaxed">
                      <Volume2 className="h-3.5 w-3.5 inline mr-1 text-slate-400 align-text-bottom" />
                      {scene.narration}
                    </p>
                  )}
                  {scene.subtitle && scene.subtitle !== scene.narration && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      <Type className="h-3 w-3 inline mr-1 align-text-bottom" />
                      Subtitle: {scene.subtitle}
                    </p>
                  )}
                  {scene.image_prompt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      <Image className="h-3 w-3 inline mr-1 align-text-bottom" />
                      {scene.image_prompt}
                    </p>
                  )}
                  {scene.user_notes ? (
                    <p className="text-xs text-amber-800/90 dark:text-amber-200/80 leading-relaxed border-l-2 border-amber-500/40 pl-2">
                      Note: {scene.user_notes}
                    </p>
                  ) : null}
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
              )}
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

function SceneEditor({ scene, onSave, onCancel }: { scene: Scene; onSave: (data: any) => void; onCancel: () => void }) {
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
