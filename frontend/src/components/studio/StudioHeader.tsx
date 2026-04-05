"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toFriendlyStatus } from "@/lib/user-facing-text";
import { ArrowLeft } from "lucide-react";

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
    <header role="banner" className="z-20 w-full shrink-0 border-b border-border/40 bg-background/95">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-9 w-9 shrink-0 rounded-xl text-muted-foreground"
            onClick={onClose}
            aria-label="Leave studio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                Studio
              </Badge>
              {projectStatus ? (
                <Badge variant={projectStatusVariant} className="h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                  {toFriendlyStatus(projectStatus)}
                </Badge>
              ) : null}
              {stepLabel ? (
                <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                  {stepLabel}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-2 truncate text-lg font-semibold tracking-tight sm:text-xl" title={projectTitle}>
              {projectTitle}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Step {Math.min(currentStep, totalSteps)} of {totalSteps}
              {stepStatus ? ` • ${stepStatus}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onSaveDraft ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-xl px-3 text-[11px]"
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
          ) : null}
          {onResumeDraft && draftSavedAt ? (
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
          ) : null}
        </div>
      </div>
    </header>
  );
}
