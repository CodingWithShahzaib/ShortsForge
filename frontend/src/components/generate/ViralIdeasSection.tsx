"use client";

import { memo, useCallback, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
];

type Props = {
  setContentSource: (s: ContentSource) => void;
  setSectionsOpen: React.Dispatch<
    React.SetStateAction<{ content: boolean; visuals: boolean; audio: boolean; review: boolean }>
  >;
  validResolutionIds: string[];
  validTransitionIds: string[];
};

export const ViralIdeasSection = memo(function ViralIdeasSection({
  setContentSource,
  setSectionsOpen,
  validResolutionIds,
  validTransitionIds,
}: Props) {
  const { setValue } = useFormContext<GenerateFormValues>();
  const llmProvider = useWatch({ name: "llm_provider" });
  const llmModel = useWatch({ name: "llm_model" });

  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<
    {
      id: string;
      title: string;
      hook: string;
      angle: string;
      suggested_concept: string;
      settings: Record<string, unknown>;
    }[]
  >([]);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.fetchViralIdeas({
        niche: niche.trim() || undefined,
        count: 8,
        llm_provider: llmProvider,
        llm_model: llmModel ?? undefined,
      });
      setIdeas(res.ideas);
      if (!res.ideas.length) {
        notify.message("No ideas returned — try again.");
      } else {
        notify.success(`Loaded ${res.ideas.length} ideas`);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? String(err.message) : err instanceof Error ? err.message : "Request failed";
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  }, [llmProvider, llmModel, niche]);

  const applyIdea = useCallback(
    (idea: (typeof ideas)[number]) => {
      setContentSource("concept");
      setValue("title", idea.suggested_concept || idea.title, { shouldDirty: true, shouldValidate: true });
      setValue("custom_script", "", { shouldDirty: true });

      const patch = idea.settings || {};
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
        } else if (typeof v === "string") {
          setValue(key, v as never, { shouldDirty: true, shouldValidate: true });
        }
      }

      setSectionsOpen({ content: true, visuals: true, audio: true, review: true });
      notify.success("Idea applied — review Content, Visuals, and Audio, then start.");
      requestAnimationFrame(() => {
        const el = document.getElementById("gen-title");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [setContentSource, setSectionsOpen, setValue, validResolutionIds, validTransitionIds]
  );

  return (
    <Card
      size="2"
      className="section-neon section-neon--violet w-full min-w-0 border-violet-500/20 bg-linear-to-br from-violet-950/40 via-background to-cyan-950/20 dark:from-violet-950/30"
    >
      <CardContent className="space-y-3 p-3 sm:p-3.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <TrendingUp className="h-4 w-4 text-violet-400" aria-hidden />
            Trending idea starter
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed sm:text-sm">
            AI suggests angles that may perform well for shorts. Pick a card to fill your concept
            and tune video settings. These are AI suggestions, not live trend data, so verify facts before publishing.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <Input
            placeholder="Optional focus (e.g. fitness, AI, history)"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="h-8 w-full min-w-0 text-sm sm:flex-1"
            disabled={loading}
            aria-label="Optional niche or topic focus"
          />
          <Button
            type="button"
            variant="animated"
            onClick={loadIdeas}
            disabled={loading}
            className="h-8 w-full shrink-0 gap-1.5 px-3 text-sm sm:w-auto sm:min-w-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {ideas.length ? "Refresh ideas" : "Find ideas"}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-violet-400">
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span className="viral-idea-status-text">
                Brainstorming ideas{niche.trim() ? ` about ${niche.trim()}` : ""}…
              </span>
            </div>
            <ViralIdeasGridSkeleton cards={8} />
          </div>
        ) : ideas.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ideas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => applyIdea(idea)}
                className="text-left rounded-lg border border-border/80 bg-card/80 p-3 transition-colors hover:border-violet-500/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
              >
                <div className="mb-1.5 flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
                  <span className="font-medium text-sm leading-snug line-clamp-2">{idea.title}</span>
                </div>
                {idea.hook ? <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{idea.hook}</p> : null}
                {idea.angle ? <p className="text-[11px] text-muted-foreground/90 line-clamp-3">{idea.angle}</p> : null}
                <span className="mt-2 inline-block text-[11px] font-medium text-violet-600 dark:text-violet-300">
                  Use this idea →
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            Click Find ideas to load AI-suggested topics and settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
