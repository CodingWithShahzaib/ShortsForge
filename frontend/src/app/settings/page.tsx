"use client";

import { useState, useEffect } from "react";
import { Settings, Key, Save, CheckCircle, AlertCircle, Database, Activity, Sparkles, Video } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";

export default function SettingsPage() {
  const providers = useSettingsStore((s) => s.providers);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const setProviders = useSettingsStore((s) => s.setProviders);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const [form, setForm] = useState({
    openai_api_key: "",
    groq_api_key: "",
    openrouter_api_key: "",
    elevenlabs_api_key: "",
    replicate_api_key: "",
    fal_api_key: "",
    together_api_key: "",
    runware_api_key: "",
    default_llm_provider: "openai",
    default_llm_model: "gpt-4o-mini",
    default_image_provider: "replicate",
    default_tts_provider: "edge",
    default_tts_voice: "en-US-ChristopherNeural",
    default_video_provider: "sora",
    default_video_model: "sora-2",
    default_resolution: "1080x1920",
    default_transition: "fade",
    default_image_style: "realistic",
    default_word_count: 400,
    default_scene_count: 5,
    ffmpeg_path: "ffmpeg",
    redis_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [redisStatus, setRedisStatus] = useState<any>(null);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModelsLoading, setLlmModelsLoading] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => setForm((f) => ({ ...f, ...s }))).catch(() => {});
    api.redisStatus().then(setRedisStatus).catch(() => {});
  }, []);

  useEffect(() => {
    setLlmModelsLoading(true);
    api
      .listLlmModels(form.default_llm_provider)
      .then((r) => setLlmModels(r.models || []))
      .catch(() => setLlmModels([]))
      .finally(() => setLlmModelsLoading(false));
  }, [form.default_llm_provider]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      Object.entries(form).forEach(([key, value]) => {
        if (value != null && value !== "") updates[key] = String(value);
      });
      await api.updateSettings(updates);
      const p = await api.listProviders();
      setProviders(p);
      setDefaults({
        llm_provider: form.default_llm_provider,
        llm_model: form.default_llm_model,
        image_provider: form.default_image_provider,
        tts_provider: form.default_tts_provider,
        tts_voice: form.default_tts_voice,
        video_provider: form.default_video_provider,
        video_model: form.default_video_model,
        resolution: form.default_resolution,
        transition: form.default_transition,
        image_style: form.default_image_style,
        word_count: Number(form.default_word_count) || 400,
        scene_count: Number(form.default_scene_count) || 5,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      api.redisStatus().then(setRedisStatus).catch(() => {});
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const apiKeys = [
    { key: "openai_api_key", label: "OpenAI API Key", desc: "For GPT, TTS, Whisper, DALL-E, Sora" },
    { key: "groq_api_key", label: "Groq API Key", desc: "For LLaMA models and fast inference" },
    { key: "openrouter_api_key", label: "OpenRouter API Key", desc: "For free models (Gemini, Qwen, DeepSeek)" },
    { key: "elevenlabs_api_key", label: "ElevenLabs API Key", desc: "For high-quality TTS voices" },
    { key: "replicate_api_key", label: "Replicate API Key", desc: "For Flux image generation" },
    { key: "fal_api_key", label: "FAL AI API Key", desc: "For Flux image generation" },
    { key: "together_api_key", label: "Together AI API Key", desc: "For Flux image generation (free tier)" },
    { key: "runware_api_key", label: "Runware API Key", desc: "For image generation" },
  ];

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Settings className="h-8 w-8 text-cyan-500" /> Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure API keys, providers, and infrastructure</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : saved ? <><CheckCircle className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save</>}
        </Button>
      </div>

      {/* Redis Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Redis Queue</CardTitle>
          <CardDescription>
            {redisStatus?.status === "connected"
              ? "Redis is connected and processing jobs reliably"
              : "Optional – enables persistent job queue, crash recovery, and multi-worker support"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Redis URL</label>
            <Input
              placeholder="redis://localhost:6379/0 (leave empty for in-memory mode)"
              value={form.redis_url}
              onChange={(e) => update("redis_url", e.target.value)}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requires server restart to take effect</p>
          </div>
          {redisStatus && (
            <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge variant={redisStatus.status === "connected" ? "default" : redisStatus.enabled ? "destructive" : "secondary"}>
                  {redisStatus.status === "connected" ? (
                    <><Activity className="h-3 w-3 mr-1" />Connected</>
                  ) : redisStatus.enabled ? (
                    <><AlertCircle className="h-3 w-3 mr-1" />Error</>
                  ) : (
                    "In-Memory Mode"
                  )}
                </Badge>
              </div>
              {redisStatus.status === "connected" && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                      <span className="text-slate-500 dark:text-slate-400">Version</span>
                      <span className="font-mono">{redisStatus.version}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                      <span className="text-slate-500 dark:text-slate-400">Memory</span>
                      <span className="font-mono">{redisStatus.used_memory_human}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                      <span className="text-slate-500 dark:text-slate-400">Clients</span>
                      <span className="font-mono">{redisStatus.connected_clients}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                      <span className="text-slate-500 dark:text-slate-400">Uptime</span>
                      <span className="font-mono">{Math.floor((redisStatus.uptime_seconds || 0) / 3600)}h</span>
                    </div>
                  </div>
                  {redisStatus.queue && (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center p-2 rounded bg-cyan-50 dark:bg-cyan-950/30">
                        <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{redisStatus.queue.pending || 0}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Queued</p>
                      </div>
                      <div className="text-center p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{redisStatus.queue.processing || 0}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Processing</p>
                      </div>
                      <div className="text-center p-2 rounded bg-rose-50 dark:bg-rose-950/30">
                        <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{redisStatus.queue.dead_letter || 0}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Dead Letter</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {redisStatus.status === "disconnected" && !redisStatus.enabled && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Running in in-memory mode. Jobs will be lost on server restart.
                  Set a Redis URL above and restart the server for persistent queuing.
                </p>
              )}
              {redisStatus.error && (
                <p className="text-sm text-red-500">{redisStatus.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> API Keys</CardTitle>
          <CardDescription>Your keys are stored in the .env file on the server</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiKeys.map((item) => (
            <div key={item.key}>
              <label className="text-sm font-medium mb-1 block">{item.label}</label>
              <Input type="password" placeholder={item.desc} value={(form as any)[item.key] || ""} onChange={(e) => update(item.key, e.target.value)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Generation Defaults</CardTitle>
          <CardDescription>Account-wide defaults for script, image, video, and TTS generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Default Script Length (words)</label>
              <Input
                type="number"
                min={150}
                max={800}
                value={form.default_word_count ?? 400}
                onChange={(e) => update("default_word_count", e.target.value)}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Used when generating from concept</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Default Scene Count</label>
              <Input
                type="number"
                min={2}
                max={15}
                value={form.default_scene_count ?? 5}
                onChange={(e) => update("default_scene_count", e.target.value)}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scenes per video when generating from concept</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Script / Storyboard LLM</label>
              <Select value={form.default_llm_provider} onValueChange={(value) => update("default_llm_provider", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">LLM Model</label>
              <Select value={form.default_llm_model} onValueChange={(value) => update("default_llm_model", value)} disabled={llmModelsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={llmModelsLoading ? "Loading models…" : "Model"} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const fallback = providers.llm.find((p) => p.name === form.default_llm_provider)?.models || ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"];
                    const list = llmModels.length ? llmModels : fallback;
                    const options = list.includes(form.default_llm_model) ? list : [form.default_llm_model, ...list];
                    return options.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>);
                  })()}
                </SelectContent>
              </Select>
              {llmModelsLoading && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fetching models from API…</p>}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Image Generation Provider</label>
            <Select value={form.default_image_provider} onValueChange={(value) => update("default_image_provider", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replicate">Replicate</SelectItem>
                <SelectItem value="fal">FAL AI</SelectItem>
                <SelectItem value="together">Together AI</SelectItem>
                <SelectItem value="pollinations">Pollinations (Free)</SelectItem>
                <SelectItem value="openai_image">OpenAI</SelectItem>
                <SelectItem value="runware">Runware</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Video Generation Provider</label>
              <Select value={form.default_video_provider} onValueChange={(value) => update("default_video_provider", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sora">Sora (OpenAI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Video Model</label>
              <Select value={form.default_video_model} onValueChange={(value) => update("default_video_model", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  {(providers.video.find((p) => p.name === form.default_video_provider)?.models || ["sora-2", "sora-2-pro", "sora-2-pro-2025-10-06"]).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">TTS Provider</label>
              <Select value={form.default_tts_provider} onValueChange={(value) => update("default_tts_provider", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edge">Edge TTS (Free)</SelectItem>
                  <SelectItem value="openai_tts">OpenAI TTS</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Default TTS Voice ID</label>
              <Input placeholder="en-US-ChristopherNeural" value={form.default_tts_voice} onChange={(e) => update("default_tts_voice", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5" /> Video Defaults</CardTitle>
          <CardDescription>Default resolution, transition, and image style for new videos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Resolution</label>
              <Select value={form.default_resolution} onValueChange={(value) => update("default_resolution", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Resolution" />
                </SelectTrigger>
                <SelectContent>
                  {(resolutions.length ? resolutions : [{ id: "1080x1920", name: "1080x1920 (9:16 Portrait)" }, { id: "1920x1080", name: "1920x1080 (16:9 Landscape)" }, { id: "1024x1024", name: "1024x1024 (1:1 Square)" }]).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Transition</label>
              <Select value={form.default_transition} onValueChange={(value) => update("default_transition", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Transition" />
                </SelectTrigger>
                <SelectContent>
                  {(transitions.length ? transitions : [{ id: "fade", name: "Fade" }, { id: "dissolve", name: "Dissolve" }, { id: "wipeleft", name: "Wipe Left" }]).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Image Style</label>
            <Select value={form.default_image_style} onValueChange={(value) => update("default_image_style", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realistic">Realistic</SelectItem>
                <SelectItem value="anime">Anime</SelectItem>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="illustration">Illustration</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
          <CardDescription>FFmpeg path for video processing</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium mb-1 block">FFmpeg Path</label>
            <Input placeholder="ffmpeg" value={form.ffmpeg_path} onChange={(e) => update("ffmpeg_path", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[...providers.llm, ...providers.image, ...providers.tts, ...providers.video].map((p) => (
              <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/70 border border-slate-200/80 dark:border-zinc-700">
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant={p.configured ? "default" : "destructive"}>
                  {p.configured ? <><CheckCircle className="h-3 w-3 mr-1" /> Active</> : <><AlertCircle className="h-3 w-3 mr-1" /> Not Set</>}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
