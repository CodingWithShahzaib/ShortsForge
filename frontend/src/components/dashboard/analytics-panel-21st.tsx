"use client";

/**
 * Dashboard activity: period summary, timeline chart, and insight blocks.
 */

import { useMemo } from "react";
import {
  Activity,
  BarChart2,
  CheckCircle2,
  Percent,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import type { ActivityBucket } from "@/lib/dashboard-metrics";
import type { DashboardRange } from "@/lib/dashboard-metrics";
import { motion } from "framer-motion";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export type AnalyticsPanel21stProps = {
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
  buckets: ActivityBucket[];
  maxCount: number;
  totalInRange: number;
  throughputDelta: number;
  topFailure: string | null;
};

function truncateMessage(s: string, max = 96): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function AnalyticsPanel21st({
  range,
  onRangeChange,
  buckets,
  maxCount,
  totalInRange,
  throughputDelta,
  topFailure,
}: AnalyticsPanel21stProps) {
  const barMinWidth = range === "30" ? "min-w-[52px]" : "min-w-[28px]";

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        completed: b.completed,
        failed: b.failed,
        total: b.completed + b.failed,
      })),
    [buckets]
  );

  const { sumCompleted, sumFailed, successPct, peakBucket } = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let peak: ActivityBucket | null = null;
    let peakTotal = -1;
    for (const b of buckets) {
      completed += b.completed;
      failed += b.failed;
      const t = b.completed + b.failed;
      if (t > peakTotal) {
        peakTotal = t;
        peak = b;
      }
    }
    const finished = completed + failed;
    const successPct = finished > 0 ? Math.round((completed / finished) * 100) : null;
    return { sumCompleted: completed, sumFailed: failed, successPct, peakBucket: peakTotal > 0 ? peak : null };
  }, [buckets]);

  const rangeLabel = range === "7" ? "Last 7 days" : "Last 30 days";
  const chartWidth = Math.max(chartData.length * (range === "30" ? 44 : 56), 320);
  const chartHeight = 176;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 shadow-[0_12px_36px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/75"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700/80">
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200/70 bg-linear-to-br from-cyan-500/10 via-white to-transparent p-1.5 dark:border-zinc-600 dark:from-cyan-500/15 dark:via-zinc-900">
            <BarChart2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Activity</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              Finished jobs, timeline, and what to watch next
            </p>
          </div>
        </div>
        <div className="inline-flex h-9 items-center rounded-full bg-slate-100/80 p-0.5 ring-1 ring-slate-200/60 dark:bg-zinc-800/80 dark:ring-zinc-700/80">
          <button
            type="button"
            onClick={() => onRangeChange("7")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              range === "7"
                ? "bg-white text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:bg-zinc-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            7 days
          </button>
          <button
            type="button"
            onClick={() => onRangeChange("30")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              range === "30"
                ? "bg-white text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:bg-zinc-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            30 days
          </button>
        </div>
      </div>

      <div className="space-y-0 divide-y divide-slate-200/70 dark:divide-zinc-700/80">
        {/* —— Period summary —— */}
        <section className="p-4 sm:p-5" aria-labelledby="activity-summary-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3
              id="activity-summary-heading"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              This period
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{rangeLabel}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700/80 dark:bg-zinc-800/35">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Completed
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{sumCompleted}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Jobs finished OK</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700/80 dark:bg-zinc-800/35">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                Failed
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{sumFailed}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Need retry or fix</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700/80 dark:bg-zinc-800/35">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Activity className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                Total events
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{totalInRange}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Completed + failed</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700/80 dark:bg-zinc-800/35">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Percent className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                Success rate
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {successPct != null ? `${successPct}%` : "—"}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Of finished jobs</p>
            </div>
          </div>
        </section>

        {/* —— Timeline —— */}
        <section className="p-4 sm:p-5" aria-labelledby="activity-timeline-heading">
          <h3
            id="activity-timeline-heading"
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Timeline
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Stacked area view of completed vs failed jobs.
          </p>
          <div
            className="relative mt-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
            role="img"
            aria-label="Activity chart: completed versus failed jobs per period"
          >
            <div
              className={cn(
                "relative h-44 min-h-[176px] rounded-2xl border border-slate-200/70 bg-white/70 px-2 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700/70 dark:bg-zinc-900/60",
                barMinWidth
              )}
              style={{ minWidth: `${chartWidth}px` }}
            >
              <AreaChart width={chartWidth} height={chartHeight} data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.04" />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={24}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickFormatter={(value) => String(value)}
                  />
                  <Tooltip
                    cursor={{ stroke: "rgba(34,197,94,0.3)", strokeWidth: 1 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const completed = payload.find((p) => p.dataKey === "completed")?.value ?? 0;
                      const failed = payload.find((p) => p.dataKey === "failed")?.value ?? 0;
                      const total = Number(completed) + Number(failed);
                      return (
                        <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700/70 dark:bg-zinc-900">
                          <div className="text-[11px] font-semibold text-slate-700 dark:text-zinc-200">{label}</div>
                          <div className="mt-1 flex flex-col gap-0.5 text-slate-600 dark:text-zinc-300">
                            <span>Completed: {completed}</span>
                            <span>Failed: {failed}</span>
                            <span className="font-medium text-slate-800 dark:text-zinc-100">Total: {total}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stackId="1"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#colorCompleted)"
                    animationDuration={600}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stackId="1"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fill="url(#colorFailed)"
                    animationDuration={600}
                  />
                </AreaChart>
            </div>
            {totalInRange === 0 && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-xs text-slate-500 dark:bg-zinc-900/60 dark:text-slate-400">
                No finished jobs in this range yet.
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/85" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500/85" /> Failed
            </span>
          </div>
        </section>

        {/* —— Insights —— */}
        <section className="p-4 sm:p-5" aria-labelledby="activity-insights-heading">
          <h3
            id="activity-insights-heading"
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Insights
          </h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700 dark:bg-zinc-800/35">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {throughputDelta >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                )}
                Throughput trend
              </div>
              <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                Second half of the range vs first half:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    throughputDelta >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {throughputDelta >= 0 ? "+" : ""}
                  {throughputDelta}%
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                Based on total completed + failed job events in each half of the chart.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700 dark:bg-zinc-800/35">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Busiest bucket
              </div>
              {peakBucket ? (
                <>
                  <p className="mt-2 font-medium text-slate-900 dark:text-slate-100">{peakBucket.label}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                      {peakBucket.completed}
                    </span>{" "}
                    completed
                    {peakBucket.failed > 0 ? (
                      <>
                        ,{" "}
                        <span className="tabular-nums font-medium text-rose-600 dark:text-rose-400">
                          {peakBucket.failed}
                        </span>{" "}
                        failed
                      </>
                    ) : null}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">No data in this range.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-zinc-700 dark:bg-zinc-800/35">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                Top failure message
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                {topFailure ? (
                  <span className="font-mono text-[11px]">{truncateMessage(topFailure)}</span>
                ) : (
                  <span className="text-slate-600 dark:text-slate-400">None in your recent jobs.</span>
                )}
              </p>
              {topFailure ? (
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  Most common error text across all jobs (not only this range). Cross-check failed items in the action
                  panel above.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
