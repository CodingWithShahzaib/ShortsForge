"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toFriendlyStatus } from "@/lib/user-facing-text";
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
  projectStatus?: string;
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
  projectStatus,
  onSaveDraft,
  onResumeDraft,
  draftSavedAt,
}: StudioHeaderProps) {
  const safeTotal = Math.max(totalSteps, 1);
  const progress = Math.min(Math.max(currentStep, 1), safeTotal) / safeTotal;

  const fromColor = BEAM_COLORS[Math.max(currentStep - 2, 0)] ?? BEAM_COLORS[0];
  const toColor = BEAM_COLORS[Math.min(currentStep - 1, BEAM_COLORS.length - 1)] ?? BEAM_COLORS[0];
  const projectStatusVariant =
    projectStatus === "completed"
      ? "success"
      : projectStatus === "ready_for_compile"
        ? "warning"
        : projectStatus === "failed"
          ? "error"
          : projectStatus === "generating" || projectStatus === "in_progress" || projectStatus === "queued"
            ? "inProgress"
            : "secondary";

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

      <div className="border-b border-border/20 bg-background/88 backdrop-blur-xl">
        <div className="relative z-10 flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "mt-0.5 h-9 w-9 shrink-0 rounded-xl text-muted-foreground transition-colors",
                  "hover:bg-primary/10 hover:text-primary",
                )}
                onClick={onClose}
                aria-label="Leave studio"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white",
                      "bg-linear-to-r from-primary/90 to-accent/90 ring-1 ring-white/15",
                    )}
                  >
                    Studio
                  </span>
                  {projectStatus && (
                    <Badge variant={projectStatusVariant} className="h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                      {toFriendlyStatus(projectStatus)}
                    </Badge>
                  )}
                  {stepLabel && (
                    <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                      {stepLabel}
                    </Badge>
                  )}
                </div>
                <h1
                  className="mt-2 truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                  title={projectTitle}
                >
                  {projectTitle}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    Step {Math.min(currentStep, totalSteps)} of {totalSteps}
                  </span>
                  {stepStatus ? (
                    <>
                      <span className="text-border">•</span>
                      <span aria-live="polite" className="font-medium text-foreground/75">
                        {stepStatus}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {onSaveDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-xl px-3 text-[11px]"
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
                        className="h-9 rounded-xl px-3 text-[11px]"
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
