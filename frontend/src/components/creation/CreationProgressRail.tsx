"use client";

import { AlertCircle, CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

export type CreationProgressStatus =
  | "complete"
  | "active"
  | "pending"
  | "blocked"
  | "error";

export type CreationProgressStep = {
  id: string;
  label: string;
  description?: string;
  status: CreationProgressStatus;
  hint?: string;
};

type CreationProgressRailProps = {
  steps: CreationProgressStep[];
  className?: string;
};

function iconForStatus(status: CreationProgressStatus) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
  return (
    <Circle
      className={cn(
        "h-4 w-4",
        status === "active" && "fill-primary text-primary",
        status === "blocked" && "fill-amber-500/20 text-amber-500",
        status === "pending" && "text-muted-foreground/50",
      )}
    />
  );
}

function statusClasses(status: CreationProgressStatus) {
  if (status === "active") return "border-primary/35 bg-primary/5";
  if (status === "complete") return "border-emerald-500/30 bg-emerald-500/5";
  if (status === "error") return "border-destructive/35 bg-destructive/5";
  if (status === "blocked") return "border-amber-500/30 bg-amber-500/5";
  return "border-border/60 bg-background/60";
}

export function CreationProgressRail({ steps, className }: CreationProgressRailProps) {
  return (
    <nav
      aria-label="Creation progress"
      className={cn(
        "rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm",
        className,
      )}
    >
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              statusClasses(step.status),
            )}
            aria-current={step.status === "active" ? "step" : undefined}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{iconForStatus(step.status)}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {index + 1}. {step.label}
                </p>
                {step.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                ) : null}
                {step.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground/90">{step.hint}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}
