"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  Scissors,
  ChevronDown,
  ChevronUp,
  Film,
  Camera,
  Sun,
  Zap,
  Download,
  ClipboardList,
  Video,
  Loader2,
  Type,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "sonner";

type ScriptMode = "video_production" | "basic";

interface VideoProductionScene {
  scene_number: number;
  timestamp: string;
  duration_seconds: number;
  camera_angle: string;
  camera_movement: string;
  lighting: string;
  quality: string;
  script: string;
  sora_prompt: string;
}

interface VideoProductionResult {
  title?: string;
  total_duration_seconds?: number;
  scenes: VideoProductionScene[];
}

export default function ScriptsPage() {
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);
  const [mode, setMode] = useState<ScriptMode>("video_production");
  const [concept, setConcept] = useState("");
  const [storyType, setStoryType] = useState("general");
  const [wordCount, setWordCount] = useState(defaults.word_count ?? 400);
  const [sceneCount, setSceneCount] = useState(defaults.scene_count ?? 5);
  const [llmProvider, setLlmProvider] = useState(defaults.llm_provider);
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [storyTypes, setStoryTypes] = useState<{ id: string; name: string }[]>([]);

  const [splitCount, setSplitCount] = useState(defaults.scene_count ?? 5);
  const [splitting, setSplitting] = useState(false);
  const [scenes, setScenes] = useState<any[]>([]);
  const [expandedScene, setExpandedScene] = useState<number | null>(null);

  const [videoProduction, setVideoProduction] = useState<VideoProductionResult | null>(null);
  const [expandedVpScene, setExpandedVpScene] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [takingToVideo, setTakingToVideo] = useState(false);

  const [subtitleSettings, setSubtitleSettings] = useState({
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

  useEffect(() => {
    api.listStoryTypes().then(setStoryTypes).catch(() => {});
  }, []);

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      setLlmProvider(defaults.llm_provider);
      setWordCount(defaults.word_count ?? 400);
      setSceneCount(defaults.scene_count ?? 5);
      setSplitCount(defaults.scene_count ?? 5);
    }
  }, [defaults.llm_provider, defaults.word_count, defaults.scene_count]);

  const copyToClipboard = async (text: string, label: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id ?? label);
      toast.success(`Copied ${label} to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleGenerate = async () => {
    if (!concept) return;
    setLoading(true);
    setScenes([]);
    setVideoProduction(null);
    try {
      if (mode === "video_production") {
        const result = await api.generateVideoProductionScript({
          concept,
          story_type: storyType,
          scene_count: sceneCount,
          llm_provider: llmProvider,
        });
        setVideoProduction(result);
        setScript(result.scenes?.map((s: VideoProductionScene) => s.script).join("\n\n") || "");
      } else {
        const result = await api.generateScript({
          concept,
          story_type: storyType,
          word_count: wordCount,
          llm_provider: llmProvider,
        });
        setScript(result.script);
      }
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSplitScenes = async () => {
    if (!script.trim()) return;
    setSplitting(true);
    try {
      const result = await api.splitScriptToScenes({
        script,
        scene_count: splitCount,
        story_type: storyType,
        generate_subtitles: true,
        llm_provider: llmProvider,
      });
      setScenes(result.scenes || []);
      toast.success(`Split into ${result.scenes?.length || 0} scenes`);
    } catch (err: any) {
      toast.error(err?.message || "Split failed");
    } finally {
      setSplitting(false);
    }
  };

  const handleCopyScript = () => {
    copyToClipboard(script, "script");
  };

  const handleCopyFullProduction = () => {
    if (!videoProduction?.scenes) return;
    const text = videoProduction.scenes
      .map(
        (s) =>
          `[${s.timestamp}] ${s.camera_angle} | ${s.camera_movement}\nLighting: ${s.lighting} | Quality: ${s.quality}\nScript: ${s.script}\nSora Prompt: ${s.sora_prompt}\n`,
      )
      .join("\n---\n");
    copyToClipboard(text, "full production script", "full");
  };

  const handleCopySoraPrompts = () => {
    if (!videoProduction?.scenes) return;
    const text = videoProduction.scenes.map((s) => `[${s.timestamp}] ${s.sora_prompt}`).join("\n\n");
    copyToClipboard(text, "Sora prompts", "sora");
  };

  const handleDownloadTxt = () => {
    if (!videoProduction?.scenes) return;
    const lines = [
      `# ${videoProduction.title || "Video Production Script"}`,
      `Total duration: ${videoProduction.total_duration_seconds || 0}s`,
      "",
      ...videoProduction.scenes.flatMap((s) => [
        `## Scene ${s.scene_number} [${s.timestamp}]`,
        `Camera: ${s.camera_angle} | ${s.camera_movement}`,
        `Lighting: ${s.lighting}`,
        `Quality: ${s.quality}`,
        `Script: ${s.script}`,
        `Sora Prompt: ${s.sora_prompt}`,
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `video-script-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as .txt");
  };

  const handleDownloadJson = () => {
    if (!videoProduction) return;
    const blob = new Blob([JSON.stringify(videoProduction, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `video-script-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as .json");
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Is the backend running?")), ms),
      ),
    ]);

  const handleTakeToVideo = async () => {
    if (videoProduction?.scenes?.length) {
      setTakingToVideo(true);
      try {
        const scenesPayload = videoProduction.scenes.map((s) => ({
          narration: s.script,
          subtitle: s.script,
          image_prompt: s.sora_prompt,
          transition: "fade",
          duration: s.duration_seconds,
        }));
        const job = await withTimeout(
          api.generateVideo({
          title: videoProduction.title || "AI Video",
          story_type: storyType,
          custom_script: videoProduction.scenes.map((s) => s.script).join("\n\n"),
          scenes: scenesPayload,
          scene_count: videoProduction.scenes.length,
          prepare_only: false,
          storyboard_only: true,
          control_mode: "co_pilot",
          ...subtitleSettings,
        }),
          30000,
        );
        addJob(job);
        if (job.project_id) {
          toast.success("Video generation started!");
          router.push(`/projects/${job.project_id}/editor`);
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to start video generation");
      } finally {
        setTakingToVideo(false);
      }
    } else if (scenes.length > 0) {
      setTakingToVideo(true);
      const fullScript = scenes.map((s) => s.narration || s.script).join("\n\n");
      const scenesPayload = scenes.map((s) => ({
        narration: s.narration || s.script,
        subtitle: s.subtitle || s.narration || s.script,
        image_prompt: s.image_prompt || s.description || "",
        transition: s.transition || "fade",
        duration: undefined,
      }));
      try {
        const job = await withTimeout(
          api.generateVideo({
          title: "AI Video",
          story_type: storyType,
          custom_script: fullScript,
          scenes: scenesPayload,
          scene_count: scenes.length,
          prepare_only: false,
          storyboard_only: true,
          control_mode: "co_pilot",
          ...subtitleSettings,
        }),
          30000,
        );
        addJob(job);
        if (job.project_id) {
          toast.success("Video generation started!");
          router.push(`/projects/${job.project_id}/editor`);
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to start video generation");
      } finally {
        setTakingToVideo(false);
      }
    } else {
      const fullScript = script.trim();
      if (!fullScript) {
        toast.error("No script to use");
        return;
      }
      const params = new URLSearchParams({
        script: fullScript,
        story_type: storyType,
        title: "AI Video",
        subtitle_enabled: String(subtitleSettings.subtitle_enabled),
        subtitle_source: subtitleSettings.subtitle_source,
        generate_subtitles: String(subtitleSettings.generate_subtitles),
        transcription_provider: subtitleSettings.transcription_provider,
        transcription_language: subtitleSettings.transcription_language,
        subtitle_size: String(subtitleSettings.subtitle_size),
        subtitle_font: subtitleSettings.subtitle_font,
        subtitle_color: subtitleSettings.subtitle_color,
        subtitle_position: subtitleSettings.subtitle_position,
      });
      router.push(`/generate?${params}`);
      toast.success("Opened Generate page with your script");
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
          Script Editor
        </h1>
        <p className="text-muted-foreground text-sm">
          Generate professional video scripts with timestamps, camera angles, lighting & Sora-ready prompts
        </p>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-muted/60 border border-border/60">
        <button
          onClick={() => setMode("video_production")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === "video_production"
              ? "bg-background shadow-sm text-foreground border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Film className="h-4 w-4" /> Video Production
        </button>
        <button
          onClick={() => setMode("basic")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === "basic"
              ? "bg-background shadow-sm text-foreground border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" /> Basic Script
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
            <CardTitle className="text-lg font-semibold">
              {mode === "video_production" ? "Video Production Script" : "Generate Script"}
            </CardTitle>
            <CardDescription className="text-sm">
              {mode === "video_production"
                ? "Sora/Runway-style script with timestamps, camera, lighting & quality per scene"
                : "Describe your concept and let AI write the script"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Concept</label>
              <Textarea
                placeholder="e.g., A documentary about Tokyo at dusk, street food vendors and neon lights..."
                rows={3}
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="resize-none border-border/60 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Story Type</label>
                <Select value={storyType} onValueChange={(value) => setStoryType(value)}>
                  <SelectTrigger className="border-border/60">
                    <SelectValue placeholder="Select story type" />
                  </SelectTrigger>
                  <SelectContent>
                    {storyTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "video_production" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scenes</label>
                  <Input
                    type="number"
                    min={2}
                    max={15}
                    value={sceneCount}
                    onChange={(e) => setSceneCount(Math.max(2, Math.min(15, parseInt(e.target.value) || 5)))}
                    className="border-border/60"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Word Count</label>
                  <Input
                    type="number"
                    min={150}
                    max={1000}
                    value={wordCount}
                    onChange={(e) => setWordCount(parseInt(e.target.value) || defaults.word_count || 400)}
                    className="border-border/60"
                  />
                  <p className="text-xs text-muted-foreground">Longer = more substantial script (min 150)</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">LLM Provider</label>
              <Select value={llmProvider} onValueChange={(value) => setLlmProvider(value)}>
                <SelectTrigger className="border-border/60">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.llm
                    .filter((p) => p.configured)
                    .map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t border-border/40 pt-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2"><Type className="h-4 w-4" /> Subtitle settings</p>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="script-sub-enable" checked={subtitleSettings.subtitle_enabled} onChange={(e) => setSubtitleSettings((s) => ({ ...s, subtitle_enabled: e.target.checked }))} className="rounded" />
                <label htmlFor="script-sub-enable" className="text-sm cursor-pointer">Enable subtitles</label>
              </div>
              {subtitleSettings.subtitle_enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                    <Select value={subtitleSettings.subtitle_source} onValueChange={(v: "llm" | "transcription") => setSubtitleSettings((s) => ({ ...s, subtitle_source: v }))}>
                      <SelectTrigger className="border-border/60 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llm">LLM-generated</SelectItem>
                        <SelectItem value="transcription">Audio transcription</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</label>
                    <Input type="number" min={24} max={96} value={subtitleSettings.subtitle_size} onChange={(e) => setSubtitleSettings((s) => ({ ...s, subtitle_size: parseInt(e.target.value) || 48 }))} className="border-border/60 mt-1" />
                  </div>
                  {subtitleSettings.subtitle_source === "llm" && (
                    <div className="col-span-2 flex items-center gap-2">
                      <input type="checkbox" id="script-gen-sub" checked={subtitleSettings.generate_subtitles} onChange={(e) => setSubtitleSettings((s) => ({ ...s, generate_subtitles: e.target.checked }))} className="rounded" />
                      <label htmlFor="script-gen-sub" className="text-sm cursor-pointer">Generate subtitles with LLM</label>
                    </div>
                  )}
                  {subtitleSettings.subtitle_source === "transcription" && (
                    <div className="col-span-2 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcription provider</label>
                        <Select value={subtitleSettings.transcription_provider} onValueChange={(v) => setSubtitleSettings((s) => ({ ...s, transcription_provider: v }))}>
                          <SelectTrigger className="border-border/60 mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI (Whisper)</SelectItem>
                            <SelectItem value="groq">Groq</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                        <Input placeholder="en" value={subtitleSettings.transcription_language} onChange={(e) => setSubtitleSettings((s) => ({ ...s, transcription_language: e.target.value }))} className="border-border/60 mt-1" />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Font</label>
                    <Select value={subtitleSettings.subtitle_font} onValueChange={(v) => setSubtitleSettings((s) => ({ ...s, subtitle_font: v }))}>
                      <SelectTrigger className="border-border/60 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Arial", "Montserrat", "Roboto", "Impact", "Open Sans", "Georgia"].map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Position</label>
                    <Select value={subtitleSettings.subtitle_position} onValueChange={(v: "bottom" | "top" | "center") => setSubtitleSettings((s) => ({ ...s, subtitle_position: v }))}>
                      <SelectTrigger className="border-border/60 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Bottom</SelectItem>
                        <SelectItem value="top">Top</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
            <Button
              variant="default"
              onClick={handleGenerate}
              disabled={loading || !concept}
              className="w-full h-11 font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-md gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 shrink-0" />
                  {mode === "video_production" ? "Generate Video Production Script" : "Generate Script"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Output</CardTitle>
              <CardDescription className="text-sm">Generated script and scenes</CardDescription>
            </div>
            {script && mode === "basic" && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopyScript} className="gap-2">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleTakeToVideo} disabled={takingToVideo} className="gap-2">
                  {takingToVideo ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Video className="h-4 w-4 shrink-0" />}
                  Take to Video
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            {mode === "basic" ? (
              <div className="space-y-4">
                <Textarea
                  rows={12}
                  placeholder="Generated script will appear here..."
                  value={script}
                  onChange={(e) => {
                    setScript(e.target.value);
                    setScenes([]);
                  }}
                  className="font-mono text-sm resize-none border-border/60 focus:ring-2 focus:ring-primary/20"
                />
                {script && (
                  <>
                    <p className="text-xs text-muted-foreground">{script.split(/\s+/).filter(Boolean).length} words</p>
                    <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                      <label className="text-sm font-medium whitespace-nowrap">Split into</label>
                      <Input
                        type="number"
                        min={2}
                        max={15}
                        value={splitCount}
                        onChange={(e) => setSplitCount(parseInt(e.target.value) || 5)}
                        className="w-20 border-border/60"
                      />
                      <span className="text-sm text-muted-foreground">scenes</span>
                      <Button
                        variant="outline"
                        onClick={handleSplitScenes}
                        disabled={splitting}
                        className="ml-auto border-border/60 gap-2"
                      >
                        {splitting ? (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        ) : (
                          <>
                            <Scissors className="h-4 w-4 shrink-0" /> Auto-Split
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="min-h-[280px] flex flex-col justify-center">
                {videoProduction ? (
                  <div className="space-y-2">
                    {videoProduction.title && (
                      <p className="font-medium text-foreground">{videoProduction.title}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {videoProduction.scenes?.length} scenes
                      {videoProduction.total_duration_seconds && ` • ${videoProduction.total_duration_seconds}s total`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Scroll down to view scenes, copy prompts, or take to video.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Enter a concept and generate to create a professional video production script with timestamps,
                    camera angles, lighting, quality and Sora-ready prompts per scene.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {videoProduction?.scenes && videoProduction.scenes.length > 0 && (
        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Scenes ({videoProduction.scenes.length})
                </CardTitle>
                <CardDescription className="text-sm">
                  Timestamp, camera, lighting, quality & script per scene. Copy prompts for Sora/Runway.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyFullProduction} className="border-border/60 gap-2">
                  {copiedId === "full" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy All
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopySoraPrompts} className="border-border/60 gap-2">
                  {copiedId === "sora" ? <Check className="h-4 w-4" /> : <Film className="h-4 w-4" />} Sora Prompts
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadTxt} className="border-border/60 gap-2">
                  <Download className="h-4 w-4" /> .txt
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadJson} className="border-border/60 gap-2">
                  <Download className="h-4 w-4" /> .json
                </Button>
                <Button
                  size="sm"
                  onClick={handleTakeToVideo}
                  disabled={takingToVideo}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md gap-2"
                >
                  {takingToVideo ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Video className="h-4 w-4 shrink-0" />
                  )}
                  Take to Video
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {videoProduction.scenes.map((scene: VideoProductionScene, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/60 overflow-hidden bg-card hover:bg-muted/30 transition-colors"
                >
                  <button
                    onClick={() => setExpandedVpScene(expandedVpScene === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      <Badge variant="secondary" className="font-mono shrink-0">
                        {scene.scene_number}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{scene.timestamp}</span>
                      <span className="text-sm font-medium truncate">{scene.script?.slice(0, 70)}...</span>
                    </div>
                    {expandedVpScene === idx ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {expandedVpScene === idx && (
                    <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border/40 bg-muted/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/40">
                          <Camera className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Camera
                            </label>
                            <p className="text-sm mt-1">{scene.camera_angle}</p>
                            <p className="text-xs text-muted-foreground">{scene.camera_movement}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/40">
                          <Sun className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Lighting
                            </label>
                            <p className="text-sm mt-1">{scene.lighting}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/40 sm:col-span-2">
                          <Zap className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Quality
                            </label>
                            <p className="text-sm mt-1">{scene.quality}</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Script
                        </label>
                        <p className="text-sm mt-1">{scene.script || "—"}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Sora / Runway Prompt
                        </label>
                        <p className="text-sm mt-1 text-primary font-mono break-words">{scene.sora_prompt}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 gap-2"
                          onClick={() =>
                            copyToClipboard(scene.sora_prompt, `scene ${scene.scene_number} prompt`, `scene-${idx}`)
                          }
                        >
                          {copiedId === `scene-${idx}` ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 shrink-0" />
                          )}
                          Copy Sora Prompt
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scenes.length > 0 && mode === "basic" && (
        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Scenes ({scenes.length})</CardTitle>
              <CardDescription className="text-sm">AI-generated scene breakdown. Click to expand.</CardDescription>
            </div>
            <Button size="sm" onClick={handleTakeToVideo} disabled={takingToVideo} className="gap-2">
              {takingToVideo ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Video className="h-4 w-4 shrink-0" />}
              Take to Video
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {scenes.map((scene: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-border/60 overflow-hidden">
                  <button
                    onClick={() => setExpandedScene(expandedScene === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="secondary" className="font-mono shrink-0">
                        {idx + 1}
                      </Badge>
                      <p className="text-sm font-medium truncate">
                        {scene.narration?.slice(0, 80) || scene.description?.slice(0, 80) || `Scene ${idx + 1}`}...
                      </p>
                    </div>
                    {expandedScene === idx ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {expandedScene === idx && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/40 bg-muted/10 pt-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Narration
                        </label>
                        <p className="text-sm mt-1">{scene.narration || "—"}</p>
                      </div>
                      {scene.subtitle && scene.subtitle !== scene.narration && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Subtitle (on-screen)
                          </label>
                          <p className="text-sm mt-1">{scene.subtitle}</p>
                        </div>
                      )}
                      {scene.image_prompt && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Image Prompt
                          </label>
                          <p className="text-sm mt-1 text-primary">{scene.image_prompt}</p>
                        </div>
                      )}
                      {scene.description && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Description
                          </label>
                          <p className="text-sm mt-1">{scene.description}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
