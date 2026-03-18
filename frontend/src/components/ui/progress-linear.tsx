"use client";

import { Progress } from "@ark-ui/react/progress";
import { cn } from "@/lib/utils";

interface LinearProgressProps {
  value?: number;
  className?: string;
}

export function LinearProgress({ value = 0, className }: LinearProgressProps) {
  return (
    <Progress.Root
      value={value}
      className={cn("w-full", className)}
    >
      <Progress.Track className="h-full w-full bg-secondary rounded-full overflow-hidden min-h-[6px]">
        <Progress.Range className="h-full bg-primary transition-all duration-300 ease-out rounded-full" />
      </Progress.Track>
    </Progress.Root>
  );
}
