"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LinearProgress } from "@/components/ui/progress-linear";
import { Sparkles, Play, Layers, Volume2, Type, Music, Upload, Headphones, Link2 } from "lucide-react";
import { api, getMediaUrl } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Voice } from "@/lib/types";

export default function GeneratePage() {
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const jobDetails = useProjectStore((s) => s.jobDetails);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);

  const [form, setForm] = useState({
    title: "",
    story_type: "general",
    custom_script: "",
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
    scene_duration: 5,
  });

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [generating, setGenerating] = useState(false);
  const [storyTypes, setStoryTypes] = useState<{ id: string; name: string }[]>([]);
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [musicList, setMusicList] = useState<{ id: string; name: string; url: string }[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [contentSource, setContentSource] = useState<"concept" | "script" | "url">("concept");
  const [urlInput, setUrlInput] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      setForm((f) => ({
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

  useEffect(() => {
    api.listStoryTypes().then(setStoryTypes).catch(() => {});
    api.listVoices(form.tts_provider).then(setVoices).catch(() => {});
    api.listMusic().then(setMusicList).catch(() => {});
    const scriptFromUrl = searchParams.get("script");
    const titleFromUrl = searchParams.get("title");
    const initialUpdates: Record<string, any> = {};
    if (scriptFromUrl) {
      setContentSource("script");
      setUseCustomScript(true);
      initialUpdates.custom_script = scriptFromUrl;
    }
    if (titleFromUrl) {
      initialUpdates.title = titleFromUrl;
    } else if (scriptFromUrl) {
      initialUpdates.title = "AI Video";
    }
    if (Object.keys(initialUpdates).length > 0) {
      setForm((f) => ({ ...f, ...initialUpdates }));
    }
    const templateFields = ["story_type", "scene_count", "word_count", "scene_duration", "image_style", "tts_provider", "tts_voice", "subtitle_enabled", "subtitle_source", "generate_subtitles", "transcription_provider", "transcription_language", "subtitle_font", "subtitle_size", "subtitle_color", "subtitle_position", "transition", "resolution"];
    const updates: Record<string, any> = {};
    for (const field of templateFields) {
      const v = searchParams.get(field);
      if (v !== null) {
        if (field === "scene_count" || field === "word_count") updates[field] = parseInt(v);
        else if (field === "scene_duration") updates[field] = parseFloat(v);
        else if (field === "subtitle_size") updates[field] = parseInt(v);
        else if (field === "subtitle_enabled" || field === "generate_subtitles") updates[field] = v === "true";
        else updates[field] = v;
      }
    }
    if (Object.keys(updates).length > 0) {
      setForm((f) => ({ ...f, ...updates }));
    }
  }, []);

  const handleVoicePreview = async () => {
    setPreviewingVoice(true);
    try {
      const result = await api.previewVoice(form.tts_provider, form.tts_voice);
      const url = getMediaUrl(result.path || result.url);
      const audio = new Audio(url);
      audio.play();
    } catch {} finally { setPreviewingVoice(false); }
  };

  const handleUrlToScript = async () => {
    if (!urlInput) return;
    setLoadingUrl(true);
    try {
      const result = await api.urlToScript({ url: urlInput, story_type: form.story_type, word_count: form.word_count || 400, llm_provider: form.llm_provider });
      setContentSource("script");
      setUseCustomScript(true);
      setForm((f) => ({ ...f, custom_script: result.script }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMusic(true);
    try {
      const track = await api.uploadMusic(file);
      setMusicList((prev) => [...prev, track]);
      update("background_music", track.path);
    } catch {} finally { setUploadingMusic(false); e.target.value = ""; }
  };

  useEffect(() => {
    api.listVoices(form.tts_provider).then(setVoices).catch(() => {});
  }, [form.tts_provider]);

  const handleGenerate = async () => {
    if (!form.title && !form.custom_script) return;
    setGenerating(true);
    try {
      const job = await api.generateVideo({
        ...form,
        custom_script: (contentSource === "script" || contentSource === "url") ? form.custom_script : undefined,
        prepare_only: true,
      });
      addJob(job);
      if (job.project_id) {
        router.push(`/projects/${job.project_id}`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const activeJobs = jobs.filter((j) => (j.status === "queued" || j.status === "in_progress") && j.type === "video_render");

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-3xl font-bold">Create</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Create AI-powered faceless short videos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg">
                {([["concept", "Concept"], ["script", "Custom Script"], ["url", "URL to Video"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setContentSource(key); if (key === "script") setUseCustomScript(true); else if (key === "concept") setUseCustomScript(false); }}
                    className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-colors ${
                      contentSource === key ? "bg-white dark:bg-zinc-900/95 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {key === "url" && <Link2 className="h-3 w-3 inline mr-1" />}
                    {label}
                  </button>
                ))}
              </div>

              {contentSource === "url" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Article / Blog URL</label>
                    <div className="flex gap-2">
                      <Input placeholder="https://example.com/article" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
                      <Button onClick={handleUrlToScript} disabled={loadingUrl || !urlInput} className="shrink-0">
                        {loadingUrl ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Extract"}
                      </Button>
                    </div>
                  </div>
                  {form.custom_script && (
                    <Textarea placeholder="Generated script will appear here..." rows={6} value={form.custom_script} onChange={(e) => update("custom_script", e.target.value)} />
                  )}
                </div>
              ) : contentSource === "script" ? (
                <div>
                  <Textarea placeholder="Paste your script here..." rows={6} value={form.custom_script} onChange={(e) => update("custom_script", e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Title / Concept</label>
                  <Input placeholder="e.g., 5 Mysterious Places on Earth..." value={form.title} onChange={(e) => update("title", e.target.value)} />
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1.5 block">Story Type</label>
                <Select value={form.story_type} onValueChange={(value) => update("story_type", value)}>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Script length (words)</label>
                  <Input type="number" min={150} max={800} value={form.word_count} onChange={(e) => update("word_count", parseInt(e.target.value) || defaults.word_count || 400)} />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Longer scripts = more substantial narration</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">LLM Provider</label>
                  <Select value={form.llm_provider} onValueChange={(value) => update("llm_provider", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.llm.filter((p) => p.configured).map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.name.charAt(0).toUpperCase() + p.name.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Scenes</label>
                  <Input type="number" min={2} max={15} value={form.scene_count} onChange={(e) => update("scene_count", parseInt(e.target.value) || defaults.scene_count || 5)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Scene Duration (seconds)</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  value={form.scene_duration}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    update("scene_duration", Number.isNaN(value) ? 0 : value);
                  }}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Applies to each scene; auto-extends to match narration.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" />Visuals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Image Provider</label>
                  <Select value={form.image_provider} onValueChange={(value) => update("image_provider", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.image.filter((p) => p.configured).map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.name.charAt(0).toUpperCase() + p.name.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Style</label>
                  <Select value={form.image_style} onValueChange={(value) => update("image_style", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: "realistic", label: "Realistic" },
                        { value: "anime", label: "Anime" },
                        { value: "3d_render", label: "3D Render" },
                        { value: "oil_painting", label: "Oil Painting" },
                        { value: "watercolor", label: "Watercolor" },
                        { value: "cinematic", label: "Cinematic" },
                      ].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Resolution</label>
                  <Select value={form.resolution} onValueChange={(value) => update("resolution", value)}>
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
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Transition</label>
                  <Select value={form.transition} onValueChange={(value) => update("transition", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select transition" />
                    </SelectTrigger>
                    <SelectContent>
                      {transitions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5" />Audio & Subtitles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">TTS Provider</label>
                  <Select value={form.tts_provider} onValueChange={(value) => update("tts_provider", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.tts.filter((p) => p.configured).map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.name.charAt(0).toUpperCase() + p.name.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Voice</label>
                  <div className="flex gap-2">
                    <Select value={form.tts_voice} onValueChange={(value) => update("tts_voice", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="shrink-0" onClick={handleVoicePreview} disabled={previewingVoice} title="Preview voice">
                      {previewingVoice ? <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> : <Headphones className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1"><Music className="h-4 w-4" /> Background Music</label>
                <div className="flex gap-2">
                  <Select
                    value={form.background_music ? form.background_music : "none"}
                    onValueChange={(value) => update("background_music", value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select music" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {musicList.map((m) => (
                        <SelectItem key={m.url || m.id} value={m.url || m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="shrink-0 cursor-pointer">
                    <input type="file" accept=".mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={handleMusicUpload} className="hidden" disabled={uploadingMusic} />
                    <span className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-slate-200 dark:border-zinc-700 bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                      {uploadingMusic ? <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> : <Upload className="h-4 w-4" />}
                    </span>
                  </label>
                </div>
                {form.background_music && (
                  <div className="mt-2">
                    <Input type="range" min={0} max={1} step={0.05} value={form.background_music_volume} onChange={(e) => update("background_music_volume", parseFloat(e.target.value))} className="h-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Volume: {Math.round(form.background_music_volume * 100)}%</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.subtitle_enabled} onChange={(e) => update("subtitle_enabled", e.target.checked)} className="rounded" />
                <label className="text-sm font-medium flex items-center gap-1"><Type className="h-4 w-4" /> Enable Subtitles</label>
              </div>
              {form.subtitle_enabled && (
                <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Subtitle Source</label>
                    <Select value={form.subtitle_source} onValueChange={(value) => update("subtitle_source", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llm">LLM-generated (per scene)</SelectItem>
                        <SelectItem value="transcription">Audio transcription</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">LLM generates captions per scene; transcription uses speech-to-text.</p>
                  </div>
                  {form.subtitle_source === "llm" && (
                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" id="gen-sub" checked={form.generate_subtitles} onChange={(e) => update("generate_subtitles", e.target.checked)} className="rounded" />
                      <label htmlFor="gen-sub" className="text-sm font-medium cursor-pointer">Generate subtitles with LLM</label>
                    </div>
                  )}
                  {form.subtitle_source === "transcription" && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcription provider</label>
                        <Select value={form.transcription_provider} onValueChange={(v) => update("transcription_provider", v)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI (Whisper)</SelectItem>
                            <SelectItem value="groq">Groq</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                        <Input placeholder="en" value={form.transcription_language} onChange={(e) => update("transcription_language", e.target.value)} className="mt-1" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ISO 639-1 (e.g. en, es, fr)</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Font</label>
                    <Select value={form.subtitle_font} onValueChange={(value) => update("subtitle_font", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select font" />
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
                    <Input type="number" min={24} max={96} value={form.subtitle_size} onChange={(e) => update("subtitle_size", parseInt(e.target.value) || 48)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Color</label>
                    <div className="flex items-center gap-2">
                      <Input type="color" value={form.subtitle_color} onChange={(e) => update("subtitle_color", e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                      <Input type="text" value={form.subtitle_color} onChange={(e) => update("subtitle_color", e.target.value)} className="flex-1 font-mono text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Position</label>
                    <Select value={form.subtitle_position} onValueChange={(value) => update("subtitle_position", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <Button variant="animated" className="w-full h-12 text-base" onClick={handleGenerate} disabled={generating || (!form.title && !form.custom_script)}>
                {generating ? (
                  <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                ) : (
                  <><Play className="h-5 w-5" /> Generate Video</>
                )}
              </Button>
            </CardContent>
          </Card>

          {activeJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeJobs.map((job) => (
                  <div key={job.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{job.type.replace(/_/g, " ")}</span>
                      <span className="font-medium">{job.progress}%</span>
                    </div>
                    <LinearProgress value={job.progress} />
                    {jobDetails[job.id] && (
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                        {jobDetails[job.id]}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-slate-500 dark:text-slate-400">
              <div className="flex justify-between"><span>Resolution</span><span className="text-slate-900 dark:text-slate-100">{form.resolution}</span></div>
              <div className="flex justify-between"><span>Scenes</span><span className="text-slate-900 dark:text-slate-100">{form.scene_count}</span></div>
              <div className="flex justify-between"><span>Scene Duration</span><span className="text-slate-900 dark:text-slate-100">{form.scene_duration}s</span></div>
              <div className="flex justify-between"><span>Image Provider</span><span className="text-slate-900 dark:text-slate-100">{form.image_provider}</span></div>
              <div className="flex justify-between"><span>TTS</span><span className="text-slate-900 dark:text-slate-100">{form.tts_provider}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
