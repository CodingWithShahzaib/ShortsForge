"use client";

import { memo } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { GenerateFormValues } from "@/app/generate/schema";

type Props = {
  resolutionIds: string[];
};

export const GeneratePresetsBar = memo(function GeneratePresetsBar({ resolutionIds }: Props) {
  const { setValue, getValues } = useFormContext<GenerateFormValues>();

  const pickRes = (prefer: "lighter" | "heavier") => {
    const ids = resolutionIds.length ? resolutionIds : ["1080x1920", "720x1280"];
    if (prefer === "lighter") {
      return ids.find((id) => id.includes("720")) || ids[0];
    }
    return ids.find((id) => id.includes("1080")) || ids[ids.length - 1];
  };

  const applyFastDraft = () => {
    setValue("resolution", pickRes("lighter"), { shouldDirty: true });
    setValue("scene_count", 4, { shouldDirty: true });
    setValue("word_count", 280, { shouldDirty: true });
    setValue("scene_duration", 4, { shouldDirty: true });
    toast.message("Applied fast draft preset");
  };

  const applyHighQuality = () => {
    setValue("resolution", pickRes("heavier"), { shouldDirty: true });
    setValue("scene_count", 8, { shouldDirty: true });
    setValue("word_count", 520, { shouldDirty: true });
    setValue("scene_duration", 5.5, { shouldDirty: true });
    toast.message("Applied high quality preset");
  };

  const saveTemplate = () => {
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    const raw = localStorage.getItem("shortsforge-generate-templates");
    const list: { name: string; values: GenerateFormValues }[] = raw ? JSON.parse(raw) : [];
    list.push({ name: name.trim(), values: getValues() });
    localStorage.setItem("shortsforge-generate-templates", JSON.stringify(list.slice(-20)));
    toast.success("Template saved locally");
  };

  const loadTemplate = () => {
    const raw = localStorage.getItem("shortsforge-generate-templates");
    const list: { name: string; values: GenerateFormValues }[] = raw ? JSON.parse(raw) : [];
    if (!list.length) {
      toast.message("No saved templates yet");
      return;
    }
    const choice = window.prompt(
      `Templates (comma = pick by number):\n${list.map((t, i) => `${i + 1}. ${t.name}`).join("\n")}\n\nEnter number (1-${list.length}):`
    );
    const n = parseInt(choice || "", 10);
    if (Number.isNaN(n) || n < 1 || n > list.length) return;
    const tpl = list[n - 1];
    Object.keys(tpl.values).forEach((k) => {
      const key = k as keyof GenerateFormValues;
      setValue(key, tpl.values[key], { shouldDirty: true });
    });
    toast.success(`Loaded “${tpl.name}”`);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Presets</span>
      <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={applyFastDraft}>
        Fast draft
      </Button>
      <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={applyHighQuality}>
        High quality
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={saveTemplate}>
        Save template
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={loadTemplate}>
        Load template
      </Button>
    </div>
  );
});
