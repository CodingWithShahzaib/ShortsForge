"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, History, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { useProjectStore } from "@/stores/projectStore";
import { useDeleteFailedJobMutation, useJobsQuery, useRetryJobMutation } from "@/lib/queries";
import type { Job } from "@/lib/types";
import { appConfirm } from "@/stores/confirmDialogStore";
import { HistoryJobsSkeleton } from "@/components/ui/content-skeletons";
import { JobCard } from "@/components/job-card";

export default function HistoryPage() {
  const { jobs, setJobs } = useProjectStore();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<"all" | "7d" | "30d">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "progress">("newest");
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const { data: fetchedJobs, isLoading: loading, error } = useJobsQuery();
  const retryJobMutation = useRetryJobMutation();
  const deleteFailedJobMutation = useDeleteFailedJobMutation();

  useEffect(() => {
    if (fetchedJobs) setJobs(fetchedJobs);
  }, [fetchedJobs, setJobs]);

  const stats = useMemo(() => {
    const totals = {
      total: jobs.length,
      completed: 0,
      in_progress: 0,
      failed: 0,
      queued: 0,
    };

    for (const job of jobs) {
      if (job.status === "completed") totals.completed += 1;
      else if (job.status === "in_progress") totals.in_progress += 1;
      else if (job.status === "failed") totals.failed += 1;
      else if (job.status === "queued") totals.queued += 1;
    }

    const completionRate = totals.total
      ? Math.round((totals.completed / totals.total) * 100)
      : 0;
    const averageProgress = totals.total
      ? Math.round(jobs.reduce((sum, job) => sum + job.progress, 0) / totals.total)
      : 0;

    return { ...totals, completionRate, averageProgress };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      range === "7d" ? now - 7 * 24 * 60 * 60 * 1000
        : range === "30d" ? now - 30 * 24 * 60 * 60 * 1000
        : null;

    const filtered = jobs.filter((job) => {
      if (filter !== "all" && job.status !== filter) return false;
      if (cutoff && new Date(job.created_at).getTime() < cutoff) return false;
      if (!normalized) return true;

      const searchable = [
        job.type,
        job.status,
        job.id,
        job.project_id ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalized);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === "progress") {
        if (b.progress !== a.progress) return b.progress - a.progress;
      }
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return sorted;
  }, [jobs, filter, query, range, sort]);

  const groupedJobs = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const todayKey = new Date().toDateString();
    const yesterdayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
    const groups = new Map<string, { label: string; jobs: Job[] }>();

    for (const job of visibleJobs) {
      const date = new Date(job.created_at);
      const key = date.toDateString();
      const label = key === todayKey
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : formatter.format(date);

      if (!groups.has(key)) {
        groups.set(key, { label, jobs: [] });
      }
      groups.get(key)?.jobs.push(job);
    }

    return Array.from(groups.values());
  }, [visibleJobs]);

  const handleRetry = async (jobId: string) => {
    try {
      await retryJobMutation.mutateAsync(jobId);
      notify.success("Retry added to queue");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Retry failed";
      notify.error(message);
    }
  };

  const handleDeleteFailed = async (jobId: string) => {
    const ok = await appConfirm({
      title: "Delete failed job?",
      description:
        "This removes the failed job and its project (scenes, assets, and related jobs). This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingJobId(jobId);
    try {
      await deleteFailedJobMutation.mutateAsync(jobId);
      notify.success("Deleted");
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingJobId(null);
    }
  };

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8 text-cyan-500" />
            Activity
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {visibleJobs.length} tasks • {stats.completionRate}% complete
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            Live updates
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-border/60 bg-linear-to-br from-cyan-500/10 via-transparent to-transparent">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total tasks</p>
            <div className="mt-2 text-3xl font-semibold">{stats.total}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stats.averageProgress}% average progress
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border/60">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed</p>
            <div className="mt-2 text-3xl font-semibold text-emerald-500">{stats.completed}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Done and ready to ship</p>
          </CardContent>
        </Card>
        <Card className="border border-border/60">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">In progress</p>
            <div className="mt-2 flex items-center gap-2 text-3xl font-semibold text-cyan-500">
              {stats.in_progress}
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/10">
                <Sparkles className="h-4 w-4 text-cyan-500 motion-safe:animate-pulse" />
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Actively running now</p>
          </CardContent>
        </Card>
        <Card className="border border-border/60">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Needs attention</p>
            <div className="mt-2 text-3xl font-semibold text-rose-500">{stats.failed}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stats.queued} queued</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by type, status, or task ID"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </div>
              <Select value={filter} onValueChange={(value) => setFilter(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <CalendarDays className="h-4 w-4" />
                Range
              </div>
              <Select value={range} onValueChange={(value) => setRange(value as typeof range)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <SlidersHorizontal className="h-4 w-4" />
                Sort
              </div>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="progress">Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "All", count: stats.total },
              { value: "completed", label: "Completed", count: stats.completed },
              { value: "in_progress", label: "In progress", count: stats.in_progress },
              { value: "failed", label: "Failed", count: stats.failed },
              { value: "queued", label: "Queued", count: stats.queued },
            ].map((item) => (
              <Button
                key={item.value}
                variant={filter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                <span className="ml-1 text-xs text-muted-foreground">{item.count}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <HistoryJobsSkeleton rows={7} />
      ) : error ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
            {(error as Error).message || "Could not load activity"}
          </CardContent>
        </Card>
      ) : visibleJobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <div className="text-lg font-semibold text-slate-700 dark:text-slate-200">No activity found</div>
            <div className="text-sm">Try a different filter or start a new generation.</div>
            <Button asChild variant="animated">
              <Link href="/generate">Start generating</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedJobs.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group.label}
              </div>
              <div className="space-y-2">
                {group.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    variant="log"
                    onRetry={async () => { await handleRetry(job.id); }}
                    retrying={retryJobMutation.isPending}
                    onDelete={async () => { await handleDeleteFailed(job.id); }}
                    deleting={deletingJobId === job.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
