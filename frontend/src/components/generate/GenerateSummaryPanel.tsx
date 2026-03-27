"use client";

import { memo } from "react";
import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { GenerateFormValues } from "@/app/generate/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  control: Control<GenerateFormValues>;
  variant?: "default" | "banner" | "strip";
};

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-xs font-medium tabular-nums text-foreground">{v}</span>
    </div>
  );
}

export const GenerateSummaryPanel = memo(function GenerateSummaryPanel({ control, variant = "default" }: Props) {
  const resolution = useWatch({ control, name: "resolution" });
  const scene_count = useWatch({ control, name: "scene_count" });
  const scene_duration = useWatch({ control, name: "scene_duration" });
  const image_provider = useWatch({ control, name: "image_provider" });
  const tts_provider = useWatch({ control, name: "tts_provider" });
  const subtitle_enabled = useWatch({ control, name: "subtitle_enabled" });

  const totalDuration = Math.max(1, Math.round(scene_count * scene_duration));
  const estRuntimeMin = Math.max(1, Math.round(totalDuration / 20));
  const riskyCombo = scene_count >= 10 && scene_duration >= 6;

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

  if (variant === "strip") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{resolution}</Chip>
          <Chip>
            {scene_count} scenes × {scene_duration}s
          </Chip>
          <Chip>~{totalDuration}s video</Chip>
          <Chip>~{estRuntimeMin} min render</Chip>
          <Chip className="max-w-44 truncate sm:max-w-none" title={String(image_provider)}>
            {image_provider}
          </Chip>
          <Chip>{tts_provider}</Chip>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
          {riskyCombo ? <Badge variant="destructive">High runtime risk</Badge> : null}
          {!subtitle_enabled ? <Badge variant="outline">Subtitles off</Badge> : null}
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
          <Stat k="Scenes" v={scene_count} />
          <Stat k="Scene duration" v={`${scene_duration}s`} />
          <Stat k="~Video length" v={`~${totalDuration}s`} />
          <Stat k="~Gen time" v={`~${estRuntimeMin} min`} />
          <Stat k="Image" v={image_provider} />
          <Stat k="TTS" v={tts_provider} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {riskyCombo ? <Badge variant="destructive">High runtime risk</Badge> : null}
          {!subtitle_enabled ? <Badge variant="outline">Subtitles off</Badge> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm space-y-2 text-slate-500 dark:text-slate-400">
      <div className="flex justify-between">
        <span>Resolution</span>
        <span className="text-slate-900 dark:text-slate-100">{resolution}</span>
      </div>
      <div className="flex justify-between">
        <span>Scenes</span>
        <span className="text-slate-900 dark:text-slate-100">{scene_count}</span>
      </div>
      <div className="flex justify-between">
        <span>Scene Duration</span>
        <span className="text-slate-900 dark:text-slate-100">{scene_duration}s</span>
      </div>
      <div className="flex justify-between">
        <span>Image Provider</span>
        <span className="text-slate-900 dark:text-slate-100">{image_provider}</span>
      </div>
      <div className="flex justify-between">
        <span>TTS</span>
        <span className="text-slate-900 dark:text-slate-100">{tts_provider}</span>
      </div>
      <div className="flex justify-between">
        <span>Estimated video length</span>
        <span className="text-slate-900 dark:text-slate-100">~{totalDuration}s</span>
      </div>
      <div className="flex justify-between">
        <span>Estimated generation time</span>
        <span className="text-slate-900 dark:text-slate-100">~{estRuntimeMin} min</span>
      </div>

      <div className="pt-1 flex flex-wrap gap-1.5">
        {riskyCombo ? <Badge variant="destructive">High runtime risk</Badge> : null}
        {!subtitle_enabled ? <Badge variant="outline">Subtitles disabled</Badge> : null}
      </div>
    </div>
  );
});
