"use client";

/**
 * Alert / action list pattern (21st.dev — Features & list rows). Compact when empty.
 * Failure block can be hidden; expands again from the collapsed strip or when issues clear.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export type FailedJobAction = {
  id: string;
  title: string;
  subtitle: string;
  onRetry: () => void;
  retrying?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
};
export type FailedProjectAction = {
  id: string;
  title: string;
  subtitle: string;
  onRetry: () => void;
  retrying?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
};

export function ActionCenter21st({
  failedJobs,
  failedProjects,
}: {
  failedJobs: FailedJobAction[];
  failedProjects: FailedProjectAction[];
}) {
  const hasAny = failedJobs.length > 0 || failedProjects.length > 0;
  const attentionCount = failedJobs.length + failedProjects.length;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!hasAny) setHidden(false);
  }, [hasAny]);

  if (!hasAny) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/60 bg-linear-to-br from-emerald-50/70 via-white to-white/70 px-3 py-2 text-xs text-emerald-800 shadow-[0_10px_30px_rgba(16,185,129,0.12)] dark:border-emerald-900/40 dark:from-emerald-950/35 dark:via-zinc-900 dark:to-zinc-900 dark:text-emerald-200/90 sm:text-sm">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        All clear — no failed jobs or projects need attention.
      </div>
    );
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200/70 bg-linear-to-br from-amber-50/90 via-white to-white/80 px-3 py-2 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100/90 dark:border-amber-900/50 dark:from-amber-950/40 dark:via-zinc-900 dark:to-zinc-900 dark:text-amber-100 dark:hover:bg-amber-950/50 sm:text-sm"
        aria-expanded={false}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span>
          Needs attention ({attentionCount}) — <span className="text-cyan-600 dark:text-cyan-400">Show</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-amber-200/70 bg-linear-to-br from-amber-50/90 via-white to-white shadow-[0_12px_35px_rgba(245,158,11,0.18)] dark:border-amber-900/40 dark:from-amber-950/30 dark:via-zinc-900 dark:to-zinc-900"
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-200/50 px-3 py-2 sm:px-4 dark:border-amber-900/30">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 sm:h-4 sm:w-4" aria-hidden />
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">Needs attention</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          onClick={() => setHidden(true)}
          aria-expanded={true}
          aria-label="Hide needs attention section"
        >
          Hide
        </Button>
      </div>
      <div className="grid gap-1.5 p-2.5 sm:grid-cols-2 sm:gap-2 sm:p-3">
        <AnimatePresence mode="popLayout">
          {failedJobs.map((j) => (
            <motion.div
              key={`job-${j.id}`}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-2.5 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700 dark:bg-zinc-900/75 sm:gap-3 sm:px-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100 sm:text-sm">{j.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{j.subtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md px-2.5 text-xs sm:h-9 sm:rounded-lg"
                  disabled={j.retrying || j.deleting}
                  onClick={j.onRetry}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
                {j.onDelete ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md px-2.5 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 sm:h-9 sm:rounded-lg"
                    disabled={j.retrying || j.deleting}
                    onClick={j.onDelete}
                    title="Delete permanently"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </motion.div>
          ))}
          {failedProjects.map((p) => (
            <motion.div
              key={`proj-${p.id}`}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-2.5 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700 dark:bg-zinc-900/75 sm:gap-3 sm:px-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100 sm:text-sm">{p.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{p.subtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md px-2.5 text-xs sm:h-9 sm:rounded-lg"
                  disabled={p.retrying || p.deleting}
                  onClick={p.onRetry}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
                {p.onDelete ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md px-2.5 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 sm:h-9 sm:rounded-lg"
                    disabled={p.retrying || p.deleting}
                    onClick={p.onDelete}
                    title="Delete permanently"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
