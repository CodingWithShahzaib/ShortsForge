"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CreationFlowHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function CreationFlowHeader({
  eyebrow,
  title,
  description,
  badges,
  actions,
  className,
}: CreationFlowHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-pretty text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
