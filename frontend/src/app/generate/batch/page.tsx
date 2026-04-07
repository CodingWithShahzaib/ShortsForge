"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Layers, Play, Type } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Job } from "@/lib/types";
import {
  SCENE_NARRATION_STYLE_IDS,
  STORY_TEMPLATE_IDS,
  TRANSCRIPTION_PROVIDERS,
} from "@/app/generate/schema";

type SceneNarrationStyle = (typeof SCENE_NARRATION_STYLE_IDS)[number];
type StoryTemplateId = (typeof STORY_TEMPLATE_IDS)[number];
type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];

function isSceneNarrationStyle(value: string): value is SceneNarrationStyle {
  return (SCENE_NARRATION_STYLE_IDS as readonly string[]).includes(value);
}

function isStoryTemplateId(value: string): value is StoryTemplateId {
  return (STORY_TEMPLATE_IDS as readonly string[]).includes(value);
}

function isTranscriptionProvider(value: string): value is TranscriptionProvider {
  return (TRANSCRIPTION_PROVIDERS as readonly string[]).includes(value);
}

export default function BatchGeneratePage() {
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);
  const defaultsHydrated = useSettingsStore((s) => s.hydrated);

  const [count, setCount] = useState(3);
  const [baseSettings, setBaseSettings] = useState({
    title: "",
    story_type: "general",
    story_template: "default" as StoryTemplateId,
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
    image_provider: defaults.image_provider,
    image_style: defaults.image_style,
    tts_provider: defaults.tts_provider,
    tts_voice: defaults.tts_voice,
    tts_speed: defaults.tts_speed,
    tts_response_format: defaults.tts_response_format,
    tts_normalize: defaults.tts_normalize,
    resolution: defaults.resolution,
    transition: defaults.transition,
    subtitle_enabled: defaults.subtitle_enabled,
    subtitle_source: defaults.subtitle_source,
    generate_subtitles: defaults.generate_subtitles,
    transcription_provider: defaults.transcription_provider,
    transcription_language: defaults.transcription_language,
    background_music: "",
    background_music_volume: defaults.audio.music_volume,
    scene_count: defaults.scene_count ?? 5,
    word_count: defaults.word_count ?? 400,
    scene_narration_style: defaults.scene_narration_style ?? "balanced",
    scene_duration: defaults.video_style.scene_duration_max,
    inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
    transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
    use_production_storyboard: defaults.use_production_storyboard ?? true,
    match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
    visual_continuity: defaults.visual_continuity ?? "",
  });
  const [generating, setGenerating] = useState(false);
  const [storyTypes, setStoryTypes] = useState<{ id: string; name: string }[]>([]);
  const [storyTemplates, setStoryTemplates] = useState<{ id: string; name: string; description: string }[]>([]);

  useEffect(() => {
    api.listStoryTypes().then(setStoryTypes).catch(() => {});
    api.listStoryTemplates().then(setStoryTemplates).catch(() => {});
  }, []);

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!defaultsHydrated) return;
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
        tts_speed: defaults.tts_speed,
        tts_response_format: defaults.tts_response_format,
        tts_normalize: defaults.tts_normalize,
        resolution: defaults.resolution,
        transition: defaults.transition,
        subtitle_enabled: defaults.subtitle_enabled,
        subtitle_source: defaults.subtitle_source,
        generate_subtitles: defaults.generate_subtitles,
        transcription_provider: defaults.transcription_provider,
        transcription_language: defaults.transcription_language,
        background_music_volume: defaults.audio.music_volume,
        scene_count: defaults.scene_count ?? 5,
        word_count: defaults.word_count ?? 400,
        scene_narration_style: defaults.scene_narration_style ?? "balanced",
        scene_duration: defaults.video_style.scene_duration_max,
        inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
        transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
        use_production_storyboard: defaults.use_production_storyboard ?? true,
        match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
        visual_continuity: defaults.visual_continuity ?? "",
      }));
    }
  }, [defaults, defaultsHydrated]);

  const handleBatchGenerate = async () => {
    if (!baseSettings.title) return;
    setGenerating(true);
    try {
      const result = await api.batchGenerate({
        count,
        base_settings: {
          ...baseSettings,
          control_mode: "co_pilot",
          pipeline_mode: "manual",
          target_stage: "storyboard",
        },
      });
      result.forEach((job: Job) => addJob(job));
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Batch creation failed");
    } finally {
      setGenerating(false);
    }
  };

  const update = <K extends keyof typeof baseSettings>(key: K, value: (typeof baseSettings)[K]) =>
    setBaseSettings((f) => ({ ...f, [key]: value }));

  const batchJobs = jobs.filter((j) => j.type === "video_render");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/generate"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Layers className="h-8 w-8" /> Bulk Create</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Create multiple videos at once</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk settings</CardTitle>
          <CardDescription>Choose settings that apply to every video in this run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Base Title</label>
              <Input placeholder="e.g., Scary Facts" value={baseSettings.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Number of videos</label>
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Script length (words)</label>
              <Input type="number" min={150} max={800} value={baseSettings.word_count} onChange={(e) => update("word_count", parseInt(e.target.value) || defaults.word_count || 400)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Scene length (seconds)</label>
              <Input type="number" min={1} max={60} step={0.5} value={baseSettings.scene_duration} onChange={(e) => update("scene_duration", parseFloat(e.target.value) || 5)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Narration per scene</label>
              <Select
                value={baseSettings.scene_narration_style}
                onValueChange={(value) => {
                  if (isSceneNarrationStyle(value)) {
                    update("scene_narration_style", value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Narration density" />
                </SelectTrigger>
                <SelectContent>
                  {SCENE_NARRATION_STYLE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id === "short" ? "Short" : id === "long" ? "Long" : "Balanced"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              <label className="text-sm font-medium mb-1.5 block">Narrative structure</label>
              <Select
                value={baseSettings.story_template}
                onValueChange={(value) => {
                  if (isStoryTemplateId(value)) {
                    update("story_template", value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Structure" />
                </SelectTrigger>
                <SelectContent>
                  {(storyTemplates.length > 0
                    ? storyTemplates
                    : STORY_TEMPLATE_IDS.map((id) => ({
                        id,
                        name: id === "default" ? "Standard" : id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                        description: "",
                      }))
                  ).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Image engine</label>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="batch-use-production"
                checked={baseSettings.use_production_storyboard}
                onChange={(e) => update("use_production_storyboard", e.target.checked)}
                className="rounded"
              />
              <label htmlFor="batch-use-production" className="text-sm cursor-pointer">
                Director-style scenes (camera + lighting details)
                <span className="block text-xs text-muted-foreground">More realistic prompts.</span>
              </label>
            </div>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="batch-match-audio"
                checked={baseSettings.match_scenes_to_audio}
                onChange={(e) => update("match_scenes_to_audio", e.target.checked)}
                className="rounded"
              />
              <label htmlFor="batch-match-audio" className="text-sm cursor-pointer">
                Match scenes to narration length
                <span className="block text-xs text-muted-foreground">Keeps timing aligned.</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Pause between scenes (ms)</label>
              <Input
                type="number"
                min={0}
                max={1200}
                step={50}
                value={baseSettings.inter_scene_pause_ms}
                onChange={(e) => update("inter_scene_pause_ms", parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Transition overlap (ms)</label>
              <Input
                type="number"
                min={0}
                max={800}
                step={50}
                value={baseSettings.transition_overlap_ms}
                onChange={(e) => update("transition_overlap_ms", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Keep visuals consistent</label>
            <Input
              placeholder="e.g. teal-orange palette, rain, solitary figure"
              value={baseSettings.visual_continuity}
              onChange={(e) => update("visual_continuity", e.target.value)}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Keeps a consistent look across all videos in this run.
            </p>
          </div>
          <div className="border-t border-slate-200 dark:border-zinc-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Type className="h-4 w-4" />
              <span className="text-sm font-medium">Caption settings</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input type="checkbox" id="batch-sub-enable" checked={baseSettings.subtitle_enabled} onChange={(e) => update("subtitle_enabled", e.target.checked)} className="rounded" />
              <label htmlFor="batch-sub-enable" className="text-sm cursor-pointer">Enable subtitles</label>
            </div>
            {baseSettings.subtitle_enabled && (
              <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Caption source</label>
                  <div className="mt-1 flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                    Speech-to-text from audio
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Speech-to-text engine</label>
                    <Select
                      value={baseSettings.transcription_provider}
                      onValueChange={(v) => {
                        if (isTranscriptionProvider(v)) {
                          update("transcription_provider", v);
                        }
                      }}
                    >
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
              </div>
              </>
            )}
          </div>

          <Button variant="animated" onClick={handleBatchGenerate} disabled={generating || !baseSettings.title} className="w-full h-12 text-base">
            {generating ? (
              <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Starting bulk run...</>
            ) : (
              <><Play className="h-5 w-5" /> Create {count} videos</>
            )}
          </Button>
        </CardContent>
      </Card>

      {batchJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Task queue ({batchJobs.filter((j) => j.status === "queued" || j.status === "in_progress").length} active)</CardTitle>
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
