"use client";

/**
 * Inspired by 21st.dev hero / dashboard header patterns (https://21st.dev/components — Heros).
 * Adapted for ShortsForge Pulse: cyan accent, slate/zinc surfaces, dark mode.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PulseHero21stProps = {
  title?: string;
  subtitle?: string;
  activeJobsLabel?: string | null;
  lastUpdatedLabel?: string | null;
  loading?: boolean;
  onRefresh: () => void;
  className?: string;
};

export function PulseHero21st({
  title = "Pulse",
  subtitle = "From script to reel in minutes.",
  activeJobsLabel,
  lastUpdatedLabel,
  loading,
  onRefresh,
  className,
}: PulseHero21stProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-xl border border-slate-200/80 dark:border-zinc-700/90 bg-linear-to-br from-white via-slate-50/95 to-cyan-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-cyan-950/25 px-5 py-5 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] sm:px-6 sm:py-6",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-500/10"
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 lg:max-w-none">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-400">
            Workspace
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-400 sm:text-sm">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {activeJobsLabel ? <span>{activeJobsLabel}</span> : null}
            {lastUpdatedLabel ? <span className="tabular-nums">{lastUpdatedLabel}</span> : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh"
            className="shrink-0 rounded-xl border border-slate-200/80 bg-white/60 dark:border-zinc-600 dark:bg-zinc-800/60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button asChild className="shrink-0 gap-2">
            <Link href="/generate">
              <Plus className="h-4 w-4" />
              New project
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
