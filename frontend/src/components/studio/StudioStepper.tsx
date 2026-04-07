"use client";

import type React from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface StudioStep {
  label: string;
  description: string;
  icon: React.ReactNode;
}

export interface StudioStepperProps {
  currentStep: number;
  steps: StudioStep[];
  onStepClick?: (step: number) => void;
  completedSteps: Set<number>;
  variant?: "vertical" | "horizontal" | "adaptive";
  activeStatus?: string;
  stepErrors?: Record<number, string | null>;
  stepHints?: Record<number, string | null>;
  stepBadges?: Record<number, string | null>;
}

type StepVisualState = "active" | "complete" | "pending" | "locked" | "error";

function getStepState({
  index,
  currentStep,
  completedSteps,
  hasError,
}: {
  index: number;
  currentStep: number;
  completedSteps: Set<number>;
  hasError: boolean;
}): StepVisualState {
  if (hasError) return "error";
  if (index === currentStep) return "active";
  if (index < currentStep || completedSteps.has(index)) return "complete";
  if (index > currentStep + 1) return "locked";
  return "pending";
}

function StepIcon({
  state,
  fallback,
}: {
  state: StepVisualState;
  fallback: React.ReactNode;
}) {
  if (state === "complete") return <Check className="h-3.5 w-3.5" />;
  if (state === "locked") return <Lock className="h-3.5 w-3.5" />;
  if (state === "error") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <span className="flex [&>svg]:h-3.5 [&>svg]:w-3.5">{fallback}</span>;
}

function VerticalStepper({
  currentStep,
  steps,
  onStepClick,
  completedSteps,
  activeStatus,
  stepErrors,
  stepHints,
  stepBadges,
}: Omit<StudioStepperProps, "variant">) {
  return (
    <nav className="w-full" aria-label="Studio steps">
      <ol className="space-y-2">
        {steps.map((step, i) => {
          const error = stepErrors?.[i];
          const hint = stepHints?.[i];
          const badge = stepBadges?.[i];
          const state = getStepState({
            index: i,
            currentStep,
            completedSteps,
            hasError: Boolean(error),
          });
          const clickable = Boolean(onStepClick) && (i <= currentStep || completedSteps.has(i));
          const isCurrent = i === currentStep;

          return (
            <li key={i}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  state === "active" && "border-primary/35 bg-primary/5",
                  state === "complete" && "border-emerald-500/30 bg-emerald-500/5",
                  state === "pending" && "border-border/60 bg-background/60",
                  state === "locked" && "border-border/40 bg-muted/20 text-muted-foreground/70",
                  state === "error" && "border-destructive/35 bg-destructive/5",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                      state === "active" && "border-primary/40 bg-primary text-primary-foreground",
                      state === "complete" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-600",
                      state === "pending" && "border-border/60 bg-muted/40 text-muted-foreground",
                      state === "locked" && "border-border/50 bg-muted/30 text-muted-foreground",
                      state === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                    )}
                  >
                    <StepIcon state={state} fallback={step.icon} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>

                {(isCurrent && activeStatus) || error || hint || badge ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isCurrent && activeStatus ? (
                      <p className="text-xs font-medium text-primary">{activeStatus}</p>
                    ) : null}
                    {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
                    {!error && hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
                    {badge ? (
                      <Badge
                        variant={state === "complete" ? "success" : state === "error" ? "error" : "secondary"}
                        className="h-5 px-2 text-[10px] uppercase tracking-wide"
                      >
                        {badge}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function HorizontalStepper({
  currentStep,
  steps,
  onStepClick,
  completedSteps,
  activeStatus,
  stepErrors,
  stepHints,
  stepBadges,
}: Omit<StudioStepperProps, "variant">) {
  const n = steps.length;
  const safe = Math.min(Math.max(currentStep, 0), Math.max(n - 1, 0));
  const activeStep = steps[safe];
  const activeError = stepErrors?.[safe];
  const activeHint = stepHints?.[safe];
  const activeBadge = stepBadges?.[safe];

  return (
    <nav className="w-full" aria-label="Studio steps">
      <div className="relative flex items-start justify-between">
        {steps.map((step, i) => {
          const error = stepErrors?.[i];
          const state = getStepState({
            index: i,
            currentStep: safe,
            completedSteps,
            hasError: Boolean(error),
          });
          const isCurrent = i === safe;
          const clickable = Boolean(onStepClick) && (i <= safe || completedSteps.has(i));

          return (
            <div key={i} className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1">
              {i < n - 1 ? (
                <div className="pointer-events-none absolute left-[calc(50%+16px)] top-[14px] h-[2px] w-[calc(100%-32px)] bg-border/25">
                  <div
                    className={cn(
                      "h-full transition-all",
                      i < safe || completedSteps.has(i)
                        ? "w-full bg-primary/70"
                        : "w-0 bg-transparent",
                    )}
                  />
                </div>
              ) : null}

              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                className="flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-7 items-center justify-center rounded-full border",
                    state === "active" && "border-primary/40 bg-primary text-primary-foreground",
                    state === "complete" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-600",
                    state === "pending" && "border-border/60 bg-muted/40 text-muted-foreground",
                    state === "locked" && "border-border/50 bg-muted/30 text-muted-foreground",
                    state === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                >
                  <StepIcon state={state} fallback={step.icon} />
                </span>
                <span
                  className={cn(
                    "mt-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>

    </nav>
  );
}

export function StudioStepper(props: StudioStepperProps) {
  const { variant = "adaptive", ...rest } = props;
  if (variant === "horizontal") {
    return <HorizontalStepper {...rest} />;
  }
  if (variant === "vertical") {
    return <VerticalStepper {...rest} />;
  }
  return (
    <>
      <div className="md:hidden">
        <HorizontalStepper {...rest} />
      </div>
      <div className="hidden md:block">
        <VerticalStepper {...rest} />
      </div>
    </>
  );
}
