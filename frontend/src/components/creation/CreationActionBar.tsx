"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CreationActionBarProps = {
  primaryLabel: string;
  onPrimaryClick: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryLoadingLabel?: string;
  secondaryActions?: ReactNode;
  helperText?: string;
  className?: string;
};

export function CreationActionBar({
  primaryLabel,
  onPrimaryClick,
  primaryDisabled,
  primaryLoading,
  primaryLoadingLabel,
  secondaryActions,
  helperText,
  className,
}: CreationActionBarProps) {
  return (
    <div
      className={cn(
        "sticky top-3 z-20 rounded-xl border border-border/70 bg-card/90 p-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-card/75",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{secondaryActions}</div>
        <Button
          type="button"
          variant="animated"
          className="min-w-36"
          disabled={primaryDisabled}
          loading={primaryLoading}
          loadingLabel={primaryLoadingLabel}
          onClick={onPrimaryClick}
        >
          {primaryLabel}
        </Button>
      </div>
      {helperText ? (
        <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
