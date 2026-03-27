"use client";

/**
 * Stats grid pattern from 21st.dev community (https://21st.dev/community/components/s/stats, /s/stats-card).
 * Glass cards + motion hover; themed for ShortsForge.
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type StatCardItem21st = {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: "cyan" | "emerald" | "amber" | "rose" | "violet" | "sky";
};

const accentRing: Record<NonNullable<StatCardItem21st["accent"]>, string> = {
  cyan: "group-hover:shadow-cyan-500/15 dark:group-hover:shadow-cyan-400/10",
  emerald: "group-hover:shadow-emerald-500/15 dark:group-hover:shadow-emerald-400/10",
  amber: "group-hover:shadow-amber-500/15 dark:group-hover:shadow-amber-400/10",
  rose: "group-hover:shadow-rose-500/15 dark:group-hover:shadow-rose-400/10",
  violet: "group-hover:shadow-violet-500/15 dark:group-hover:shadow-violet-400/10",
  sky: "group-hover:shadow-sky-500/15 dark:group-hover:shadow-sky-400/10",
};

export function StatsCards21st({ items }: { items: StatCardItem21st[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "group relative rounded-2xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/75",
            "transition-shadow duration-300 hover:shadow-lg",
            item.accent ? accentRing[item.accent] : "hover:shadow-slate-500/10"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-2 dark:border-white/10 dark:bg-zinc-800/80">
              {item.icon}
            </div>
          </div>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {item.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
            {item.value}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.hint}</p>
        </motion.div>
      ))}
    </div>
  );
}
