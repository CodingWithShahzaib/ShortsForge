"use client";

/**
 * Full-width metrics strip — gap-divided cells (asymmetric dashboard / bento-adjacent pattern).
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StatCardItem21st } from "@/components/dashboard/stats-cards-21st";

export function PulseMetricsStrip({ items }: { items: StatCardItem21st[] }) {
  const gridCols =
    items.length >= 6
      ? "lg:grid-cols-7"
      : items.length >= 4
        ? "lg:grid-cols-4"
        : "lg:grid-cols-3";
  return (
    <div className="w-full min-w-0 rounded-xl border border-slate-200/80 bg-slate-200/45 p-px shadow-sm dark:border-zinc-700/90 dark:bg-zinc-800/55">
      <div
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-[0.7rem] sm:grid-cols-3 md:grid-cols-4",
          gridCols
        )}
        role="list"
        aria-label="Key metrics"
      >
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            role="listitem"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
            className="relative flex min-h-[4.5rem] flex-col justify-center bg-white/95 px-2.5 py-2 sm:min-h-[4.75rem] sm:px-3 sm:py-2.5 dark:bg-zinc-900/95"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-slate-50/90 dark:border-white/10 dark:bg-zinc-800/90 [&_svg]:h-3.5 [&_svg]:w-3.5">
                {item.icon}
              </span>
              <span className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[10px]">
                {item.label}
              </span>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
              {item.value}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-slate-600 dark:text-slate-400">{item.hint}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
