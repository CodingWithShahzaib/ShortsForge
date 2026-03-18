"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Layers, Play, Plus, Trash2, Type } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import { api } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Job } from "@/lib/types";

export default function BatchGeneratePage() {
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);

  const [count, setCount] = useState(3);
  const [baseSettings, setBaseSettings] = useState({
    title: "",
    story_type: "general",
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
    image_provider: defaults.image_provider,
    image_style: defaults.image_style,
    tts_provider: defaults.tts_provider,
    tts_voice: defaults.tts_voice,
    resolution: defaults.resolution,
    transition: defaults.transition,
    subtitle_enabled: true,
    subtitle_source: "llm",
    generate_subtitles: true,
    transcription_provider: "openai",
    transcription_language: "en",
    subtitle_font: "Arial",
    subtitle_size: 48,
    subtitle_color: "#FFFFFF",
    subtitle_position: "bottom",
    background_music: "",
    background_music_volume: 0.15,
    scene_count: defaults.scene_count ?? 5,
    word_count: defaults.word_count ?? 400,
  });
  const [generating, setGenerating] = useState(false);
  const [storyTypes, setStoryTypes] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.listStoryTypes().then(setStoryTypes).catch(() => {});
  }, []);

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      setBaseSettings((f) => ({
        ...f,
        llm_provider: defaults.llm_provider,
        llm_model: defaults.llm_model,
        image_provider: defaults.image_provider,
        image_style: defaults.image_style,
        tts_provider: defaults.tts_provider,
        tts_voice: defaults.tts_voice,
        resolution: defaults.resolution,
        transition: defaults.transition,
        scene_count: defaults.scene_count ?? 5,
        word_count: defaults.word_count ?? 400,
      }));
    }
  }, [defaults]);

  const handleBatchGenerate = async () => {
    if (!baseSettings.title) return;
    setGenerating(true);
    try {
      const result = await api.batchGenerate({ count, base_settings: baseSettings });
      result.forEach((job: Job) => addJob(job));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const update = (key: string, value: any) => setBaseSettings((f) => ({ ...f, [key]: value }));

  const batchJobs = jobs.filter((j) => j.type === "video_render");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/generate"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Layers className="h-8 w-8" /> Batch Generate</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Generate multiple videos at once</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batch Settings</CardTitle>
          <CardDescription>Configure settings shared across all videos in this batch</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Base Title</label>
              <Input placeholder="e.g., Scary Facts" value={baseSettings.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Number of Videos</label>
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Script length (words)</label>
              <Input type="number" min={150} max={800} value={baseSettings.word_count} onChange={(e) => update("word_count", parseInt(e.target.value) || defaults.word_count || 400)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Story Type</label>
              <Select value={baseSettings.story_type} onValueChange={(value) => update("story_type", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select story type" />
                </SelectTrigger>
                <SelectContent>
                  {storyTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Image Provider</label>
              <Select value={baseSettings.image_provider} onValueChange={(value) => update("image_provider", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.image.filter((p) => p.configured).map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Resolution</label>
              <Select value={baseSettings.resolution} onValueChange={(value) => update("resolution", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  {resolutions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-zinc-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Type className="h-4 w-4" />
              <span className="text-sm font-medium">Subtitle Configuration</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input type="checkbox" id="batch-sub-enable" checked={baseSettings.subtitle_enabled} onChange={(e) => update("subtitle_enabled", e.target.checked)} className="rounded" />
              <label htmlFor="batch-sub-enable" className="text-sm cursor-pointer">Enable subtitles</label>
            </div>
            {baseSettings.subtitle_enabled && (
              <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Subtitle Source</label>
                  <Select value={baseSettings.subtitle_source} onValueChange={(v) => update("subtitle_source", v)}>
                    <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm">LLM-generated</SelectItem>
                      <SelectItem value="transcription">Audio transcription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {baseSettings.subtitle_source === "llm" && (
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="batch-gen-sub" checked={baseSettings.generate_subtitles} onChange={(e) => update("generate_subtitles", e.target.checked)} className="rounded" />
                    <label htmlFor="batch-gen-sub" className="text-sm cursor-pointer">Generate with LLM</label>
                  </div>
                )}
                {baseSettings.subtitle_source === "transcription" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcription provider</label>
                      <Select value={baseSettings.transcription_provider} onValueChange={(v) => update("transcription_provider", v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI (Whisper)</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                      <Input placeholder="en" value={baseSettings.transcription_language} onChange={(e) => update("transcription_language", e.target.value)} className="mt-1" />
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Font</label>
                  <Select value={baseSettings.subtitle_font} onValueChange={(v) => update("subtitle_font", v)}>
                    <SelectTrigger><SelectValue placeholder="Font" /></SelectTrigger>
                    <SelectContent>
                      {["Arial", "Montserrat", "Roboto", "Impact", "Open Sans", "Georgia"].map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Size</label>
                  <Input type="number" min={24} max={96} value={baseSettings.subtitle_size} onChange={(e) => update("subtitle_size", parseInt(e.target.value) || 48)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Color</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={baseSettings.subtitle_color} onChange={(e) => update("subtitle_color", e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                    <Input type="text" value={baseSettings.subtitle_color} onChange={(e) => update("subtitle_color", e.target.value)} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Position</label>
                  <Select value={baseSettings.subtitle_position} onValueChange={(v) => update("subtitle_position", v)}>
                    <SelectTrigger><SelectValue placeholder="Position" /></SelectTrigger>
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
          <Button variant="animated" onClick={handleBatchGenerate} disabled={generating || !baseSettings.title} className="w-full h-12 text-base">
            {generating ? (
              <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Starting batch...</>
            ) : (
              <><Play className="h-5 w-5" /> Generate {count} Videos</>
            )}
          </Button>
        </CardContent>
      </Card>

      {batchJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Queue ({batchJobs.filter((j) => j.status === "queued" || j.status === "in_progress").length} active)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {batchJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/70 border border-slate-200/80 dark:border-zinc-700">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Job {job.id.slice(0, 8)}</span>
                      <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
                    </div>
                    <LinearProgress value={job.progress} className="h-1.5" />
                  </div>
                  <span className="text-sm tabular-nums">{job.progress}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
