"use client";

import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getStudioRecoveryActionLabel,
  getStudioRecoveryStepLabel,
  type StudioStepHint,
} from "@/components/studio/studio-recovery";

export interface StudioRecoveryBannerProps {
  message: string;
  stepHint: StudioStepHint;
  onRetry: () => void | Promise<void>;
  onDismiss: () => void;
  retrying: boolean;
}

export function StudioRecoveryBanner({
  message,
  stepHint,
  onRetry,
  onDismiss,
  retrying,
}: StudioRecoveryBannerProps) {
  const stepLabel = getStudioRecoveryStepLabel(stepHint);
  const actionLabel = getStudioRecoveryActionLabel(stepHint);

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-foreground">
          {stepLabel} stage did not finish
        </p>
        <p className="text-muted-foreground wrap-break-word text-xs leading-relaxed">{message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          loading={retrying}
          loadingLabel="Retrying…"
          onClick={() => void onRetry()}
        >
          {actionLabel}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
