"use client";

import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GenerateFormValues } from "@/app/generate/schema";

type Provider = { name: string; configured: boolean };

type Res = { id: string; name: string };
type Trans = { id: string; name: string };

const IMAGE_STYLES = [
  { value: "realistic", label: "Realistic" },
  { value: "anime", label: "Anime" },
  { value: "3d_render", label: "3D Render" },
  { value: "oil_painting", label: "Oil Painting" },
  { value: "watercolor", label: "Watercolor" },
  { value: "cinematic", label: "Cinematic" },
] as const;

type Props = {
  imageProviders: Provider[];
  resolutions: Res[];
  transitions: Trans[];
  mode?: "standard" | "dialogue";
};

export const VisualsCard = memo(function VisualsCard({
  imageProviders,
  resolutions,
  transitions,
  mode = "standard",
}: Props) {
  const { control } = useFormContext<GenerateFormValues>();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Render stack
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Image provider</label>
            <Controller
              control={control}
              name="image_provider"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {imageProviders
                      .filter((p) => p.configured)
                      .map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Style language</label>
            <Controller
              control={control}
              name="image_style"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_STYLES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {mode === "dialogue" ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Dialogue preset still shapes character art direction, but you can override the render style here.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Delivery format
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Resolution</label>
            <Controller
              control={control}
              name="resolution"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
            <label className="mb-1 block text-sm font-medium">Transition language</label>
            <Controller
              control={control}
              name="transition"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select transition" />
                  </SelectTrigger>
                  <SelectContent>
                    {transitions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {mode === "dialogue" ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Dialogue preset suggests a default transition, but you can pick the pacing you want here.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
