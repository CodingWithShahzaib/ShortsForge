"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, AlertTriangle } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { studioStepPalette } from "@/components/studio/studio-step-colors";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  /** Live status text shown under the active step (e.g. "Compiling...") */
  activeStatus?: string;
  stepErrors?: Record<number, string | null>;
  stepHints?: Record<number, string | null>;
  stepBadges?: Record<number, string | null>;
}

function color(index: number) {
  return studioStepPalette(index);
}

/** Vertical rail fill: blend through each completed step’s hue up to the active one. */
function railFillGradient(safe: number) {
  if (safe <= 0) {
    const c = color(0);
    return `linear-gradient(180deg, hsl(${c.accent}), hsl(${c.glow}))`;
  }
  const stops = Array.from({ length: safe + 1 }, (_, i) => {
    const pct = (i / safe) * 100;
    return `hsl(${color(i).accent}) ${pct}%`;
  });
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

const KEYFRAMES = `
@keyframes s-orbit{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes s-pulse{0%,100%{opacity:.4}50%{opacity:.8}}
@keyframes s-dash{0%{stroke-dashoffset:80}100%{stroke-dashoffset:0}}
@keyframes s-glow-breathe{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
@keyframes s-rail-shimmer{0%,100%{opacity:.35}50%{opacity:.95}}
@keyframes s-future-hint{0%,100%{opacity:.25}50%{opacity:.45}}
`;

/* ═══════════════════════════════════════════════════════════════ */
/*  VERTICAL (desktop left-rail)                                  */
/* ═══════════════════════════════════════════════════════════════ */

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
  const n = steps.length;
  const safe = Math.min(Math.max(currentStep, 0), n - 1);
  const progressFrac = n > 1 ? safe / (n - 1) : 1;
  const activeHue = color(safe);
  const reduceMotion = useReducedMotion();
  const motionAllowed = !reduceMotion;

  return (
    <nav className="relative flex h-full w-full flex-col" aria-label="Pipeline steps">
      {motionAllowed && <style>{KEYFRAMES}</style>}

      {/* ── Vertical connector beam (multi-stop gradient + future path + junction glow) ── */}
      <div className="pointer-events-none absolute left-[19px] top-[28px] bottom-[28px] z-0 w-[3px]">
        {/* Ambient column bloom */}
        <div
          className="absolute -left-2 top-0 bottom-0 w-7 rounded-full opacity-40 blur-xl"
          style={{
            background: `linear-gradient(180deg, hsl(${color(0).accent} / 0.12), hsl(${activeHue.accent} / 0.18), transparent)`,
          }}
        />
        {/* Base track */}
        <div className="absolute inset-0 rounded-full bg-linear-to-b from-border/25 via-border/15 to-border/8" />
        {/* Remaining path (ahead of progress): dashed + faint pulse */}
        {progressFrac < 0.999 && (
          <div
            className="absolute left-1/2 w-px -translate-x-1/2 rounded-full"
            style={{
              top: `${progressFrac * 100}%`,
              bottom: 0,
              background: `repeating-linear-gradient(180deg, hsl(${color(Math.min(safe + 1, n - 1)).accent} / 0.22) 0px, hsl(${color(Math.min(safe + 1, n - 1)).accent} / 0.22) 3px, transparent 3px, transparent 7px)`,
              animation: motionAllowed ? "s-future-hint 3.2s ease-in-out infinite" : "none",
            }}
          />
        )}
        {/* Filled portion — step hues */}
        <motion.div
          className="absolute top-0 left-0 w-full max-w-[3px] rounded-full origin-top"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: progressFrac }}
          transition={{ type: "spring", stiffness: 68, damping: 19, mass: 1.05 }}
          style={{
            height: "100%",
            background: railFillGradient(safe),
            boxShadow: `0 0 10px hsl(${activeHue.glow} / 0.35), 0 0 2px hsl(${activeHue.accent} / 0.6)`,
          }}
        >
          {/* Shimmer sweep on lit rail */}
          <div
            className="absolute inset-0 rounded-full opacity-60 mix-blend-screen"
            style={{
              background: "linear-gradient(180deg, transparent 0%, hsl(0 0% 100% / 0.12) 50%, transparent 100%)",
              animation: motionAllowed ? "s-rail-shimmer 2.8s ease-in-out infinite" : "none",
            }}
          />
          {/* Leading-edge pulse at progress tip */}
          <div
            className="absolute bottom-0 left-1/2 z-10 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, hsl(${activeHue.accent}), hsl(${activeHue.glow} / 0.4))`,
              boxShadow: `0 0 14px 4px hsl(${activeHue.glow} / 0.55), 0 0 28px 8px hsl(${activeHue.glow} / 0.2)`,
            }}
          />
        </motion.div>
        {/* Wide bloom on filled segment */}
        <motion.div
          className="absolute top-0 left-[-4px] w-[11px] rounded-full origin-top blur-[6px] opacity-[0.44]"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: progressFrac }}
          transition={{ type: "spring", stiffness: 68, damping: 19, mass: 1.05 }}
          style={{
            height: "100%",
            background: railFillGradient(safe),
          }}
        />
      </div>

      {/* ── Step nodes ──────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col justify-between">
        {steps.map((step, i) => {
          const isCurrent = i === safe;
          const isDone = !isCurrent && (i < safe || completedSteps.has(i));
          const isFuture = !isDone && !isCurrent;
          const clickable = Boolean(onStepClick) && (i <= safe || completedSteps.has(i));
          const c = color(i);
          const error = stepErrors?.[i];
          const hint = stepHints?.[i];
          const badge = stepBadges?.[i];

          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(i)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl text-left transition-all duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                clickable ? "cursor-pointer" : "cursor-default",
                isCurrent ? "px-0 py-0" : "px-0 py-1",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* ── Node ── */}
              <div className="relative flex shrink-0 items-center justify-center" style={{ width: 40, height: 40 }}>
                {/* Active: orbiting ring + glow */}
                {isCurrent && (
                  <>
                    {/* Outer orbit ring */}
                    <svg className="absolute inset-[-6px]" viewBox="0 0 52 52" style={{ animation: motionAllowed ? "s-orbit 6s linear infinite" : "none" }}>
                      <circle cx="26" cy="26" r="24" fill="none" stroke={`hsl(${c.accent} / 0.15)`} strokeWidth="1" />
                      <circle cx="26" cy="2" r="2" fill={`hsl(${c.accent})`} />
                    </svg>
                    {/* Ambient glow */}
                    <div
                      className="absolute inset-[-4px] rounded-full"
                      style={{
                        boxShadow: `0 0 16px 4px hsl(${c.glow} / 0.3), 0 0 32px 8px hsl(${c.glow} / 0.1)`,
                        animation: motionAllowed ? "s-glow-breathe 3s ease-in-out infinite" : "none",
                      }}
                    />
                  </>
                )}

                {/* Circle */}
                <motion.div
                  layout
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                    isFuture &&
                      "border border-dashed border-border/35 bg-muted/12 text-muted-foreground/55 ring-1 ring-inset ring-white/4 dark:ring-white/6",
                    error && "ring-2 ring-rose-500/40",
                  )}
                  style={
                    isCurrent
                      ? {
                          background: `linear-gradient(145deg, hsl(${c.accent}), hsl(${c.glow} / 0.75))`,
                          boxShadow: `inset 0 1px 1px hsl(0 0% 100% / 0.25), 0 4px 16px hsl(${c.glow} / 0.35), 0 0 0 1px hsl(${c.accent} / 0.35)`,
                          color: "white",
                        }
                      : isDone
                        ? {
                            border: `1.5px solid hsl(${c.accent} / 0.45)`,
                            background: `linear-gradient(180deg, hsl(${c.accent} / 0.12), hsl(${c.accent} / 0.05))`,
                            boxShadow: `0 0 0 1px hsl(${c.accent} / 0.08)`,
                          }
                        : undefined
                  }
                >
                  <AnimatePresence mode="wait">
                    {isDone ? (
                      <motion.span
                        key="done"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      >
                        <Check className="h-4 w-4" style={{ color: `hsl(${c.accent})` }} />
                      </motion.span>
                    ) : error ? (
                      <motion.span
                        key="error"
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        className="flex"
                      >
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="icon"
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        className="flex [&>svg]:h-4 [&>svg]:w-4"
                      >
                        {step.icon}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* ── Label area ── */}
              <div className="flex min-w-0 flex-1 flex-col">
                <AnimatePresence mode="wait">
                  {isCurrent ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      transition={{ type: "spring", stiffness: 300, damping: 26 }}
                      className="rounded-xl border px-3.5 py-2.5 backdrop-blur-md"
                      style={{
                        borderColor: `hsl(${c.accent} / 0.28)`,
                        background: `linear-gradient(135deg, hsl(${c.accent} / 0.1), hsl(${c.glow} / 0.04))`,
                        boxShadow: `0 14px 44px -10px hsl(${c.glow} / 0.24), inset 0 1px 0 hsl(0 0% 100% / 0.07)`,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${c.accent})` }} />
                        <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: `hsl(${c.accent})` }}>
                          {step.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground/70">
                        {step.description}
                      </p>
                      {activeStatus && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-1 text-[9px] font-medium truncate"
                          style={{ color: `hsl(${c.accent} / 0.8)` }}
                        >
                          {activeStatus}
                        </motion.p>
                      )}
                      {badge && (
                        <Badge variant="secondary" className="mt-2 h-5 w-fit rounded-full px-2 text-[9px] uppercase tracking-widest">
                          {badge}
                        </Badge>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span
                        className={cn(
                          "text-[11px] font-semibold tracking-wide",
                          isDone ? "text-foreground/70" : "text-muted-foreground/45",
                        )}
                      >
                        {step.label}
                      </span>
                      {badge && (
                        <Badge
                          variant={isDone ? "success" : error ? "error" : "secondary"}
                          className="mt-1 h-5 w-fit rounded-full px-2 text-[8px] uppercase tracking-widest"
                        >
                          {badge}
                        </Badge>
                      )}
                      {isDone && (
                        <p className="text-[9px] font-medium text-emerald-500/80 dark:text-emerald-400/70">Ready</p>
                      )}
                      {error && (
                        <p className="mt-0.5 text-[9px] font-semibold text-rose-500/80">Needs attention</p>
                      )}
                      {isFuture && !error && (
                        <p className="mt-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground/30">
                          Next
                        </p>
                      )}
                      {hint && (
                        <p className="mt-1 text-[9px] text-muted-foreground/60 line-clamp-2">
                          {hint}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HORIZONTAL (mobile)                                           */
/* ═══════════════════════════════════════════════════════════════ */

function HorizontalStepper({
  currentStep,
  steps,
  onStepClick,
  completedSteps,
  stepErrors,
  stepHints,
  stepBadges,
}: Omit<StudioStepperProps, "variant">) {
  const n = steps.length;
  const safe = Math.min(Math.max(currentStep, 0), n - 1);
  const reduceMotion = useReducedMotion();
  const motionAllowed = !reduceMotion;

  return (
    <nav className="w-full" aria-label="Pipeline steps">
      {motionAllowed && <style>{KEYFRAMES}</style>}
      <div className="relative flex w-full items-center justify-between">
        {steps.map((step, i) => {
          const isCurrent = i === safe;
          const isDone = !isCurrent && (i < safe || completedSteps.has(i));
          const isFuture = !isDone && !isCurrent;
          const clickable = Boolean(onStepClick) && (i <= safe || completedSteps.has(i));
          const c = color(i);
          const filled = i < safe || completedSteps.has(i);
          const error = stepErrors?.[i];
          const hint = stepHints?.[i];
          const badge = stepBadges?.[i];

          return (
            <div key={i} className="relative z-10 flex min-w-0 flex-1 flex-col items-center">
              {/* Connector */}
              {i < n - 1 && (
                <div className="pointer-events-none absolute top-[14px] z-0 left-[calc(50%+16px)] w-[calc(100%-32px)] h-[2px]" aria-hidden>
                  <div className="absolute inset-0 rounded-full bg-border/20" />
                  <motion.div
                    className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                    initial={false}
                    animate={{ scaleX: filled ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 250, damping: 28 }}
                    style={{
                      originX: 0,
                      width: "100%",
                      background: `linear-gradient(90deg, hsl(${color(i).accent}), hsl(${color(i + 1).accent}))`,
                    }}
                  />
                </div>
              )}

              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onStepClick?.(i)}
                      className={cn(
                        "group relative flex flex-col items-center focus:outline-none",
                        clickable ? "cursor-pointer" : "cursor-default",
                      )}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                <span className="relative flex h-7 w-7 items-center justify-center">
                  {isCurrent && (
                        <svg className="absolute inset-[-4px]" viewBox="0 0 38 38" style={{ animation: motionAllowed ? "s-orbit 5s linear infinite" : "none" }}>
                      <circle cx="19" cy="19" r="17.5" fill="none" stroke={`hsl(${c.accent} / 0.15)`} strokeWidth="0.5" />
                      <circle cx="19" cy="1.5" r="1.5" fill={`hsl(${c.accent})`} />
                    </svg>
                  )}
                  <motion.span
                    layout
                    className={cn(
                      "relative flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300",
                      isFuture && "border border-border/25 bg-muted/15 text-muted-foreground/40",
                          error && "ring-2 ring-rose-500/40",
                    )}
                    style={
                      isCurrent
                        ? { background: `linear-gradient(135deg, hsl(${c.accent}), hsl(${c.accent} / 0.6))`, color: "white", boxShadow: `0 0 10px hsl(${c.glow} / 0.25)` }
                        : isDone
                          ? { border: `1px solid hsl(${c.accent} / 0.35)`, background: `hsl(${c.accent} / 0.06)` }
                          : undefined
                    }
                  >
                    {isDone ? (
                      <Check className="h-3 w-3" style={{ color: `hsl(${c.accent})` }} />
                    ) : error ? (
                      <AlertTriangle className="h-3 w-3 text-rose-500" />
                    ) : (
                      <span className="flex [&>svg]:h-3 [&>svg]:w-3">{step.icon}</span>
                    )}
                  </motion.span>
                </span>

                    <span className={cn(
                      "mt-1 text-[8px] font-bold tracking-widest uppercase",
                      isCurrent && "text-foreground",
                      isDone && "text-foreground/50",
                      isFuture && "text-muted-foreground/30",
                    )}>
                      {step.label}
                    </span>
                  </button>
                  </TooltipTrigger>
                  {(error || hint || badge) && (
                    <TooltipContent>
                      <div className="space-y-1">
                        {badge && <div className="font-semibold uppercase tracking-widest text-[10px]">{badge}</div>}
                        {error && <div className="text-rose-500 text-[11px]">{error}</div>}
                        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Export                                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function StudioStepper(props: StudioStepperProps) {
  const { variant = "adaptive", ...rest } = props;
  const [resolved, setResolved] = useState<"vertical" | "horizontal">(
    variant === "horizontal" ? "horizontal" : "vertical"
  );

  useEffect(() => {
    if (variant !== "adaptive") {
      setResolved(variant);
      return;
    }
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setResolved(media.matches ? "vertical" : "horizontal");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [variant]);

  return resolved === "horizontal"
    ? <HorizontalStepper {...rest} />
    : <VerticalStepper {...rest} />;
}
