"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  image_prompt: string;
  sora_prompt?: string;
}

interface VideoProductionResult {
  title?: string;
  total_duration_seconds?: number;
  scenes: VideoProductionScene[];
}

type BasicScene = {
  narration?: string;
  subtitle?: string;
  image_prompt?: string;
  description?: string;
  transition?: string;
};

const SCRIPT_TEMPLATES = [
  {
    id: "hook-problem",
    name: "Hook → Problem → Insight → CTA",
    description: "Fast narrative arc for Shorts.",
    body:
      "Hook: \n\nProblem: \n\nInsight: \n\nCTA: ",
  },
  {
    id: "listicle",
    name: "Listicle (1–5)",
    description: "Punchy facts with a strong close.",
    body:
      "Hook: \n\n1. \n2. \n3. \n\nClose: ",
  },
  {
    id: "myth-buster",
    name: "Myth → Reality",
    description: "Contrast format for educational topics.",
    body:
      "Hook: \n\nMyth: \nReality: \n\nProof: \n\nClose: ",
  },
  {
    id: "story-beat",
    name: "Mini story (3 beats)",
    description: "Setup → Turn → Payoff.",
    body:
      "Setup: \n\nTurn: \n\nPayoff: ",
  },
];

const AI_PRESETS = [
  { id: "rewrite", label: "Rewrite to be punchier", prompt: "Rewrite this to be punchier, with shorter sentences." },
  { id: "shorten", label: "Shorten by 30%", prompt: "Shorten this by ~30% without losing key meaning." },
  { id: "expand", label: "Expand with detail", prompt: "Expand with concrete details and examples." },
  { id: "hook", label: "Add a strong hook", prompt: "Add a strong first-line hook, then continue naturally." },
];

function sceneImagePrompt(s: VideoProductionScene): string {
  return (s.image_prompt || s.sora_prompt || "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ScriptsPage() {
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);

  const [mode, setMode] = useState<ScriptMode>("video_production");
  const [editorTab, setEditorTab] = useState<"script" | "scenes">("scenes");
  const [concept, setConcept] = useState("");
  const [storyType, setStoryType] = useState("general");
  const [storyTemplate, setStoryTemplate] = useState("default");
  const [wordCount, setWordCount] = useState(defaults.word_count ?? 400);
  const [sceneCount, setSceneCount] = useState(defaults.scene_count ?? 5);
  const [llmProvider, setLlmProvider] = useState(defaults.llm_provider);
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [storyTypes, setStoryTypes] = useState<{ id: string; name: string }[]>([]);
  const [storyTemplates, setStoryTemplates] = useState<{ id: string; name: string; description: string }[]>([]);

  const [splitCount, setSplitCount] = useState(defaults.scene_count ?? 5);
  const [splitting, setSplitting] = useState(false);
  const [scenes, setScenes] = useState<BasicScene[]>([]);

  const [videoProduction, setVideoProduction] = useState<VideoProductionResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [takingToVideo, setTakingToVideo] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"script" | "scenes">("script");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);

  const [aiPreset, setAiPreset] = useState("rewrite");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiTarget, setAiTarget] = useState<"script" | "scene">("script");
  const [aiLoading, setAiLoading] = useState(false);

  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const sceneRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    api.listStoryTemplates().then(setStoryTemplates).catch(() => {});
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

  useEffect(() => {
    setEditorTab(mode === "basic" ? "script" : "scenes");
    setSelectedSceneKey(null);
    setSearchScope(mode === "video_production" ? "scenes" : "script");
    setAiTarget(mode === "video_production" ? "scene" : "script");
  }, [mode]);

  const scriptStats = useMemo(() => {
    const words = script.trim() ? script.trim().split(/\s+/).filter(Boolean).length : 0;
    return { words };
  }, [script]);

  const outlineItems = useMemo(() => {
    if (mode === "video_production") {
      const items = (videoProduction?.scenes || []).map((scene, idx) => ({
        id: `vp-${idx}`,
        label: `Scene ${scene.scene_number}`,
        subtitle: scene.script?.slice(0, 64) || "—",
        meta: scene.timestamp,
      }));
      return items;
    }
    if (scenes.length > 0) {
      return scenes.map((scene, idx) => ({
        id: `basic-${idx}`,
        label: `Scene ${idx + 1}`,
        subtitle: scene.narration?.slice(0, 64) || scene.description?.slice(0, 64) || "—",
        meta: scene.transition || "fade",
      }));
    }
    return [
      {
        id: "script",
        label: "Script",
        subtitle: script.trim() ? script.trim().slice(0, 72) : "No script yet",
        meta: `${scriptStats.words} words`,
      },
    ];
  }, [mode, videoProduction, scenes, script, scriptStats.words]);

  const makeRegex = (global = true) => {
    if (!searchQuery.trim()) return null;
    const flags = `${searchCaseSensitive ? "" : "i"}${global ? "g" : ""}`;
    return new RegExp(escapeRegExp(searchQuery), flags);
  };

  const scriptMatchCount = useMemo(() => {
    const regex = makeRegex(true);
    if (!regex) return 0;
    return (script.match(regex) || []).length;
  }, [script, searchQuery, searchCaseSensitive]);

  const sceneMatchCount = useMemo(() => {
    const regex = makeRegex(true);
    if (!regex) return 0;
    const list =
      mode === "video_production"
        ? videoProduction?.scenes?.map((s) => `${s.script}\n${sceneImagePrompt(s)}`) || []
        : scenes.map((s) => `${s.narration ?? ""}\n${s.image_prompt ?? ""}\n${s.description ?? ""}`);
    return list.reduce((sum, text) => sum + (text.match(regex) || []).length, 0);
  }, [mode, videoProduction, scenes, searchQuery, searchCaseSensitive]);

  const copyToClipboard = async (text: string, label: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id ?? label);
      notify.success(`Copied ${label} to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify.error("Failed to copy");
    }
  };

  const handleGenerate = async () => {
    if (!concept.trim()) return;
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
          llm_model: defaults.llm_model,
        });
        setVideoProduction(result);
      } else {
        const result = await api.generateScript({
          concept,
          story_type: storyType,
          story_template: storyTemplate,
          word_count: wordCount,
          llm_provider: llmProvider,
          llm_model: defaults.llm_model,
        });
        setScript(result.script);
      }
    } catch (err: any) {
      notify.error(err?.message || "Generation failed");
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
        story_template: storyTemplate,
        generate_subtitles: true,
        llm_provider: llmProvider,
        llm_model: defaults.llm_model,
      });
      setScenes(result.scenes || []);
      notify.success(`Split into ${result.scenes?.length || 0} scenes`);
      setEditorTab("scenes");
    } catch (err: any) {
      notify.error(err?.message || "Split failed");
    } finally {
      setSplitting(false);
    }
  };

  const handleCopyFullProduction = () => {
    if (!videoProduction?.scenes) return;
    const text = videoProduction.scenes
      .map(
        (s) =>
          `[${s.timestamp}] ${s.camera_angle} | ${s.camera_movement}\nLighting: ${s.lighting} | Quality: ${s.quality}\nScript: ${s.script}\nImage prompt: ${sceneImagePrompt(s)}\n`,
      )
      .join("\n---\n");
    copyToClipboard(text, "full production script", "full");
  };

  const handleCopyImagePrompts = () => {
    if (!videoProduction?.scenes) return;
    const text = videoProduction.scenes.map((s) => `[${s.timestamp}] ${sceneImagePrompt(s)}`).join("\n\n");
    copyToClipboard(text, "image prompts", "image-prompts");
  };

  const handleDownloadTxt = () => {
    if (!videoProduction?.scenes) return;
    const lines = [
      `# ${videoProduction.title || "ShortsForge storyboard"}`,
      `Total duration: ${videoProduction.total_duration_seconds || 0}s`,
      "",
      ...videoProduction.scenes.flatMap((s) => [
        `## Scene ${s.scene_number} [${s.timestamp}]`,
        `Camera: ${s.camera_angle} | ${s.camera_movement}`,
        `Lighting: ${s.lighting}`,
        `Quality: ${s.quality}`,
        `Script: ${s.script}`,
        `Image prompt: ${sceneImagePrompt(s)}`,
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
    notify.success("Downloaded as .txt");
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
    notify.success("Downloaded as .json");
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
          image_prompt: sceneImagePrompt(s),
          transition: "fade",
          duration: s.duration_seconds,
        }));
        const job = await withTimeout(
          api.generateVideo({
            title: videoProduction.title || "AI Video",
            story_type: storyType,
            story_template: storyTemplate,
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
          notify.success("Storyboard project ready — opening project");
          router.push(`/projects/${job.project_id}`);
        }
      } catch (err: any) {
        notify.error(err?.message || "Failed to create project");
      } finally {
        setTakingToVideo(false);
      }
    } else if (scenes.length > 0) {
      setTakingToVideo(true);
      const fullScript = scenes.map((s) => s.narration || "").join("\n\n");
      const scenesPayload = scenes.map((s) => ({
        narration: s.narration || "",
        subtitle: s.subtitle || s.narration || "",
        image_prompt: s.image_prompt || s.description || "",
        transition: s.transition || "fade",
        duration: undefined,
      }));
      try {
        const job = await withTimeout(
          api.generateVideo({
            title: "AI Video",
            story_type: storyType,
            story_template: storyTemplate,
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
          notify.success("Storyboard project ready — opening project");
          router.push(`/projects/${job.project_id}`);
        }
      } catch (err: any) {
        notify.error(err?.message || "Failed to create project");
      } finally {
        setTakingToVideo(false);
      }
    } else {
      const fullScript = script.trim();
      if (!fullScript) {
        notify.error("No script to use");
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
      notify.success("Opened Generate page with your script");
    }
  };

  const handleSelectOutline = (id: string) => {
    setSelectedSceneKey(id);
    setEditorTab("scenes");
    const target = sceneRefs.current[id];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const updateVideoScene = (index: number, patch: Partial<VideoProductionScene>) => {
    setVideoProduction((prev) => {
      if (!prev) return prev;
      const next = [...prev.scenes];
      next[index] = { ...next[index], ...patch };
      return { ...prev, scenes: next };
    });
  };

  const updateBasicScene = (index: number, patch: Partial<BasicScene>) => {
    setScenes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleReplaceAll = () => {
    const regex = makeRegex(true);
    if (!regex) return;
    if (searchScope === "script") {
      if (!script) return;
      setScript((prev) => prev.replace(regex, replaceQuery));
      notify.success(`Replaced ${scriptMatchCount} match(es) in script.`);
      return;
    }
    if (mode === "video_production" && videoProduction?.scenes) {
      setVideoProduction((prev) => {
        if (!prev) return prev;
        const next = prev.scenes.map((scene) => ({
          ...scene,
          script: scene.script?.replace(regex, replaceQuery) ?? "",
          image_prompt: sceneImagePrompt(scene).replace(regex, replaceQuery),
        }));
        return { ...prev, scenes: next };
      });
      notify.success(`Replaced ${sceneMatchCount} match(es) in scenes.`);
      return;
    }
    if (mode === "basic" && scenes.length) {
      setScenes((prev) =>
        prev.map((scene) => ({
          ...scene,
          narration: scene.narration?.replace(regex, replaceQuery),
          image_prompt: scene.image_prompt?.replace(regex, replaceQuery),
          description: scene.description?.replace(regex, replaceQuery),
        })),
      );
      notify.success(`Replaced ${sceneMatchCount} match(es) in scenes.`);
    }
  };

  const handleReplaceSelected = () => {
    const regex = makeRegex(false);
    if (!regex || !selectedSceneKey) return;
    if (selectedSceneKey === "script") {
      setScript((prev) => prev.replace(regex, replaceQuery));
      notify.success("Replaced in script.");
      return;
    }
    if (selectedSceneKey.startsWith("vp-")) {
      const index = Number(selectedSceneKey.replace("vp-", ""));
      if (!Number.isFinite(index)) return;
      const scene = videoProduction?.scenes?.[index];
      if (!scene) return;
      updateVideoScene(index, {
        script: scene.script?.replace(regex, replaceQuery) ?? "",
        image_prompt: sceneImagePrompt(scene).replace(regex, replaceQuery),
      });
      notify.success("Replaced in selected scene.");
      return;
    }
    if (selectedSceneKey.startsWith("basic-")) {
      const index = Number(selectedSceneKey.replace("basic-", ""));
      if (!Number.isFinite(index)) return;
      const scene = scenes[index];
      if (!scene) return;
      updateBasicScene(index, {
        narration: scene.narration?.replace(regex, replaceQuery),
        image_prompt: scene.image_prompt?.replace(regex, replaceQuery),
        description: scene.description?.replace(regex, replaceQuery),
      });
      notify.success("Replaced in selected scene.");
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = SCRIPT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    if (mode !== "basic") {
      setMode("basic");
    }
    setScript(template.body);
    setScenes([]);
    setEditorTab("script");
    notify.success(`Applied template: ${template.name}`);
  };

  const handleApplyAi = async () => {
    const selectedPreset = AI_PRESETS.find((p) => p.id === aiPreset);
    const instruction = aiInstruction.trim() || selectedPreset?.prompt || "";
    if (!instruction) {
      notify.error("Add an instruction for the AI helper.");
      return;
    }
    let text = "";
    let applyFn: (next: string) => void = () => {};
    if (aiTarget === "script") {
      text = script.trim();
      applyFn = (next) => setScript(next);
    } else if (selectedSceneKey?.startsWith("vp-")) {
      const index = Number(selectedSceneKey.replace("vp-", ""));
      const scene = videoProduction?.scenes?.[index];
      if (scene) {
        text = scene.script || "";
        applyFn = (next) => updateVideoScene(index, { script: next });
      }
    } else if (selectedSceneKey?.startsWith("basic-")) {
      const index = Number(selectedSceneKey.replace("basic-", ""));
      const scene = scenes[index];
      if (scene) {
        text = scene.narration || "";
        applyFn = (next) => updateBasicScene(index, { narration: next });
      }
    }
    if (!text.trim()) {
      notify.error("Select a script or scene with text.");
      return;
    }
    setAiLoading(true);
    try {
      const result = await api.rewriteScript({
        text,
        instruction,
        story_type: storyType,
        llm_provider: llmProvider,
        llm_model: defaults.llm_model,
      });
      applyFn(result.text);
      notify.success("AI update applied.");
    } catch (err: any) {
      notify.error(err?.message || "AI helper failed");
    } finally {
      setAiLoading(false);
    }
  };

  const outlineHeader =
    mode === "video_production"
      ? `Storyboard scenes (${videoProduction?.scenes?.length || 0})`
      : scenes.length > 0
        ? `Scenes (${scenes.length})`
        : "Outline";

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Script editor</h1>
            <p className="text-sm text-muted-foreground">
              Build a tight script, map it to scenes, and send a clean storyboard to your project.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setSearchOpen(true)}>
              Search & Replace
            </Button>
            <Button variant="secondary" onClick={handleTakeToVideo} loading={takingToVideo} loadingLabel="Sending…">
              Send to project
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={mode} onValueChange={(value) => setMode(value as ScriptMode)}>
            <TabsList>
              <TabsTrigger value="video_production">Storyboard</TabsTrigger>
              <TabsTrigger value="basic">Basic script</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <Card className="flex min-h-0 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{outlineHeader}</CardTitle>
              <CardDescription className="text-xs">
                Click to jump to any scene.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <Command className="h-full bg-transparent">
                <CommandInput placeholder="Filter scenes..." />
                <CommandList className="mt-2">
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup heading="Outline">
                    {outlineItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.subtitle} ${item.meta}`}
                        onSelect={() => handleSelectOutline(item.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg",
                          selectedSceneKey === item.id && "bg-muted text-foreground"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{item.meta}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {mode === "video_production" ? "Storyboard editor" : "Script editor"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {mode === "video_production"
                      ? "Edit per-scene narration and image prompts before sending to a project."
                      : "Write the core narration, then split into scenes when ready."}
                  </CardDescription>
                </div>
                {mode === "basic" && (
                  <Badge variant="secondary" className="text-xs">
                    {scriptStats.words} words
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              {mode === "basic" ? (
                <Tabs
                  value={editorTab}
                  onValueChange={(value) => setEditorTab(value as "script" | "scenes")}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <TabsList>
                      <TabsTrigger value="script">Script</TabsTrigger>
                      <TabsTrigger value="scenes">Scenes</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => copyToClipboard(script, "script")}>
                            {copiedId === "script" ? "Copied" : "Copy"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy script</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <TabsContent value="script" className="mt-3 flex min-h-0 flex-1 flex-col">
                    <ScrollArea className="min-h-0 flex-1 pr-3">
                      <div className="space-y-4 pb-4">
                        <Textarea
                          placeholder="Generated script will appear here..."
                          value={script}
                          onChange={(e) => {
                            setScript(e.target.value);
                            if (scenes.length) setScenes([]);
                          }}
                          className="min-h-[320px] resize-none border-border/60 font-mono text-sm focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/10 p-3">
                          <label className="text-sm font-medium">Split into</label>
                          <Input
                            type="number"
                            min={2}
                            max={15}
                            value={splitCount}
                            onChange={(e) => setSplitCount(parseInt(e.target.value) || 5)}
                            className="w-20 border-border/60"
                          />
                          <span className="text-sm text-muted-foreground">scenes</span>
                          <Button variant="outline" onClick={handleSplitScenes} disabled={splitting} className="ml-auto">
                            {splitting ? "Splitting…" : "Auto-split"}
                          </Button>
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="scenes" className="mt-3 flex min-h-0 flex-1 flex-col">
                    <ScrollArea className="min-h-0 flex-1 pr-3">
                      <div className="space-y-3 pb-4">
                        {scenes.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                            Split your script to see scene-level narration and prompts.
                          </div>
                        )}
                        {scenes.map((scene, idx) => {
                          const key = `basic-${idx}`;
                          return (
                            <div
                              key={key}
                              ref={(node) => {
                                sceneRefs.current[key] = node;
                              }}
                              className={cn(
                                "rounded-xl border border-border/60 bg-card p-4 shadow-sm",
                                selectedSceneKey === key && "ring-1 ring-primary/30"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="font-mono">
                                  {idx + 1}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{scene.transition || "fade"}</span>
                              </div>
                              <div className="mt-3 space-y-3">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Narration</label>
                                  <Textarea
                                    value={scene.narration || ""}
                                    onChange={(e) => updateBasicScene(idx, { narration: e.target.value })}
                                    rows={3}
                                    className="mt-1 resize-none border-border/60 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Image prompt</label>
                                  <Textarea
                                    value={scene.image_prompt || ""}
                                    onChange={(e) => updateBasicScene(idx, { image_prompt: e.target.value })}
                                    rows={2}
                                    className="mt-1 resize-none border-border/60 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                                  <Textarea
                                    value={scene.description || ""}
                                    onChange={(e) => updateBasicScene(idx, { description: e.target.value })}
                                    rows={2}
                                    className="mt-1 resize-none border-border/60 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <ScrollArea className="min-h-0 flex-1 pr-3">
                    <div className="space-y-4 pb-4">
                      {!videoProduction?.scenes?.length && (
                        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                          Generate a storyboard to start editing scenes here.
                        </div>
                      )}
                      {videoProduction?.scenes?.map((scene, idx) => {
                        const key = `vp-${idx}`;
                        return (
                          <div
                            key={key}
                            ref={(node) => {
                              sceneRefs.current[key] = node;
                            }}
                            className={cn(
                              "rounded-xl border border-border/60 bg-card p-4 shadow-sm",
                              selectedSceneKey === key && "ring-1 ring-primary/30"
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge variant="secondary" className="font-mono">
                                {scene.scene_number}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{scene.timestamp}</span>
                            </div>
                            <div className="mt-3 space-y-3">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Camera</label>
                                  <Input
                                    value={scene.camera_angle || ""}
                                    onChange={(e) => updateVideoScene(idx, { camera_angle: e.target.value })}
                                    className="mt-1 border-border/60 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Movement</label>
                                  <Input
                                    value={scene.camera_movement || ""}
                                    onChange={(e) => updateVideoScene(idx, { camera_movement: e.target.value })}
                                    className="mt-1 border-border/60 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lighting</label>
                                  <Input
                                    value={scene.lighting || ""}
                                    onChange={(e) => updateVideoScene(idx, { lighting: e.target.value })}
                                    className="mt-1 border-border/60 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quality</label>
                                  <Input
                                    value={scene.quality || ""}
                                    onChange={(e) => updateVideoScene(idx, { quality: e.target.value })}
                                    className="mt-1 border-border/60 text-xs"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Narration</label>
                                <Textarea
                                  value={scene.script || ""}
                                  onChange={(e) => updateVideoScene(idx, { script: e.target.value })}
                                  rows={3}
                                  className="mt-1 resize-none border-border/60 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Image prompt</label>
                                <Textarea
                                  value={sceneImagePrompt(scene)}
                                  onChange={(e) => updateVideoScene(idx, { image_prompt: e.target.value })}
                                  rows={2}
                                  className="mt-1 resize-none border-border/60 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tools</CardTitle>
              <CardDescription className="text-xs">Generate, refine, and export.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <ScrollArea className="min-h-0 flex-1 pr-3">
                <div className="space-y-6 pb-4">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Generation</div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Concept</label>
                        <Textarea
                          placeholder="e.g., A documentary about Tokyo at dusk..."
                          value={concept}
                          onChange={(e) => setConcept(e.target.value)}
                          rows={3}
                          className="resize-none border-border/60 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Story type</label>
                          <Select value={storyType} onValueChange={setStoryType}>
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
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scenes</label>
                            <Input
                              type="number"
                              min={2}
                              max={15}
                              value={sceneCount}
                              onChange={(e) =>
                                setSceneCount(Math.max(2, Math.min(15, parseInt(e.target.value) || 5)))
                              }
                              className="border-border/60"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Word count</label>
                            <Input
                              type="number"
                              min={150}
                              max={1000}
                              value={wordCount}
                              onChange={(e) => setWordCount(parseInt(e.target.value) || defaults.word_count || 400)}
                              className="border-border/60"
                            />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Story template</label>
                        <Select value={storyTemplate} onValueChange={setStoryTemplate}>
                          <SelectTrigger className="border-border/60">
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                          <SelectContent>
                            {storyTemplates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {storyTemplates.find((t) => t.id === storyTemplate)?.description && (
                          <p className="text-xs text-muted-foreground">
                            {storyTemplates.find((t) => t.id === storyTemplate)?.description}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LLM provider</label>
                        <Select value={llmProvider} onValueChange={setLlmProvider}>
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
                      <Separator />
                      <details className="group">
                        <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                          Subtitle settings
                        </summary>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={subtitleSettings.subtitle_enabled}
                              onChange={(e) =>
                                setSubtitleSettings((s) => ({ ...s, subtitle_enabled: e.target.checked }))
                              }
                            />
                            Enable subtitles
                          </label>
                          {subtitleSettings.subtitle_enabled && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                                <Select
                                  value={subtitleSettings.subtitle_source}
                                  onValueChange={(v: "llm" | "transcription") =>
                                    setSubtitleSettings((s) => ({ ...s, subtitle_source: v }))
                                  }
                                >
                                  <SelectTrigger className="mt-1 border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="llm">LLM-generated</SelectItem>
                                    <SelectItem value="transcription">Audio transcription</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Size</label>
                                <Input
                                  type="number"
                                  min={24}
                                  max={96}
                                  value={subtitleSettings.subtitle_size}
                                  onChange={(e) =>
                                    setSubtitleSettings((s) => ({ ...s, subtitle_size: parseInt(e.target.value) || 48 }))
                                  }
                                  className="mt-1 border-border/60"
                                />
                              </div>
                              {subtitleSettings.subtitle_source === "llm" && (
                                <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={subtitleSettings.generate_subtitles}
                                    onChange={(e) =>
                                      setSubtitleSettings((s) => ({ ...s, generate_subtitles: e.target.checked }))
                                    }
                                  />
                                  Generate subtitles with LLM
                                </label>
                              )}
                              {subtitleSettings.subtitle_source === "transcription" && (
                                <div className="col-span-2 grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Provider</label>
                                    <Select
                                      value={subtitleSettings.transcription_provider}
                                      onValueChange={(v) =>
                                        setSubtitleSettings((s) => ({ ...s, transcription_provider: v }))
                                      }
                                    >
                                      <SelectTrigger className="mt-1 border-border/60">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="openai">OpenAI</SelectItem>
                                        <SelectItem value="groq">Groq</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Language</label>
                                    <Input
                                      value={subtitleSettings.transcription_language}
                                      onChange={(e) =>
                                        setSubtitleSettings((s) => ({ ...s, transcription_language: e.target.value }))
                                      }
                                      className="mt-1 border-border/60"
                                    />
                                  </div>
                                </div>
                              )}
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Font</label>
                                <Select
                                  value={subtitleSettings.subtitle_font}
                                  onValueChange={(v) => setSubtitleSettings((s) => ({ ...s, subtitle_font: v }))}
                                >
                                  <SelectTrigger className="mt-1 border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {["Arial", "Montserrat", "Roboto", "Impact", "Open Sans", "Georgia"].map((f) => (
                                      <SelectItem key={f} value={f}>
                                        {f}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Position</label>
                                <Select
                                  value={subtitleSettings.subtitle_position}
                                  onValueChange={(v: "bottom" | "top" | "center") =>
                                    setSubtitleSettings((s) => ({ ...s, subtitle_position: v }))
                                  }
                                >
                                  <SelectTrigger className="mt-1 border-border/60">
                                    <SelectValue />
                                  </SelectTrigger>
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
                      </details>
                      <Button variant="secondary" onClick={handleGenerate} disabled={loading || !concept.trim()} className="w-full">
                        {loading ? "Generating…" : mode === "video_production" ? "Generate storyboard" : "Generate script"}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Templates</div>
                    <div className="mt-3 space-y-3">
                      {SCRIPT_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleApplyTemplate(template.id)}
                          className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-left text-sm transition hover:border-border"
                        >
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground">{template.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">AI helpers</div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preset</label>
                        <Select value={aiPreset} onValueChange={setAiPreset}>
                          <SelectTrigger className="border-border/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_PRESETS.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                {preset.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom instruction</label>
                        <Textarea
                          value={aiInstruction}
                          onChange={(e) => setAiInstruction(e.target.value)}
                          rows={2}
                          placeholder="Optional override, e.g. Make it sound more cinematic."
                          className="resize-none border-border/60 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Apply to</label>
                        <Select value={aiTarget} onValueChange={(v) => setAiTarget(v as "script" | "scene")}>
                          <SelectTrigger className="border-border/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="script">Full script</SelectItem>
                            <SelectItem value="scene">Selected scene</SelectItem>
                          </SelectContent>
                        </Select>
                        {aiTarget === "scene" && !selectedSceneKey && (
                          <p className="text-xs text-muted-foreground">Select a scene in the outline first.</p>
                        )}
                      </div>
                      <Button variant="outline" onClick={handleApplyAi} disabled={aiLoading} className="w-full gap-2">
                        {aiLoading ? "Applying…" : "Apply AI helper"}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Export</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopyFullProduction} disabled={!videoProduction}>
                        {copiedId === "full" ? "Copied" : "Copy all"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopyImagePrompts} disabled={!videoProduction}>
                        {copiedId === "image-prompts" ? "Copied" : "Image prompts"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadTxt} disabled={!videoProduction}>
                        .txt
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadJson} disabled={!videoProduction}>
                        .json
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Search & replace</DialogTitle>
              <DialogDescription>Quickly replace phrases in the script or scenes.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Find</label>
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Replace</label>
                <Input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scope</label>
                  <Select value={searchScope} onValueChange={(v) => setSearchScope(v as "script" | "scenes")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="script">Script</SelectItem>
                      <SelectItem value="scenes">Scenes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Case</label>
                  <button
                    type="button"
                    onClick={() => setSearchCaseSensitive((s) => !s)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm",
                      searchCaseSensitive ? "border-primary/50 text-foreground" : "border-border text-muted-foreground"
                    )}
                  >
                    {searchCaseSensitive ? "Case sensitive" : "Case insensitive"}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
                {searchScope === "script"
                  ? `${scriptMatchCount} matches in script`
                  : `${sceneMatchCount} matches in scenes`}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleReplaceSelected} disabled={!selectedSceneKey}>
                Replace in selection
              </Button>
              <Button variant="secondary" onClick={handleReplaceAll} disabled={!searchQuery.trim()}>
                Replace all
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
