"use client";

import { memo } from "react";
import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { GenerateFormValues } from "@/app/generate/schema";

type Props = { control: Control<GenerateFormValues> };

export const GenerateSummaryPanel = memo(function GenerateSummaryPanel({ control }: Props) {
  const resolution = useWatch({ control, name: "resolution" });
  const scene_count = useWatch({ control, name: "scene_count" });
  const scene_duration = useWatch({ control, name: "scene_duration" });
  const image_provider = useWatch({ control, name: "image_provider" });
  const tts_provider = useWatch({ control, name: "tts_provider" });

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
    </div>
  );
});
