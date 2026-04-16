"use client";

import { memo } from "react";
import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { GenerateFormValues } from "@/app/generate/schema";
import { Badge } from "@/components/ui/badge";
import { describeProfileSpecificTuning, describeStoryBrief, qualityPostureTone, resolveStoryProfileLabel } from "@/lib/story-quality";
import { cn } from "@/lib/utils";
import { toFriendlyProvider } from "@/lib/user-facing-text";

type Props = {
  control: Control<GenerateFormValues>;
  variant?: "default" | "banner" | "strip";
};

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-background/45 px-3 py-2 ring-1 ring-border/35">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{k}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{v}</span>
    </div>
  );
}

function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center rounded-md border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground sm:text-xs",
        className
      )}
    >
      {children}
    </span>
  );
}

export const GenerateSummaryPanel = memo(function GenerateSummaryPanel({ control, variant = "default" }: Props) {
  const resolution = useWatch({ control, name: "resolution" });
  const generation_mode = useWatch({ control, name: "generation_mode" });
  const story_type = useWatch({ control, name: "story_type" });
  const story_template = useWatch({ control, name: "story_template" });
  const story_brief = useWatch({ control, name: "story_brief" });
  const scene_count = useWatch({ control, name: "scene_count" });
  const dynamic_scenes = useWatch({ control, name: "dynamic_scenes" });
  const scene_duration = useWatch({ control, name: "scene_duration" });
  const scene_narration_style = useWatch({ control, name: "scene_narration_style" });
  const image_provider = useWatch({ control, name: "image_provider" });
  const tts_provider = useWatch({ control, name: "tts_provider" });
  const subtitle_enabled = useWatch({ control, name: "subtitle_enabled" });
  const match_scenes_to_audio = useWatch({ control, name: "match_scenes_to_audio" });
  const use_production_storyboard = useWatch({ control, name: "use_production_storyboard" });
  const dialogue_style_preset = useWatch({ control, name: "dialogue_style_preset" });
  const dialogue_characters = useWatch({ control, name: "dialogue_characters" });
  const pause_between_speakers_ms = useWatch({ control, name: "pause_between_speakers_ms" });
  const generationModeLabel = generation_mode === "dialogue" ? "Dialogue" : "Standard";
  const dialogueStyleLabel =
    typeof dialogue_style_preset === "string" && dialogue_style_preset.trim()
      ? dialogue_style_preset.replace(/_/g, " ")
      : "comic book";

  const totalDuration = Math.max(1, Math.round(scene_count * scene_duration));
  const estRuntimeMin = Math.max(1, Math.round(totalDuration / 20));
  const riskyCombo = !dynamic_scenes && scene_count >= 10 && scene_duration >= 6;
  const characterCount = Array.isArray(dialogue_characters) ? dialogue_characters.length : 0;
  const sceneDisplay = dynamic_scenes ? "AI decides" : scene_count;
  const sceneDurationDisplay = dynamic_scenes ? "Adaptive" : `${scene_duration}s`;
  const totalDurationDisplay = dynamic_scenes ? "Variable" : `~${totalDuration}s`;
  const estRuntimeDisplay = dynamic_scenes ? "Variable" : `~${estRuntimeMin} min`;
  const subtitleSourceLabel = "Audio transcription";
  const dialogueSceneDisplay = `${scene_duration}s base scenes`;
  const dialogueRenderDisplay = match_scenes_to_audio ? "Audio-synced pacing" : "Fixed pacing";
  const dialoguePauseDisplay = `${pause_between_speakers_ms}ms speaker pause`;
  const resolvedProfile = resolveStoryProfileLabel(story_type, story_template);
  const briefSummary = describeStoryBrief(story_brief);
  const postureSummary = qualityPostureTone(story_brief);
  const profileTuning = describeProfileSpecificTuning(story_type, story_brief);

  if (variant === "strip") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{resolution}</Chip>
          <Chip>{generationModeLabel} mode</Chip>
          <Chip>{resolvedProfile}</Chip>
          <Chip>{generation_mode === "dialogue" ? dialogueSceneDisplay : (dynamic_scenes ? `AI scenes × ${scene_duration}s target` : `${scene_count} scenes × ${scene_duration}s`)}</Chip>
          <Chip>{briefSummary}</Chip>
          <Chip>{generation_mode === "dialogue" ? dialogueRenderDisplay : `${scene_narration_style} scene copy`}</Chip>
          <Chip>{generation_mode === "dialogue" ? dialoguePauseDisplay : totalDurationDisplay}</Chip>
          <Chip>{generation_mode === "dialogue" ? subtitleSourceLabel : estRuntimeDisplay}</Chip>
          <Chip className="max-w-44 truncate sm:max-w-none" title={String(image_provider)}>
            {toFriendlyProvider(image_provider)}
          </Chip>
          <Chip>{toFriendlyProvider(tts_provider)}</Chip>
          {generation_mode === "dialogue" ? <Chip>{characterCount} characters</Chip> : null}
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
          {riskyCombo ? <Badge variant="destructive">May take longer</Badge> : null}
          {!subtitle_enabled ? <Badge variant="outline">Subtitles off</Badge> : null}
          {dynamic_scenes ? <Badge variant="outline">AI scene count</Badge> : null}
          {use_production_storyboard ? <Badge variant="outline">Director-style scenes</Badge> : null}
          {match_scenes_to_audio ? <Badge variant="outline">Sync to voice</Badge> : null}
          <Badge variant="outline">{postureSummary}</Badge>
          {profileTuning ? <Badge variant="outline">{profileTuning}</Badge> : null}
          {generation_mode === "dialogue" ? <Badge variant="outline">{dialogueStyleLabel}</Badge> : null}
        </div>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current settings</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat k="Resolution" v={resolution} />
          <Stat k="Mode" v={generationModeLabel} />
          <Stat k="Profile" v={resolvedProfile} />
          <Stat k="Story brief" v={briefSummary} />
          <Stat k="Scenes" v={generation_mode === "dialogue" ? `${characterCount} speakers` : sceneDisplay} />
          <Stat k="Scene duration" v={sceneDurationDisplay} />
          <Stat k={generation_mode === "dialogue" ? "Scene pacing" : "Scene copy"} v={generation_mode === "dialogue" ? dialoguePauseDisplay : scene_narration_style} />
          <Stat k={generation_mode === "dialogue" ? "Caption source" : "~Video length"} v={generation_mode === "dialogue" ? subtitleSourceLabel : totalDurationDisplay} />
          <Stat k={generation_mode === "dialogue" ? "Render rhythm" : "~Gen time"} v={generation_mode === "dialogue" ? dialogueRenderDisplay : estRuntimeDisplay} />
          <Stat k="Image" v={toFriendlyProvider(image_provider)} />
          <Stat k="Voice" v={toFriendlyProvider(tts_provider)} />
          {generation_mode === "dialogue" ? <Stat k="Characters" v={characterCount} /> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {riskyCombo ? <Badge variant="destructive">May take longer</Badge> : null}
          {!subtitle_enabled ? <Badge variant="outline">Subtitles off</Badge> : null}
          {dynamic_scenes ? <Badge variant="outline">AI scene count</Badge> : null}
          {use_production_storyboard ? <Badge variant="outline">Director-style scenes</Badge> : null}
          {match_scenes_to_audio ? <Badge variant="outline">Sync to voice</Badge> : null}
          <Badge variant="outline">{postureSummary}</Badge>
          {profileTuning ? <Badge variant="outline">{profileTuning}</Badge> : null}
          {generation_mode === "dialogue" ? <Badge variant="outline">{dialogueStyleLabel}</Badge> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat k="Resolution" v={resolution} />
        <Stat k="Mode" v={generationModeLabel} />
        <Stat k="Profile" v={resolvedProfile} />
        <Stat k="Story brief" v={briefSummary} />
        <Stat k="Scenes" v={generation_mode === "dialogue" ? `${characterCount} speakers` : sceneDisplay} />
        <Stat k="Duration" v={sceneDurationDisplay} />
        <Stat k={generation_mode === "dialogue" ? "Scene pacing" : "Scene copy"} v={generation_mode === "dialogue" ? dialoguePauseDisplay : scene_narration_style} />
        <Stat k="Image" v={toFriendlyProvider(image_provider)} />
        <Stat k="Voice" v={toFriendlyProvider(tts_provider)} />
        <Stat k={generation_mode === "dialogue" ? "Caption source" : "~Video"} v={generation_mode === "dialogue" ? subtitleSourceLabel : totalDurationDisplay} />
        <Stat k={generation_mode === "dialogue" ? "Render rhythm" : "~Render"} v={generation_mode === "dialogue" ? dialogueRenderDisplay : estRuntimeDisplay} />
        {generation_mode === "dialogue" ? <Stat k="Characters" v={characterCount} /> : null}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
        {riskyCombo ? <Badge variant="destructive">May take longer</Badge> : null}
        {!subtitle_enabled ? <Badge variant="outline">Subtitles disabled</Badge> : null}
        {dynamic_scenes ? <Badge variant="outline">AI scene count</Badge> : null}
        {use_production_storyboard ? <Badge variant="outline">Director-style scenes</Badge> : null}
        {match_scenes_to_audio ? <Badge variant="outline">Sync to voice</Badge> : null}
        <Badge variant="outline">{postureSummary}</Badge>
        {profileTuning ? <Badge variant="outline">{profileTuning}</Badge> : null}
        {generation_mode === "dialogue" ? <Badge variant="outline">{dialogueStyleLabel}</Badge> : null}
      </div>
    </div>
  );
});
