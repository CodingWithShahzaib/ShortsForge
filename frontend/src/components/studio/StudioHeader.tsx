"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { STUDIO_STEP_COLORS } from "@/components/studio/studio-step-colors";

export interface StudioHeaderProps {
  projectTitle: string;
  currentStep: number;
  totalSteps: number;
  onClose: () => void;
  stepLabel?: string;
  stepStatus?: string;
  onSaveDraft?: () => void;
  onResumeDraft?: () => void;
  draftSavedAt?: string | null;
}

const BEAM_COLORS = STUDIO_STEP_COLORS.map((c) => c.accent);

export function StudioHeader({
  projectTitle,
  currentStep,
  totalSteps,
  onClose,
  stepLabel,
  stepStatus,
  onSaveDraft,
  onResumeDraft,
  draftSavedAt,
}: StudioHeaderProps) {
  const safeTotal = Math.max(totalSteps, 1);
  const progress = Math.min(Math.max(currentStep, 1), safeTotal) / safeTotal;

  const fromColor = BEAM_COLORS[Math.max(currentStep - 2, 0)] ?? BEAM_COLORS[0];
  const toColor = BEAM_COLORS[Math.min(currentStep - 1, BEAM_COLORS.length - 1)] ?? BEAM_COLORS[0];

  return (
    <motion.header
      role="banner"
      initial={{ y: -56 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.85 }}
      className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-t-2xl"
    >
      {/* Progress beam -- 2px bar at very top */}
      <div className="relative h-[2px] w-full bg-muted/30">
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={{ width: "0%" }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
          style={{
            background: `linear-gradient(90deg, hsl(${fromColor}), hsl(${toColor}))`,
          }}
        />
        {/* Leading sparkle */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 w-6 rounded-full blur-[2px]"
          initial={{ left: "0%" }}
          animate={{ left: `${progress * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
          style={{
            background: `radial-gradient(circle, hsl(${toColor} / 0.9), transparent)`,
            marginLeft: -12,
          }}
        />
      </div>

      {/* Header bar */}
      <div className="flex h-12 items-center bg-background/90 backdrop-blur-xl border-b border-border/20">
        <div className="relative z-10 grid h-full w-full grid-cols-3 items-center gap-2 px-3 sm:px-4">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "shrink-0 text-muted-foreground transition-colors h-8 w-8",
                "hover:bg-primary/10 hover:text-primary",
              )}
              onClick={onClose}
              aria-label="Leave studio"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="mx-auto flex min-w-0 max-w-[min(100%,20rem)] items-center justify-center gap-2">
            <h1
              className="min-w-0 truncate text-center text-sm font-medium text-foreground"
              title={projectTitle}
            >
              {projectTitle}
            </h1>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5",
                "text-[8px] font-bold uppercase tracking-widest text-white",
                "bg-linear-to-r from-primary/90 to-accent/90",
                "ring-1 ring-white/15",
              )}
            >
              Studio
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <div className="hidden items-center gap-2 text-[10px] text-muted-foreground/70 sm:flex">
              {stepLabel && (
                <Badge variant="secondary" className="h-5 rounded-full px-2 text-[9px] uppercase tracking-widest">
                  {stepLabel}
                </Badge>
              )}
              <span className="font-mono tabular-nums">
                {Math.min(currentStep, totalSteps)}/{totalSteps}
              </span>
            </div>

            {stepStatus && (
              <span className="hidden text-[10px] font-medium text-muted-foreground/70 md:inline" aria-live="polite">
                {stepStatus}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              {onSaveDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[10px]"
                  onClick={onSaveDraft}
                >
                  Save draft
                </Button>
              )}
              {onResumeDraft && draftSavedAt && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-[10px]"
                        onClick={onResumeDraft}
                      >
                        Resume
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Draft saved {new Date(draftSavedAt).toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
