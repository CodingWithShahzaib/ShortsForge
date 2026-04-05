"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SCENE_NARRATION_STYLE_IDS } from "@/app/generate/schema";
import { CreationActionBar } from "@/components/creation/CreationActionBar";
import { CreationFlowHeader } from "@/components/creation/CreationFlowHeader";
import { CreationPageShell } from "@/components/creation/CreationPageShell";
import { LinearProgress } from "@/components/ui/progress-linear";
import {
  CreationProgressRail,
  type CreationProgressStep,
} from "@/components/creation/CreationProgressRail";
import type { ScriptQualityMetrics } from "@/lib/types";

type ScriptMode = "video_production" | "basic";
type SceneNarrationStyle = (typeof SCENE_NARRATION_STYLE_IDS)[number];

function isSceneNarrationStyle(value: string): value is SceneNarrationStyle {
  return (SCENE_NARRATION_STYLE_IDS as readonly string[]).includes(value);
}

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
  const defaultsHydrated = useSettingsStore((s) => s.hydrated);

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
  const [outlineFilter, setOutlineFilter] = useState("");
  const [searchScope, setSearchScope] = useState<"script" | "scenes">("script");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);

  const [aiPreset, setAiPreset] = useState("rewrite");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiTarget, setAiTarget] = useState<"script" | "scene">("script");
  const [aiLoading, setAiLoading] = useState(false);
  const [scriptQuality, setScriptQuality] = useState<ScriptQualityMetrics | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityImproving, setQualityImproving] = useState(false);

  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const sceneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [subtitleSettings, setSubtitleSettings] = useState({
    subtitle_enabled: true,
    subtitle_source: "llm" as "llm" | "transcription",
    generate_subtitles: true,
    transcription_provider: "openai",
    transcription_language: "en",
  });

  const [realismSettings, setRealismSettings] = useState({
    scene_duration: defaults.video_style.scene_duration_max,
    scene_narration_style: defaults.scene_narration_style ?? "balanced",
    inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
    transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
    use_production_storyboard: defaults.use_production_storyboard ?? true,
    match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
    visual_continuity: defaults.visual_continuity ?? "",
  });

  useEffect(() => {
    api.listStoryTypes().then(setStoryTypes).catch(() => {});
    api.listStoryTemplates().then(setStoryTemplates).catch(() => {});
  }, []);

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!defaultsHydrated) return;
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      setLlmProvider(defaults.llm_provider);
      setWordCount(defaults.word_count ?? 400);
      setSceneCount(defaults.scene_count ?? 5);
      setSplitCount(defaults.scene_count ?? 5);
      setRealismSettings({
        scene_duration: defaults.video_style.scene_duration_max,
        scene_narration_style: defaults.scene_narration_style ?? "balanced",
        inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
        transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
        use_production_storyboard: defaults.use_production_storyboard ?? true,
        match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
        visual_continuity: defaults.visual_continuity ?? "",
      });
    } else {
      setRealismSettings((prev) => ({
        ...prev,
        scene_duration: defaults.video_style.scene_duration_max,
        scene_narration_style: defaults.scene_narration_style ?? prev.scene_narration_style,
        inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? prev.inter_scene_pause_ms,
        transition_overlap_ms: defaults.transition_overlap_ms ?? prev.transition_overlap_ms,
        use_production_storyboard: defaults.use_production_storyboard ?? prev.use_production_storyboard,
        match_scenes_to_audio: defaults.match_scenes_to_audio ?? prev.match_scenes_to_audio,
        visual_continuity: defaults.visual_continuity ?? prev.visual_continuity,
      }));
    }
  }, [
    defaultsHydrated,
    defaults.llm_provider,
    defaults.word_count,
    defaults.scene_count,
    defaults.video_style.scene_duration_max,
    defaults.scene_narration_style,
    defaults.inter_scene_pause_ms,
    defaults.transition_overlap_ms,
    defaults.use_production_storyboard,
    defaults.match_scenes_to_audio,
    defaults.visual_continuity,
  ]);


  useEffect(() => {
    setEditorTab(mode === "basic" ? "script" : "scenes");
    setSelectedSceneKey(null);
    setSearchScope(mode === "video_production" ? "scenes" : "script");
    setAiTarget(mode === "video_production" ? "scene" : "script");
    setScriptQuality(null);
  }, [mode]);

  useEffect(() => {
    setScriptQuality(null);
  }, [aiTarget, selectedSceneKey, script, scenes, videoProduction]);

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

  const filteredOutlineItems = useMemo(() => {
    const query = outlineFilter.trim().toLowerCase();
    if (!query) return outlineItems;
    return outlineItems.filter((item) =>
      `${item.label} ${item.subtitle} ${item.meta}`.toLowerCase().includes(query),
    );
  }, [outlineFilter, outlineItems]);

  const makeRegex = useCallback((global = true) => {
    if (!searchQuery.trim()) return null;
    const flags = `${searchCaseSensitive ? "" : "i"}${global ? "g" : ""}`;
    return new RegExp(escapeRegExp(searchQuery), flags);
  }, [searchCaseSensitive, searchQuery]);

  const scriptMatchCount = useMemo(() => {
    const regex = makeRegex(true);
    if (!regex) return 0;
    return (script.match(regex) || []).length;
  }, [script, makeRegex]);

  const sceneMatchCount = useMemo(() => {
    const regex = makeRegex(true);
    if (!regex) return 0;
    const list =
      mode === "video_production"
        ? videoProduction?.scenes?.map((s) => `${s.script}\n${sceneImagePrompt(s)}`) || []
        : scenes.map((s) => `${s.narration ?? ""}\n${s.image_prompt ?? ""}\n${s.description ?? ""}`);
    return list.reduce((sum, text) => sum + (text.match(regex) || []).length, 0);
  }, [mode, videoProduction, scenes, makeRegex]);

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
          image_style: defaults.image_style,
          resolution: defaults.resolution,
          transition: defaults.transition,
          llm_provider: llmProvider,
          llm_model: defaults.llm_model,
          visual_continuity: realismSettings.visual_continuity,
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
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Generation failed");
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
        scene_narration_style: realismSettings.scene_narration_style,
        generate_subtitles: true,
        llm_provider: llmProvider,
        llm_model: defaults.llm_model,
      });
      setScenes(result.scenes || []);
      notify.success(`Split into ${result.scenes?.length || 0} scenes`);
      setEditorTab("scenes");
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Split failed");
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
            control_mode: "co_pilot",
            pipeline_mode: "manual",
            target_stage: "storyboard",
            ...subtitleSettings,
            ...realismSettings,
          }),
          30000,
        );
        addJob(job);
        if (job.project_id) {
          notify.success("Scene project is ready — opening project");
          router.push(`/projects/${job.project_id}`);
        }
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Failed to create project");
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
            control_mode: "co_pilot",
            pipeline_mode: "manual",
            target_stage: "storyboard",
            ...subtitleSettings,
            ...realismSettings,
          }),
          30000,
        );
        addJob(job);
        if (job.project_id) {
          notify.success("Scene project is ready — opening project");
          router.push(`/projects/${job.project_id}`);
        }
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Failed to create project");
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
        scene_duration: String(realismSettings.scene_duration),
        scene_narration_style: realismSettings.scene_narration_style,
        inter_scene_pause_ms: String(realismSettings.inter_scene_pause_ms),
        transition_overlap_ms: String(realismSettings.transition_overlap_ms),
        use_production_storyboard: String(realismSettings.use_production_storyboard),
        match_scenes_to_audio: String(realismSettings.match_scenes_to_audio),
        visual_continuity: realismSettings.visual_continuity,
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

  const resolveCurrentTextTarget = useCallback(() => {
    if (aiTarget === "script") {
      return {
        text: script.trim(),
        storyType,
        isFirstScene: true,
        previousNarrations: [] as string[],
        apply: (next: string) => setScript(next),
      };
    }
    if (selectedSceneKey?.startsWith("vp-")) {
      const index = Number(selectedSceneKey.replace("vp-", ""));
      const current = videoProduction?.scenes?.[index];
      return {
        text: (current?.script || "").trim(),
        storyType,
        isFirstScene: index === 0,
        previousNarrations: (videoProduction?.scenes || [])
          .slice(0, index)
          .map((scene) => (scene.script || "").trim())
          .filter(Boolean),
        apply: (next: string) => updateVideoScene(index, { script: next }),
      };
    }
    if (selectedSceneKey?.startsWith("basic-")) {
      const index = Number(selectedSceneKey.replace("basic-", ""));
      const current = scenes[index];
      return {
        text: (current?.narration || "").trim(),
        storyType,
        isFirstScene: index === 0,
        previousNarrations: scenes
          .slice(0, index)
          .map((scene) => (scene.narration || "").trim())
          .filter(Boolean),
        apply: (next: string) => updateBasicScene(index, { narration: next }),
      };
    }
    return null;
  }, [aiTarget, scenes, script, selectedSceneKey, storyType, videoProduction]);

  const analyzeSelectedScript = async () => {
    const target = resolveCurrentTextTarget();
    if (!target?.text) {
      notify.error("Select a script or scene with narration first.");
      return;
    }
    setQualityLoading(true);
    try {
      const result = await api.analyzeScriptQuality({
        narration: target.text,
        story_type: target.storyType,
        is_first_scene: target.isFirstScene,
        previous_narrations: target.previousNarrations,
        llm_provider: llmProvider,
        llm_model: defaults.llm_model,
      });
      setScriptQuality(result);
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Script analysis failed");
    } finally {
      setQualityLoading(false);
    }
  };

  const improveSelectedScript = async () => {
    const target = resolveCurrentTextTarget();
    if (!target?.text) {
      notify.error("Select a script or scene with narration first.");
      return;
    }
    setQualityImproving(true);
    try {
      const result = await api.improveScriptQuality({
        text: target.text,
        story_type: target.storyType,
        is_first_scene: target.isFirstScene,
        previous_narrations: target.previousNarrations,
        issues: scriptQuality?.issues.map((issue) => issue.code) ?? [],
        llm_provider: llmProvider,
        llm_model: defaults.llm_model,
      });
      target.apply(result.text);
      setScriptQuality(result.metrics);
      notify.success("Improved script applied.");
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Script improvement failed");
    } finally {
      setQualityImproving(false);
    }
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
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "AI helper failed");
    } finally {
      setAiLoading(false);
    }
  };

  const outlineHeader =
    mode === "video_production"
      ? `Scene plan (${videoProduction?.scenes?.length || 0})`
      : scenes.length > 0
        ? `Scenes (${scenes.length})`
        : "Outline";
  const hasStructuredScenes = (videoProduction?.scenes?.length || 0) > 0 || scenes.length > 0;
  const hasDraftContent = hasStructuredScenes || script.trim().length > 0;
  const flowProgressSteps = useMemo<CreationProgressStep[]>(
    () => [
      {
        id: "draft",
        label: "Draft script",
        description: "Write or generate your source script",
        status: hasDraftContent ? "complete" : "active",
        hint: hasDraftContent ? "Ready" : "Add draft content",
      },
      {
        id: "scenes",
        label: "Shape scenes",
        description: "Split or edit scene-level narration and prompts",
        status: hasStructuredScenes
          ? "complete"
          : hasDraftContent
            ? "active"
            : "pending",
        hint: hasStructuredScenes ? "Ready" : "Create scene plan first",
      },
      {
        id: "studio",
        label: "Continue to Studio",
        description: "Hand off to scene production workflow",
        status: hasStructuredScenes ? "active" : "blocked",
        hint: hasStructuredScenes
          ? "Open project handoff"
          : "Needs scenes before Studio handoff",
      },
    ],
    [hasDraftContent, hasStructuredScenes],
  );
  const primaryFlowLabel = hasStructuredScenes ? "Send to Studio" : "Continue in Generate";

  return (
    <TooltipProvider>
      <CreationPageShell
        className="h-full min-h-0"
        contentClassName="min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
        header={(
          <CreationFlowHeader
            eyebrow="Script Studio"
            title="Write, shape, and hand off"
            description="Build your script, refine scene-level prompts, then continue to Studio."
            badges={(
              <>
                <Badge variant="secondary">
                  {mode === "video_production" ? "Scene plan mode" : "Basic script mode"}
                </Badge>
                <Badge variant="outline">{outlineHeader}</Badge>
              </>
            )}
            actions={(
              <>
                <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
                  Search & Replace
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTakeToVideo}
                  loading={takingToVideo}
                  loadingLabel="Sending…"
                >
                  {primaryFlowLabel}
                </Button>
              </>
            )}
          />
        )}
        intro={(
          <div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={mode} onValueChange={(value) => setMode(value as ScriptMode)}>
                <TabsList>
                  <TabsTrigger value="video_production">Scene plan</TabsTrigger>
                  <TabsTrigger value="basic">Basic script</TabsTrigger>
                </TabsList>
              </Tabs>
              {mode === "basic" ? (
                <Badge variant="secondary" className="text-xs">
                  {scriptStats.words} words
                </Badge>
              ) : null}
            </div>
          </div>
        )}
        aside={(
          <>
            <CreationProgressRail steps={flowProgressSteps} />
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
                                max={100}
                                value={sceneCount}
                                onChange={(e) =>
                                  setSceneCount(Math.max(2, Math.min(100, parseInt(e.target.value) || 5)))
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
                          {storyTemplates.find((t) => t.id === storyTemplate)?.description ? (
                            <p className="text-xs text-muted-foreground">
                              {storyTemplates.find((t) => t.id === storyTemplate)?.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Script AI</label>
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
                            Scene realism
                          </summary>
                          <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Scene length</label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={60}
                                  step={0.5}
                                  value={realismSettings.scene_duration}
                                  onChange={(e) =>
                                    setRealismSettings((s) => ({ ...s, scene_duration: parseFloat(e.target.value) || 5 }))
                                  }
                                  className="mt-1 border-border/60"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pause (ms)</label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={1200}
                                  step={50}
                                  value={realismSettings.inter_scene_pause_ms}
                                  onChange={(e) =>
                                    setRealismSettings((s) => ({ ...s, inter_scene_pause_ms: parseInt(e.target.value) || 0 }))
                                  }
                                  className="mt-1 border-border/60"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Overlap (ms)</label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={800}
                                  step={50}
                                  value={realismSettings.transition_overlap_ms}
                                  onChange={(e) =>
                                    setRealismSettings((s) => ({ ...s, transition_overlap_ms: parseInt(e.target.value) || 0 }))
                                  }
                                  className="mt-1 border-border/60"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                Narration per scene
                              </label>
                              <Select
                                value={realismSettings.scene_narration_style}
                                onValueChange={(value) => {
                                  if (isSceneNarrationStyle(value)) {
                                    setRealismSettings((s) => ({
                                      ...s,
                                      scene_narration_style: value,
                                    }));
                                  }
                                }}
                              >
                                <SelectTrigger className="mt-1 border-border/60">
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
                            <label className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={realismSettings.use_production_storyboard}
                                onChange={(e) =>
                                  setRealismSettings((s) => ({ ...s, use_production_storyboard: e.target.checked }))
                                }
                              />
                              Director-style scenes (camera + lighting details)
                            </label>
                            <label className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={realismSettings.match_scenes_to_audio}
                                onChange={(e) =>
                                  setRealismSettings((s) => ({ ...s, match_scenes_to_audio: e.target.checked }))
                                }
                              />
                              Match scenes to narration length
                            </label>
                            <div>
                              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Visual continuity</label>
                              <Input
                                value={realismSettings.visual_continuity}
                                onChange={(e) =>
                                  setRealismSettings((s) => ({ ...s, visual_continuity: e.target.value }))
                                }
                                className="mt-1 border-border/60"
                                placeholder="e.g. teal-orange palette, rain, solitary figure"
                              />
                            </div>
                          </div>
                        </details>

                        <details className="group">
                          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                            Caption settings
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
                            {subtitleSettings.subtitle_enabled ? (
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
                                      <SelectItem value="llm">AI-generated</SelectItem>
                                      <SelectItem value="transcription">Speech-to-text from audio</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {subtitleSettings.subtitle_source === "llm" ? (
                                  <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={subtitleSettings.generate_subtitles}
                                      onChange={(e) =>
                                        setSubtitleSettings((s) => ({ ...s, generate_subtitles: e.target.checked }))
                                      }
                                    />
                                    Generate captions with AI
                                  </label>
                                ) : null}
                                {subtitleSettings.subtitle_source === "transcription" ? (
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
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </details>
                        <Button variant="secondary" onClick={handleGenerate} disabled={loading || !concept.trim()} className="w-full">
                          {loading ? "Generating…" : mode === "video_production" ? "Generate scene plan" : "Generate script"}
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
                            placeholder="Optional override, e.g. Make it sound more dramatic."
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
                          {aiTarget === "scene" && !selectedSceneKey ? (
                            <p className="text-xs text-muted-foreground">Select a scene in the outline first.</p>
                          ) : null}
                        </div>
                        <Button variant="outline" onClick={handleApplyAi} disabled={aiLoading} className="w-full gap-2">
                          {aiLoading ? "Applying…" : "Apply AI helper"}
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => void analyzeSelectedScript()} disabled={qualityLoading} className="gap-2">
                            {qualityLoading ? "Analyzing…" : "Analyze script"}
                          </Button>
                          <Button variant="outline" onClick={() => void improveSelectedScript()} disabled={qualityImproving} className="gap-2">
                            {qualityImproving ? "Improving…" : "Improve script"}
                          </Button>
                        </div>
                        {scriptQuality ? (
                          <div className="rounded-xl border border-border/50 bg-background/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Script quality
                              </div>
                              <Badge variant={scriptQuality.score >= 75 ? "success" : scriptQuality.score >= 55 ? "warning" : "error"}>
                                {scriptQuality.score}/100
                              </Badge>
                            </div>
                            <div className="mt-3">
                              <LinearProgress value={scriptQuality.score} className="h-2" />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg border border-border/40 px-2.5 py-2">
                                <div className="text-muted-foreground">Hook</div>
                                <div className="mt-1 font-semibold text-foreground">{scriptQuality.hook_strength}/100</div>
                              </div>
                              <div className="rounded-lg border border-border/40 px-2.5 py-2">
                                <div className="text-muted-foreground">Pacing</div>
                                <div className="mt-1 font-semibold text-foreground">{scriptQuality.pacing_score}/100</div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {scriptQuality.repetition_detected ? (
                                <Badge variant="warning">Recent repetition</Badge>
                              ) : (
                                <Badge variant="success">No repetition</Badge>
                              )}
                              {scriptQuality.tts_issues.length > 0 ? (
                                <Badge variant="warning">TTS cleanup needed</Badge>
                              ) : (
                                <Badge variant="success">TTS ready</Badge>
                              )}
                            </div>
                            {scriptQuality.suggestions.length > 0 ? (
                              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                                {scriptQuality.suggestions.slice(0, 3).map((suggestion) => (
                                  <p key={suggestion}>{suggestion}</p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
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
          </>
        )}
      >
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{outlineHeader}</CardTitle>
            <CardDescription className="text-xs">
              Jump between scenes and keep context visible while editing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              value={outlineFilter}
              onChange={(event) => setOutlineFilter(event.target.value)}
              placeholder="Filter scenes"
              className="border-border/60"
            />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredOutlineItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectOutline(item.id)}
                  className={cn(
                    "rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors",
                    selectedSceneKey === item.id && "border-primary/40 bg-primary/5",
                  )}
                >
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.meta}</p>
                </button>
              ))}
              {filteredOutlineItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">
                  No matching scenes.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {mode === "video_production" ? "Scene plan editor" : "Script editor"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {mode === "video_production"
                      ? "Edit narration and image prompts for each scene before sending to a project."
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
                            max={100}
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
                          Generate scene plans to start editing here.
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
        <CreationActionBar
          primaryLabel={primaryFlowLabel}
          onPrimaryClick={handleTakeToVideo}
          primaryLoading={takingToVideo}
          primaryLoadingLabel="Sending…"
          primaryDisabled={!hasDraftContent}
          secondaryActions={(
            <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
              Search & Replace
            </Button>
          )}
          helperText={hasStructuredScenes
            ? "Scenes are ready. Continue to Studio for assets, arrangement, and export."
            : "No scene plan yet. Continue in Generate with your current draft."
          }
        />
      </CreationPageShell>

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
    </TooltipProvider>
  );
}
