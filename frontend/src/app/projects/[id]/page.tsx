"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Play, GripVertical, Image, Volume2, Trash2, RefreshCw, Plus, RotateCcw, Download, Copy, Upload, Share, StopCircle, Pencil, Film, Type } from "lucide-react";
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
import { api, getMediaUrl } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import type { Project, Scene, Job } from "@/lib/types";

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

  const handleUpdateScene = async (sceneId: string, data: Partial<Scene>) => {
    await api.updateScene(projectId, sceneId, data);
    const updated = await api.getProject(projectId);
    setProject(updated);
    setEditingScene(null);
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
        settings: project.settings,
        scenes: project.scenes.map((s) => ({
          narration: s.narration,
          subtitle: s.subtitle || s.narration,
          image_prompt: s.image_prompt,
          transition_type: s.transition_type,
          duration: s.duration,
          scene_type: s.scene_type,
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
      await api.updateProject(projectId, { settings: mergedSettings });
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
            <span className="text-sm text-slate-500 dark:text-slate-400">{project.story_type} &middot; {project.scenes.length} scenes</span>
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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scenes ({project.scenes.length})</h2>
        <Button variant="outline" size="sm" onClick={handleAddScene}><Plus className="h-4 w-4" /> Add Scene</Button>
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
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSceneCard({
  scene, idx, editingScene, setEditingScene, onUpdate, onDelete, onRegenerate, regenerating, projectId, onRefresh,
}: {
  scene: Scene; idx: number; editingScene: string | null;
  setEditingScene: (id: string | null) => void;
  onUpdate: (id: string, data: any) => void; onDelete: (id: string) => void;
  onRegenerate: () => void; regenerating: boolean;
  projectId: string; onRefresh: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadSceneImage(projectId, scene.id, file);
      onRefresh();
    } catch {}
    e.target.value = "";
  };

  return (
    <Card ref={setNodeRef} style={style} className="overflow-hidden">
      <div className="flex">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-12 bg-slate-50 dark:bg-zinc-800/70 border-r border-slate-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Scene {idx + 1}</Badge>
              <Badge variant="secondary"><Image className="h-3 w-3 mr-1" />Image</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">{scene.duration}s &middot; {scene.transition_type}</span>
            </div>
            <div className="flex gap-1">
              <label className="cursor-pointer" title="Upload image">
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif" onChange={handleImageUpload} className="hidden" />
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                  <Upload className="h-3.5 w-3.5" />
                </span>
              </label>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Regenerate from prompt" onClick={onRegenerate} disabled={regenerating || !scene.image_prompt}>
                {regenerating ? <div className="h-3.5 w-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit scene" onClick={() => setEditingScene(editingScene === scene.id ? null : scene.id)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => onDelete(scene.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {editingScene === scene.id ? (
            <SceneEditor scene={scene} onSave={(data) => onUpdate(scene.id, data)} onCancel={() => setEditingScene(null)} />
          ) : (
            <div className="space-y-2">
              {scene.narration && <p className="text-sm"><Volume2 className="h-3.5 w-3.5 inline mr-1 text-slate-400" />{scene.narration}</p>}
              {scene.subtitle && scene.subtitle !== scene.narration && <p className="text-xs text-slate-500 dark:text-slate-400"><Type className="h-3 w-3 inline mr-1" />Subtitle: {scene.subtitle}</p>}
              {scene.image_prompt && <p className="text-xs text-slate-500 dark:text-slate-400"><Image className="h-3 w-3 inline mr-1" />{scene.image_prompt}</p>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SceneEditor({ scene, onSave, onCancel }: { scene: Scene; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    narration: scene.narration || "",
    subtitle: scene.subtitle || scene.narration || "",
    image_prompt: scene.image_prompt || "",
    transition_type: scene.transition_type,
    duration: scene.duration,
    scene_type: scene.scene_type,
  });

  return (
    <div className="space-y-3">
      <Textarea placeholder="Narration text..." rows={2} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
      <Textarea placeholder="Subtitle (on-screen caption, optional)..." rows={2} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
      <Textarea placeholder="Image prompt..." rows={2} value={form.image_prompt} onChange={(e) => setForm({ ...form, image_prompt: e.target.value })} />
      <div className="grid grid-cols-3 gap-3">
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
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="dissolve">Dissolve</SelectItem>
            <SelectItem value="zoom_in">Zoom In</SelectItem>
            <SelectItem value="zoom_out">Zoom Out</SelectItem>
            <SelectItem value="pan_left">Pan Left</SelectItem>
            <SelectItem value="pan_right">Pan Right</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" min={2} max={30} step={0.5} value={form.duration} onChange={(e) => setForm({ ...form, duration: parseFloat(e.target.value) })} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)}>Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
