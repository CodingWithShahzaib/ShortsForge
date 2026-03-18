"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Video, TrendingUp, Clock, CheckCircle, AlertCircle, RotateCcw, RefreshCcw, BarChart3, Film, BarChart2, ListTodo, FolderOpen, Plus } from "lucide-react";
import { BentoGrid } from "@/components/ui/bento-grid";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import { api, getMediaUrl } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectListItem, Job } from "@/lib/types";

export default function DashboardPage() {
  const { projects, setProjects, jobs, setJobs } = useProjectStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [range, setRange] = useState<"7" | "30">("7");
  const [preview, setPreview] = useState<{ url: string; x: number; y: number } | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [proj, job] = await Promise.all([
        api.listProjects({ limit: 100 }),
        api.listJobs({ limit: 100 }),
      ]);
      setProjects(proj);
      setJobs(job);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const projectStats = {
    total: projects.length,
    completed: projects.filter((p) => p.status === "completed").length,
    inProgress: projects.filter((p) => p.status === "generating").length,
    failed: projects.filter((p) => p.status === "failed").length,
    activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "in_progress").length,
  };
  const jobStats = {
    total: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    inProgress: jobs.filter((j) => j.status === "in_progress" || j.status === "queued").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "in_progress").length,
  };
  const useJobStatsAsPrimary = projects.length === 0 && jobs.length > 0;
  const stats = useJobStatsAsPrimary ? jobStats : projectStats;

  const projectMap = useMemo(() => {
    const map: Record<string, ProjectListItem> = {};
    for (const p of projects) map[p.id] = p;
    return map;
  }, [projects]);

  const analytics = useMemo(() => {
    const days = range === "7" ? 7 : 30;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const buckets: { label: string; completed: number; failed: number; date: Date }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      buckets.push({ label, completed: 0, failed: 0, date: d });
    }

    let totalDuration = 0;
    let totalProcessingMs = 0;
    let processingCount = 0;
    const byType: Record<string, number> = {};

    for (const job of jobs) {
      if (job.type) byType[job.type] = (byType[job.type] || 0) + 1;
      if (job.status === "completed" && job.result?.duration) {
        totalDuration += Number(job.result.duration);
      }
      if (job.status === "completed" && job.created_at && job.completed_at) {
        const created = parseTimestamp(job.created_at);
        const completed = parseTimestamp(job.completed_at);
        if (created && completed) {
          totalProcessingMs += completed.getTime() - created.getTime();
          processingCount += 1;
        }
      }

      const completedAt = job.status === "completed" ? parseTimestamp(job.completed_at) : null;
      const created = parseTimestamp(job.created_at);
      const ts = (completedAt || created);
      if (!ts || ts < start || ts > end) continue;
      const idx = Math.floor((ts.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      if (buckets[idx]) {
        if (job.status === "completed") buckets[idx].completed += 1;
        else if (job.status === "failed") buckets[idx].failed += 1;
      }
    }

    const completed = jobs.filter((j) => j.status === "completed").length;
    const failed = jobs.filter((j) => j.status === "failed").length;
    const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 100;
    const maxCount = Math.max(1, ...buckets.map((b) => b.completed + b.failed));
    const avgProcessingMin = processingCount > 0 ? Math.round(totalProcessingMs / processingCount / 60000) : 0;

    return {
      buckets,
      maxCount,
      successRate,
      totalDurationMin: Math.round(totalDuration / 60),
      byType,
      avgProcessingMin,
      totalInRange: buckets.reduce((sum, b) => sum + b.completed + b.failed, 0),
    };
  }, [jobs, range]);

  const handleRetry = async (id: string) => {
    try {
      await api.retryProject(id);
      const updated = await api.listProjects({ limit: 10 });
      setProjects(updated);
    } catch {}
  };

  const updatePreviewPosition = (evt: React.MouseEvent) => {
    if (!preview) return;
    const padding = 16;
    const width = 280;
    const height = 170;
    const maxX = window.innerWidth - width - padding;
    const maxY = window.innerHeight - height - padding;
    const x = Math.min(maxX, Math.max(padding, evt.clientX + 16));
    const y = Math.min(maxY, Math.max(padding, evt.clientY + 16));
    setPreview((p) => (p ? { ...p, x, y } : p));
  };

  return (
    <div className="space-y-10 text-slate-900 dark:text-slate-100 w-full">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Pulse</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">From script to reel in minutes.</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">At a glance</span>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Button variant="ghost" size="icon" onClick={fetchDashboard} disabled={loading} title="Refresh">
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <BentoGrid
        items={[
          {
            title: useJobStatsAsPrimary ? "Total Jobs" : "Total Projects",
            meta: String(stats.total),
            description: "All projects and generation jobs in your workspace",
            icon: <Video className="w-4 h-4 text-cyan-500" />,
            accentColor: "cyan",
            status: "Live",
            tags: ["Overview", "Workspace"],
            colSpan: 2,
            hasPersistentHover: true,
          },
          {
            title: "Completed",
            meta: String(stats.completed),
            description: "Successfully finished generations",
            icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
            accentColor: "emerald",
            status: "Active",
            tags: ["Success", "Done"],
          },
          {
            title: "In Progress",
            meta: String(stats.inProgress),
            description: "Currently generating or queued",
            icon: <Clock className="w-4 h-4 text-amber-500" />,
            accentColor: "amber",
            status: stats.inProgress > 0 ? "Running" : "Idle",
            tags: ["Queue", "Processing"],
          },
          {
            title: "Failed",
            meta: String(stats.failed),
            description: "Jobs that encountered errors",
            icon: <AlertCircle className="w-4 h-4 text-rose-500" />,
            accentColor: "rose",
            status: stats.failed > 0 ? "Needs attention" : "Clear",
            tags: ["Errors", "Retry"],
            colSpan: 2,
          },
          {
            title: "Success Rate",
            meta: `${analytics.successRate}%`,
            description: "Percentage of finished jobs completed successfully",
            icon: <BarChart3 className="w-4 h-4 text-emerald-500" />,
            accentColor: "emerald",
            status: analytics.successRate >= 90 ? "Healthy" : "Review",
            tags: ["Analytics", "Quality"],
          },
          {
            title: "Content Produced",
            meta: `${analytics.totalDurationMin} min`,
            description: "Total video runtime from completed generations",
            icon: <Film className="w-4 h-4 text-violet-500" />,
            accentColor: "violet",
            status: "Active",
            tags: ["Video", "Output"],
          },
          {
            title: "Avg. Processing",
            meta: `${analytics.avgProcessingMin}m`,
            description: "Average time per completed job",
            icon: <TrendingUp className="w-4 h-4 text-sky-500" />,
            accentColor: "sky",
            status: "Metrics",
            tags: ["Performance", "Speed"],
          },
        ]}
      />

      {error && (
        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      {!loading && !error && projects.length === 0 && jobs.length === 0 && (
        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)] text-center">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
            <Video className="w-6 h-6 text-cyan-500" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">No data yet. Create a project or start a generation to see dashboard stats.</p>
          <Link href="/generate">
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Create project
            </Button>
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 overflow-hidden transition-all duration-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex flex-row items-center justify-between p-6">
          <h3 className="text-2xl font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-cyan-500" />
            Analytics
          </h3>
          <div className="flex gap-2">
            <Button variant={range === "7" ? "default" : "outline"} size="sm" onClick={() => setRange("7")}>Last 7 days</Button>
            <Button variant={range === "30" ? "default" : "outline"} size="sm" onClick={() => setRange("30")}>Last 30 days</Button>
          </div>
        </div>
        <div className="p-6 pt-0 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Success Rate</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{analytics.successRate}%</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">of finished jobs completed</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 dark:from-cyan-500/20 dark:to-cyan-500/10">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Content Produced</p>
              <p className="text-2xl font-bold tabular-nums text-cyan-600 dark:text-cyan-400 mt-1">{analytics.totalDurationMin} min</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">total video runtime</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 bg-gradient-to-br from-violet-500/10 to-violet-500/5 dark:from-violet-500/20 dark:to-violet-500/10">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Avg. Processing</p>
              <p className="text-2xl font-bold tabular-nums text-violet-600 dark:text-violet-400 mt-1">{analytics.avgProcessingMin}m</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">per completed job</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 bg-slate-50/80 dark:bg-zinc-800/70">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">By Type</p>
              <div className="mt-2 space-y-1">
                {Object.entries(analytics.byType).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400 capitalize">{type.replace(/_/g, " ")}</span>
                    <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{count}</span>
                  </div>
                ))}
                {Object.keys(analytics.byType).length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No jobs yet</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Activity</p>
            <div className="relative h-24">
              <div className="h-24 flex items-end gap-1">
                {analytics.buckets.map((b) => {
                  const total = b.completed + b.failed;
                  const barHeightPct = analytics.maxCount > 0 ? Math.max(15, (total / analytics.maxCount) * 100) : 15;
                  const completedPct = total > 0 ? (b.completed / total) * 100 : 0;
                  const failedPct = total > 0 ? (b.failed / total) * 100 : 0;
                  return (
                    <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5 group" title={`${b.label}: ${b.completed} completed, ${b.failed} failed`}>
                      <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: "80px" }}>
                        {total > 0 ? (
                          <div className="w-full flex flex-col-reverse" style={{ height: `${barHeightPct}%`, minHeight: "10px" }}>
                            {b.failed > 0 && (
                              <div className="w-full bg-rose-500/80 group-hover:bg-rose-500 transition-colors" style={{ height: `${failedPct}%`, minHeight: "2px" }} />
                            )}
                            {b.completed > 0 && (
                              <div className="w-full bg-emerald-500/80 group-hover:bg-emerald-500 transition-colors" style={{ height: `${completedPct}%`, minHeight: "2px" }} />
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-2 rounded-t bg-slate-200/80 dark:bg-zinc-800/80" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{b.label}</span>
                    </div>
                  );
                })}
              </div>
              {analytics.totalInRange === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No activity in selected range.
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/80" /> Completed</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500/80" /> Failed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
      <div className="flex-1 min-w-0 rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 overflow-hidden transition-all duration-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex flex-row items-center justify-between p-6">
          <h3 className="text-2xl font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-cyan-500" />
            Queue
          </h3>
          {jobs.length > 0 && (
            <Link href="/history">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          )}
        </div>
        <div className="p-6 pt-0">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-700 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-32 bg-slate-200 dark:bg-zinc-800/80 rounded" />
                      <div className="h-3 w-24 bg-slate-200 dark:bg-zinc-800/80 rounded" />
                    </div>
                    <div className="h-4 w-8 bg-slate-200 dark:bg-zinc-800/80 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800/80 flex items-center justify-center mx-auto mb-4">
                <ListTodo className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No recent jobs yet.</p>
              <Link href="/generate">
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.slice(0, 5).map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  projectTitle={job.project_id ? projectMap[job.project_id]?.title : undefined}
                  onPreviewStart={(url, evt) => {
                    const padding = 16;
                    const width = 280;
                    const height = 170;
                    const maxX = window.innerWidth - width - padding;
                    const maxY = window.innerHeight - height - padding;
                    const x = Math.min(maxX, Math.max(padding, evt.clientX + 16));
                    const y = Math.min(maxY, Math.max(padding, evt.clientY + 16));
                    setPreview({ url, x, y });
                  }}
                  onPreviewMove={updatePreviewPosition}
                  onPreviewEnd={() => setPreview(null)}
                  onRetry={async () => {
                    setRetryingJobId(job.id);
                    try {
                      const newJob = await api.retryJob(job.id);
                      useProjectStore.getState().addJob(newJob);
                      await fetchDashboard();
                    } catch (e: any) {
                      alert(e?.message || "Retry failed");
                    } finally {
                      setRetryingJobId(null);
                    }
                  }}
                  retrying={retryingJobId === job.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 overflow-hidden transition-all duration-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex flex-row items-center justify-between p-6">
          <h3 className="text-2xl font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-cyan-500" />
            Recent
          </h3>
          <Link href="/projects">
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </div>
        <div className="p-6 pt-0">
          {projects.length === 0 ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800/80 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No projects yet.</p>
              <Link href="/generate">
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <div key={project.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-zinc-700 hover:bg-slate-50/80 dark:hover:bg-zinc-800/70 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 transition-all duration-200">
                  <Link href={`/projects/${project.id}`} className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{project.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{project.story_type} &middot; {project.scene_count} scenes</p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={project.status} />
                    {project.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => handleRetry(project.id)} title="Retry">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      {preview && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: preview.x, top: preview.y }}
        >
          <div className="w-[280px] h-[170px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-zinc-700 bg-black shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            <video
              key={preview.url}
              src={preview.url}
              muted
              loop
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              onLoadedData={undefined}
              onError={undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function extractMediaPath(raw: string): string {
  if (!raw || typeof raw !== "string" || !raw.startsWith("http")) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "";
    const mediaRoots = ["images", "videos", "audio", "music"];
    if (parts[0] === "media" && parts[1]) return parts.slice(1).join("/");
    if (mediaRoots.includes(parts[0])) return parts.join("/");
    if (parts[1] && mediaRoots.includes(parts[1])) return parts.slice(1).join("/");
    return "";
  } catch {
    return "";
  }
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num > 1e12 ? num : num * 1000;
      const dt = new Date(ms);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(trimmed);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function JobRow({
  job,
  projectTitle,
  onPreviewStart,
  onPreviewMove,
  onPreviewEnd,
  onRetry,
  retrying,
}: {
  job: Job;
  projectTitle?: string;
  onPreviewStart: (url: string, evt: React.MouseEvent) => void;
  onPreviewMove: (evt: React.MouseEvent) => void;
  onPreviewEnd: () => void;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
}) {
  const previewPath = (job.result?.video_path || "") as string;
  const rawPreview = (job.result?.video_url || job.result?.video_path || "") as string;
  const created = parseTimestamp(job.created_at);
  return (
    <div
      className="group relative flex items-center justify-between p-4 rounded-xl border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 transition-all duration-200"
      onMouseEnter={(evt) => {
        const rawPath = previewPath || rawPreview;
        const derivedPath = previewPath || extractMediaPath(rawPath);
        if (rawPath) {
          if (derivedPath) {
            api.getMediaUrl(derivedPath)
              .then((res) => {
                onPreviewStart(res.url, evt);
              })
              .catch(() => {});
          } else if (rawPath.startsWith("http")) {
            onPreviewStart(rawPath, evt);
          } else {
            const fallback = getMediaUrl(rawPath);
            if (fallback) onPreviewStart(fallback, evt);
          }
        }
      }}
      onMouseMove={onPreviewMove}
      onMouseLeave={onPreviewEnd}
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{job.type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
          <StatusBadge status={job.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {created && <span>{created.toLocaleString()}</span>}
          {projectTitle && (
            <Link href={`/projects/${job.project_id}`} className="text-cyan-600 dark:text-cyan-400 hover:underline">
              {projectTitle}
            </Link>
          )}
        </div>
        {(job.status === "in_progress" || job.status === "queued") && (
          <LinearProgress value={job.progress} className="mt-1 h-1.5" />
        )}
      </div>
      <div className="flex items-center gap-2">
        {job.status === "failed" && onRetry && (
          <Button variant="outline-animated" size="sm" onClick={(e) => { e.stopPropagation(); onRetry(); }} disabled={retrying ?? false} title="Retry">
            {(retrying ?? false) ? <><div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" /> Retrying...</> : <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry</>}
          </Button>
        )}
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{job.progress}%</span>
      </div>
    </div>
  );
}

