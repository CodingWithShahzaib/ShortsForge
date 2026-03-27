"use client";

/**
 * Pill tab switcher (21st.dev segmented control / tabs pattern).
 */

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export type WorkTabId = "queue" | "recent";

export function WorkTabs21st({
  active,
  onChange,
  queueCount,
  recentCount,
  queueLink,
  recentLink,
  children,
  className,
}: {
  active: WorkTabId;
  onChange: (t: WorkTabId) => void;
  queueCount?: number;
  recentCount?: number;
  queueLink?: React.ReactNode;
  recentLink?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/75",
        className
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700/80">
        <div
          className="inline-flex h-9 items-center rounded-full bg-slate-100/80 p-0.5 ring-1 ring-slate-200/60 dark:bg-zinc-800/80 dark:ring-zinc-700/80"
          role="tablist"
        aria-label="In progress and recent output"
        >
          <button
            type="button"
            role="tab"
            aria-selected={active === "queue"}
            id="tab-queue"
            onClick={() => onChange("queue")}
            className={cn(
              "relative z-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              active === "queue"
                ? "text-slate-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {active === "queue" && (
              <motion.span
                layoutId="work-tab-pill"
                className="absolute inset-0 rounded-full bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:bg-zinc-900"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">In progress</span>
            {queueCount != null && (
              <span className="relative z-10 ml-1.5 tabular-nums text-[10px] opacity-70">({queueCount})</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={active === "recent"}
            id="tab-recent"
            onClick={() => onChange("recent")}
            className={cn(
              "relative z-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              active === "recent"
                ? "text-slate-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {active === "recent" && (
              <motion.span
                layoutId="work-tab-pill"
                className="absolute inset-0 rounded-full bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:bg-zinc-900"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">Recent output</span>
            {recentCount != null && (
              <span className="relative z-10 ml-1.5 tabular-nums text-[10px] opacity-70">({recentCount})</span>
            )}
          </button>
        </div>
        <div className="flex shrink-0 justify-end gap-2 text-sm">
          {active === "queue" ? queueLink : recentLink}
        </div>
      </div>
      <div
        className="p-4 sm:p-5"
        role="tabpanel"
        aria-labelledby={active === "queue" ? "tab-queue" : "tab-recent"}
      >
        {children}
      </div>
    </div>
  );
}
