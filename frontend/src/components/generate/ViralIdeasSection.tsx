"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ViralIdeasGridSkeleton } from "@/components/ui/content-skeletons";
import { api, ApiError } from "@/lib/api";
import type { GenerateFormValues } from "@/app/generate/schema";
import type { ContentSource } from "@/components/generate/ContentSourceTabs";

const APPLY_KEYS: (keyof GenerateFormValues)[] = [
  "story_type",
  "story_template",
  "scene_count",
  "dynamic_scenes",
  "word_count",
  "scene_narration_style",
  "scene_duration",
  "image_style",
  "resolution",
  "transition",
  "use_production_storyboard",
  "match_scenes_to_audio",
  "visual_continuity",
  "generation_mode",
  "dialogue_style_preset",
  "default_shot_type",
];

const SUGGESTED_NICHES = ["fitness", "AI", "history", "crime", "finance", "movies"] as const;
const IDEA_TYPE_OPTIONS = [
  { value: "any", label: "Any mix" },
  { value: "faceless", label: "Faceless only" },
  { value: "dialogue", label: "Dialogue only" },
] as const;
const TONE_OPTIONS = [
  { value: "any", label: "Any tone" },
  { value: "serious", label: "Serious" },
  { value: "funny", label: "Funny" },
  { value: "dark", label: "Dark" },
  { value: "inspirational", label: "Inspirational" },
  { value: "educational", label: "Educational" },
  { value: "dramatic", label: "Dramatic" },
] as const;
const HOOK_STYLE_OPTIONS = [
  { value: "any", label: "Any hook" },
  { value: "question", label: "Question" },
  { value: "bold_claim", label: "Bold claim" },
  { value: "shocking_fact", label: "Shocking fact" },
  { value: "story_setup", label: "Story setup" },
  { value: "countdown", label: "Countdown" },
  { value: "debate", label: "Debate" },
] as const;
const VIRALITY_ANGLE_OPTIONS = [
  { value: "any", label: "Any angle" },
  { value: "curiosity_gap", label: "Curiosity gap" },
  { value: "controversy", label: "Controversy" },
  { value: "relatability", label: "Relatability" },
  { value: "fear", label: "Fear / warning" },
  { value: "awe", label: "Awe" },
  { value: "humor", label: "Humor" },
] as const;
const DURATION_OPTIONS = [
  { value: "any", label: "Any runtime" },
  { value: "15", label: "Around 15s" },
  { value: "30", label: "Around 30s" },
  { value: "45", label: "Around 45s" },
  { value: "60", label: "Around 60s" },
] as const;
const CHARACTER_MODE_OPTIONS = [
  { value: "off", label: "No characters" },
  { value: "optional", label: "Characters optional" },
  { value: "required", label: "Characters required" },
] as const;
const CAST_SIZE_OPTIONS = [
  { value: "any", label: "Any cast size" },
  { value: "2", label: "2 characters" },
  { value: "3", label: "3 characters" },
  { value: "4", label: "4 characters" },
] as const;
const IDEA_COUNT_OPTIONS = [
  { value: "4", label: "4 ideas" },
  { value: "8", label: "8 ideas" },
  { value: "12", label: "12 ideas" },
] as const;

export type ViralIdeasIdeaCard = {
  id: string;
  title: string;
  hook: string;
  angle: string;
  suggested_concept: string;
  settings: Record<string, unknown>;
};

export type ViralIdeasTemplateState = {
  niche: string;
  ideaType: (typeof IDEA_TYPE_OPTIONS)[number]["value"];
  tone: (typeof TONE_OPTIONS)[number]["value"];
  hookStyle: (typeof HOOK_STYLE_OPTIONS)[number]["value"];
  viralityAngle: (typeof VIRALITY_ANGLE_OPTIONS)[number]["value"];
  durationTarget: (typeof DURATION_OPTIONS)[number]["value"];
  characterMode: (typeof CHARACTER_MODE_OPTIONS)[number]["value"];
  castSize: (typeof CAST_SIZE_OPTIONS)[number]["value"];
  ideaCount: (typeof IDEA_COUNT_OPTIONS)[number]["value"];
  avoidTopics: string;
  ideas: ViralIdeasIdeaCard[];
};

const DEFAULT_TEMPLATE_STATE: ViralIdeasTemplateState = {
  niche: "",
  ideaType: "any",
  tone: "any",
  hookStyle: "any",
  viralityAngle: "any",
  durationTarget: "any",
  characterMode: "optional",
  castSize: "any",
  ideaCount: "8",
  avoidTopics: "",
  ideas: [],
};

function isIdeaType(value: unknown): value is ViralIdeasTemplateState["ideaType"] {
  return IDEA_TYPE_OPTIONS.some((option) => option.value === value);
}

function isTone(value: unknown): value is ViralIdeasTemplateState["tone"] {
  return TONE_OPTIONS.some((option) => option.value === value);
}

function isHookStyle(value: unknown): value is ViralIdeasTemplateState["hookStyle"] {
  return HOOK_STYLE_OPTIONS.some((option) => option.value === value);
}

function isViralityAngle(value: unknown): value is ViralIdeasTemplateState["viralityAngle"] {
  return VIRALITY_ANGLE_OPTIONS.some((option) => option.value === value);
}

function isDurationTarget(value: unknown): value is ViralIdeasTemplateState["durationTarget"] {
  return DURATION_OPTIONS.some((option) => option.value === value);
}

function isCharacterMode(value: unknown): value is ViralIdeasTemplateState["characterMode"] {
  return CHARACTER_MODE_OPTIONS.some((option) => option.value === value);
}

function isCastSize(value: unknown): value is ViralIdeasTemplateState["castSize"] {
  return CAST_SIZE_OPTIONS.some((option) => option.value === value);
}

function isIdeaCount(value: unknown): value is ViralIdeasTemplateState["ideaCount"] {
  return IDEA_COUNT_OPTIONS.some((option) => option.value === value);
}

function normalizeIdea(raw: unknown): ViralIdeasIdeaCard | null {
  if (!raw || typeof raw !== "object") return null;
  const idea = raw as Record<string, unknown>;
  if (typeof idea.id !== "string" || typeof idea.title !== "string") return null;
  return {
    id: idea.id,
    title: idea.title,
    hook: typeof idea.hook === "string" ? idea.hook : "",
    angle: typeof idea.angle === "string" ? idea.angle : "",
    suggested_concept: typeof idea.suggested_concept === "string" ? idea.suggested_concept : "",
    settings: idea.settings && typeof idea.settings === "object" ? (idea.settings as Record<string, unknown>) : {},
  };
}

function normalizeTemplateState(raw: unknown): ViralIdeasTemplateState {
  if (!raw || typeof raw !== "object") return DEFAULT_TEMPLATE_STATE;
  const state = raw as Record<string, unknown>;
  return {
    niche: typeof state.niche === "string" ? state.niche : DEFAULT_TEMPLATE_STATE.niche,
    ideaType: isIdeaType(state.ideaType) ? state.ideaType : DEFAULT_TEMPLATE_STATE.ideaType,
    tone: isTone(state.tone) ? state.tone : DEFAULT_TEMPLATE_STATE.tone,
    hookStyle: isHookStyle(state.hookStyle) ? state.hookStyle : DEFAULT_TEMPLATE_STATE.hookStyle,
    viralityAngle: isViralityAngle(state.viralityAngle) ? state.viralityAngle : DEFAULT_TEMPLATE_STATE.viralityAngle,
    durationTarget: isDurationTarget(state.durationTarget) ? state.durationTarget : DEFAULT_TEMPLATE_STATE.durationTarget,
    characterMode: isCharacterMode(state.characterMode) ? state.characterMode : DEFAULT_TEMPLATE_STATE.characterMode,
    castSize: isCastSize(state.castSize) ? state.castSize : DEFAULT_TEMPLATE_STATE.castSize,
    ideaCount: isIdeaCount(state.ideaCount) ? state.ideaCount : DEFAULT_TEMPLATE_STATE.ideaCount,
    avoidTopics: typeof state.avoidTopics === "string" ? state.avoidTopics : DEFAULT_TEMPLATE_STATE.avoidTopics,
    ideas: Array.isArray(state.ideas) ? state.ideas.map(normalizeIdea).filter((idea): idea is ViralIdeasIdeaCard => idea !== null) : [],
  };
}

type Props = {
  setContentSource: (s: ContentSource) => void;
  setSectionsOpen?: React.Dispatch<
    React.SetStateAction<{ templates: boolean; content: boolean; dialogue: boolean; visuals: boolean; audio: boolean; review: boolean }>
  >;
  validResolutionIds: string[];
  validTransitionIds: string[];
  embedded?: boolean;
  savedState?: unknown;
  refreshToken?: number;
  onStateChange?: (state: ViralIdeasTemplateState) => void;
};

export const ViralIdeasSection = memo(function ViralIdeasSection({
  setContentSource,
  setSectionsOpen,
  validResolutionIds,
  validTransitionIds,
  embedded = false,
  savedState,
  refreshToken = 0,
  onStateChange,
}: Props) {
  const { setValue } = useFormContext<GenerateFormValues>();
  const llmProvider = useWatch({ name: "llm_provider" });
  const llmModel = useWatch({ name: "llm_model" });
  const normalizedSavedState = useMemo(() => normalizeTemplateState(savedState), [savedState]);

  const [niche, setNiche] = useState(normalizedSavedState.niche);
  const [ideaType, setIdeaType] = useState<ViralIdeasTemplateState["ideaType"]>(normalizedSavedState.ideaType);
  const [tone, setTone] = useState<ViralIdeasTemplateState["tone"]>(normalizedSavedState.tone);
  const [hookStyle, setHookStyle] = useState<ViralIdeasTemplateState["hookStyle"]>(normalizedSavedState.hookStyle);
  const [viralityAngle, setViralityAngle] = useState<ViralIdeasTemplateState["viralityAngle"]>(normalizedSavedState.viralityAngle);
  const [durationTarget, setDurationTarget] = useState<ViralIdeasTemplateState["durationTarget"]>(normalizedSavedState.durationTarget);
  const [characterMode, setCharacterMode] = useState<ViralIdeasTemplateState["characterMode"]>(normalizedSavedState.characterMode);
  const [castSize, setCastSize] = useState<ViralIdeasTemplateState["castSize"]>(normalizedSavedState.castSize);
  const [ideaCount, setIdeaCount] = useState<ViralIdeasTemplateState["ideaCount"]>(normalizedSavedState.ideaCount);
  const [avoidTopics, setAvoidTopics] = useState(normalizedSavedState.avoidTopics);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [ideas, setIdeas] = useState<ViralIdeasIdeaCard[]>(normalizedSavedState.ideas);

  const loadIdeas = useCallback(async (override?: Partial<ViralIdeasTemplateState>) => {
    const requestState = {
      niche,
      ideaCount,
      ideaType,
      tone,
      hookStyle,
      viralityAngle,
      durationTarget,
      characterMode,
      castSize,
      avoidTopics,
      ...override,
    };
    setLoading(true);
    setLoadingMessage("Starting idea search...");
    setIdeas([]);
    try {
      const collected: ViralIdeasIdeaCard[] = [];
      await api.fetchViralIdeasStream({
        niche: requestState.niche.trim() || undefined,
        count: Number(requestState.ideaCount),
        llm_provider: llmProvider,
        llm_model: llmModel ?? undefined,
        idea_type: requestState.ideaType,
        tone: requestState.tone,
        hook_style: requestState.hookStyle,
        virality_angle: requestState.viralityAngle,
        duration_target_seconds: requestState.durationTarget === "any" ? undefined : Number(requestState.durationTarget),
        character_mode: requestState.characterMode,
        cast_size: requestState.castSize === "any" ? undefined : Number(requestState.castSize),
        avoid_topics: requestState.avoidTopics.trim() || undefined,
      }, (event) => {
        const type = typeof event.type === "string" ? event.type : "";
        if (type === "status") {
          setLoadingMessage(typeof event.message === "string" ? event.message : "Finding ideas...");
          return;
        }
        if (type === "idea" && event.idea && typeof event.idea === "object") {
          const idea = event.idea as ViralIdeasIdeaCard;
          collected.push(idea);
          setIdeas([...collected]);
          setLoadingMessage(`Loaded ${collected.length} idea${collected.length === 1 ? "" : "s"} so far...`);
          return;
        }
        if (type === "error") {
          throw new Error(typeof event.message === "string" ? event.message : "Idea stream failed");
        }
      });
      if (!collected.length) {
        notify.message("No ideas returned — try again.");
      } else {
        notify.success(`Loaded ${collected.length} ideas`);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? String(err.message) : err instanceof Error ? err.message : "Request failed";
      notify.error(msg);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [
    llmProvider,
    llmModel,
    niche,
    ideaCount,
    ideaType,
    tone,
    hookStyle,
    viralityAngle,
    durationTarget,
    characterMode,
    castSize,
    avoidTopics,
  ]);

  useEffect(() => {
    setNiche(normalizedSavedState.niche);
    setIdeaType(normalizedSavedState.ideaType);
    setTone(normalizedSavedState.tone);
    setHookStyle(normalizedSavedState.hookStyle);
    setViralityAngle(normalizedSavedState.viralityAngle);
    setDurationTarget(normalizedSavedState.durationTarget);
    setCharacterMode(normalizedSavedState.characterMode);
    setCastSize(normalizedSavedState.castSize);
    setIdeaCount(normalizedSavedState.ideaCount);
    setAvoidTopics(normalizedSavedState.avoidTopics);
    setIdeas(normalizedSavedState.ideas);
  }, [normalizedSavedState]);

  useEffect(() => {
    onStateChange?.({
      niche,
      ideaType,
      tone,
      hookStyle,
      viralityAngle,
      durationTarget,
      characterMode,
      castSize,
      ideaCount,
      avoidTopics,
      ideas,
    });
  }, [avoidTopics, castSize, characterMode, durationTarget, hookStyle, ideaCount, ideaType, ideas, niche, onStateChange, tone, viralityAngle]);

  useEffect(() => {
    if (refreshToken <= 0) return;
    void loadIdeas(normalizedSavedState);
  }, [loadIdeas, normalizedSavedState, refreshToken]);

  const applyIdea = useCallback(
    (idea: (typeof ideas)[number]) => {
      setContentSource("concept");
      setValue("title", idea.suggested_concept || idea.title, { shouldDirty: true, shouldValidate: true });
      setValue("custom_script", "", { shouldDirty: true });

      const patch = idea.settings || {};
      const generationMode = patch.generation_mode === "dialogue" ? "dialogue" : "standard";
      const starterScript = typeof patch.starter_script === "string" ? patch.starter_script.trim() : "";
      const dialogueCharacters = Array.isArray(patch.dialogue_characters) ? patch.dialogue_characters : [];

      if (generationMode === "dialogue") {
        setContentSource(starterScript ? "script" : "concept");
        if (starterScript) {
          setValue("custom_script", starterScript, { shouldDirty: true, shouldValidate: true });
        }
      }

      const resOk = new Set(validResolutionIds);
      const trOk = new Set(validTransitionIds);
      for (const key of APPLY_KEYS) {
        if (!(key in patch) || patch[key] === undefined || patch[key] === null) continue;
        const v = patch[key];
        if (key === "resolution") {
          const id = String(v);
          if (resOk.has(id)) setValue("resolution", id, { shouldDirty: true, shouldValidate: true });
          continue;
        }
        if (key === "transition") {
          const id = String(v);
          if (trOk.has(id)) setValue("transition", id, { shouldDirty: true, shouldValidate: true });
          continue;
        }
        if (key === "scene_count" || key === "word_count") {
          const n = Number(v);
          if (!Number.isNaN(n)) setValue(key, n, { shouldDirty: true, shouldValidate: true });
        } else if (key === "scene_duration") {
          const n = Number(v);
          if (!Number.isNaN(n)) setValue(key, n, { shouldDirty: true, shouldValidate: true });
        } else if (
          key === "dynamic_scenes" ||
          key === "use_production_storyboard" ||
          key === "match_scenes_to_audio"
        ) {
          setValue(key, Boolean(v), { shouldDirty: true, shouldValidate: true });
        } else if (key === "generation_mode") {
          setValue("generation_mode", generationMode, { shouldDirty: true, shouldValidate: true });
        } else if (typeof v === "string") {
          setValue(key, v as never, { shouldDirty: true, shouldValidate: true });
        }
      }

      if ("character_consistency_enabled" in patch) {
        setValue("character_consistency_enabled", Boolean(patch.character_consistency_enabled), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if ("speaker_labels_in_subtitles" in patch) {
        setValue("speaker_labels_in_subtitles", Boolean(patch.speaker_labels_in_subtitles), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (dialogueCharacters.length > 0) {
        setValue("dialogue_characters", dialogueCharacters as GenerateFormValues["dialogue_characters"], {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      setSectionsOpen?.({
        templates: false,
        content: true,
        dialogue: true,
        visuals: true,
        audio: true,
        review: true,
      });
      notify.success(
        generationMode === "dialogue"
          ? "Idea applied with starter characters and dialogue settings."
          : "Idea applied — review Content, Visuals, and Audio, then start."
      );
      requestAnimationFrame(() => {
        const el = document.getElementById(generationMode === "dialogue" ? "gen-dialogue-controls" : "gen-title");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [setContentSource, setSectionsOpen, setValue, validResolutionIds, validTransitionIds]
  );

  const content = (
    <div className="space-y-3">
      {!embedded ? (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <TrendingUp className="h-4 w-4 text-violet-400" aria-hidden />
            Trending idea starter
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            AI suggests angles that may perform well for shorts. Pick a card to fill your concept
            and tune video settings. These are AI suggestions, not live trend data, so verify facts before publishing.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <Input
          placeholder="Optional focus or detailed brief (e.g. niche, tone, visual style, pacing)"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="h-9 w-full min-w-0 text-sm sm:flex-1"
          disabled={loading}
          aria-label="Optional niche, topic, or detailed creative brief"
        />
        <Button
          type="button"
          variant="animated"
          onClick={() => void loadIdeas()}
          disabled={loading}
          className="h-9 w-full shrink-0 gap-1.5 px-3 text-sm sm:w-auto sm:min-w-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {ideas.length ? "Refresh ideas" : "Find ideas"}
        </Button>
      </div>

      <div className="rounded-xl bg-background/35 p-3 ring-1 ring-border/25">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Idea strategy</p>
            <p className="text-xs text-muted-foreground">
              Guide the generator toward the format, tone, hooks, and character setup you want.
            </p>
          </div>
          <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border/25">
            {ideaCount} ideas
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field id="idea-feed-idea-type" label="Idea type">
            <Select value={ideaType} onValueChange={(value) => setIdeaType(value as typeof ideaType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select idea type" />
              </SelectTrigger>
              <SelectContent>
                {IDEA_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-tone" label="Tone">
            <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
              <SelectTrigger>
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-hook-style" label="Hook style">
            <Select value={hookStyle} onValueChange={(value) => setHookStyle(value as typeof hookStyle)}>
              <SelectTrigger>
                <SelectValue placeholder="Select hook style" />
              </SelectTrigger>
              <SelectContent>
                {HOOK_STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-virality-angle" label="Virality angle">
            <Select value={viralityAngle} onValueChange={(value) => setViralityAngle(value as typeof viralityAngle)}>
              <SelectTrigger>
                <SelectValue placeholder="Select angle" />
              </SelectTrigger>
              <SelectContent>
                {VIRALITY_ANGLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-duration" label="Duration target">
            <Select value={durationTarget} onValueChange={(value) => setDurationTarget(value as typeof durationTarget)}>
              <SelectTrigger>
                <SelectValue placeholder="Select runtime" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-character-mode" label="Character mode">
            <Select value={characterMode} onValueChange={(value) => setCharacterMode(value as typeof characterMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Select character mode" />
              </SelectTrigger>
              <SelectContent>
                {CHARACTER_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-cast-size" label="Cast size">
            <Select value={castSize} onValueChange={(value) => setCastSize(value as typeof castSize)}>
              <SelectTrigger>
                <SelectValue placeholder="Select cast size" />
              </SelectTrigger>
              <SelectContent>
                {CAST_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="idea-feed-count" label="Results">
            <Select value={ideaCount} onValueChange={(value) => setIdeaCount(value as typeof ideaCount)}>
              <SelectTrigger>
                <SelectValue placeholder="Select result count" />
              </SelectTrigger>
              <SelectContent>
                {IDEA_COUNT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Field
            id="idea-feed-avoid-topics"
            label="Avoid topics"
            hint="Optional blacklist like crypto, celebrity gossip, politics, or medical claims."
          >
            <Input
              value={avoidTopics}
              onChange={(event) => setAvoidTopics(event.target.value)}
              placeholder="Topics or angles to avoid"
              disabled={loading}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setIdeaType("any");
              setTone("any");
              setHookStyle("any");
              setViralityAngle("any");
              setDurationTarget("any");
              setCharacterMode("optional");
              setCastSize("any");
              setIdeaCount("8");
              setAvoidTopics("");
            }}
            disabled={loading}
            className="md:mb-0.5"
          >
            Reset filters
          </Button>
        </div>
      </div>

        {loading && ideas.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-violet-400">
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span className="viral-idea-status-text">
                {loadingMessage || `Brainstorming ideas${niche.trim() ? ` about ${niche.trim()}` : ""}…`}
              </span>
            </div>
            <ViralIdeasGridSkeleton cards={8} />
          </div>
        ) : ideas.length > 0 ? (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-violet-400">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span className="viral-idea-status-text">{loadingMessage || "Finding more ideas..."}</span>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {ideas.map((idea) => (
              (() => {
                const ideaSettings = idea.settings || {};
                const isDialogueIdea = ideaSettings.generation_mode === "dialogue";
                const hasDialogueCharacters = Array.isArray(ideaSettings.dialogue_characters)
                  && ideaSettings.dialogue_characters.length > 0;
                const hasStarterScript = typeof ideaSettings.starter_script === "string"
                  && ideaSettings.starter_script.trim().length > 0;

                return (
              <button
                key={idea.id}
                type="button"
                onClick={() => applyIdea(idea)}
                className="text-left rounded-xl bg-background/45 p-3 ring-1 ring-border/25 transition-colors hover:bg-accent/50 hover:ring-violet-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
              >
                <div className="mb-1.5 flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
                  <span className="font-medium text-sm leading-snug line-clamp-2">{idea.title}</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ${
                      isDialogueIdea
                        ? "bg-violet-500/10 text-violet-200 ring-violet-500/30"
                        : "bg-cyan-500/10 text-cyan-200 ring-cyan-500/30"
                    }`}
                  >
                    {isDialogueIdea ? "Dialogue idea" : "Faceless story"}
                  </span>
                  {hasDialogueCharacters ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200 ring-1 ring-emerald-500/30">
                      Cast included
                    </span>
                  ) : null}
                  {hasStarterScript ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200 ring-1 ring-amber-500/30">
                      Script starter
                    </span>
                  ) : null}
                </div>
                {idea.hook ? <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{idea.hook}</p> : null}
                {idea.angle ? <p className="text-[11px] text-muted-foreground/90 line-clamp-3">{idea.angle}</p> : null}
                <span className="mt-2 inline-block text-[11px] font-medium text-violet-600 dark:text-violet-300">
                  Use this idea →
                </span>
              </button>
                );
              })()
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-background/35 px-4 py-5 ring-1 ring-border/25">
            <p className="text-sm font-medium text-foreground">No ideas loaded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Search a niche or use one of the quick prompts below to generate story starters with tuned defaults.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_NICHES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNiche(suggestion)}
                  className="rounded-full bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/25 transition-colors hover:bg-accent/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card
      size="2"
      className="section-neon section-neon--violet w-full min-w-0 border-violet-500/20 bg-linear-to-br from-violet-950/40 via-background to-cyan-950/20 dark:from-violet-950/30"
    >
      <CardContent className="space-y-3 p-3 sm:p-3.5">{content}</CardContent>
    </Card>
  );
});
