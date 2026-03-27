"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Zap, ListChecks, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUICK_STARTS = [
  {
    id: "hook-list",
    title: "3-hook listicle",
    description: "Fast hooks + quick cuts for shareable shorts.",
    icon: ListChecks,
  },
  {
    id: "news-recap",
    title: "News recap",
    description: "Summarize a topic with a crisp narration flow.",
    icon: Sparkles,
  },
  {
    id: "before-after",
    title: "Before / after",
    description: "Show transformation with punchy visuals.",
    icon: Zap,
  },
  {
    id: "mini-doc",
    title: "Mini documentary",
    description: "Story-driven structure with 5–7 scenes.",
    icon: Clapperboard,
  },
];

export function QuickStartsPanel({ className }: { className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/75",
        className
      )}
      aria-labelledby="quick-starts-heading"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent text-violet-700 dark:from-violet-500/20 dark:text-violet-300">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 id="quick-starts-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Quick starts
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Jump into a proven format in minutes.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {QUICK_STARTS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-3 transition hover:border-violet-300/60 hover:bg-violet-50/40 dark:border-zinc-700/70 dark:bg-zinc-800/40 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-linear-to-br from-white via-slate-50 to-transparent text-slate-700 shadow-sm dark:from-zinc-900 dark:via-zinc-950 dark:text-slate-200">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.title}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
              <Button asChild size="sm" variant="outline" className="w-fit rounded-lg">
                <Link href="/generate">Start</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
