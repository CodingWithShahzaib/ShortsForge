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
};

export const VisualsCard = memo(function VisualsCard({ imageProviders, resolutions, transitions }: Props) {
  const { control } = useFormContext<GenerateFormValues>();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Image Provider</label>
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
        <div>
          <label className="text-sm font-medium mb-1 block">Style</label>
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
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Resolution</label>
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
        <div>
          <label className="text-sm font-medium mb-1 block">Transition</label>
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
        </div>
      </div>
    </div>
  );
});
