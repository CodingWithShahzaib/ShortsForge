"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Video,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ListTodo,
  FolderOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectListItem } from "@/lib/types";
import { notify } from "@/lib/notify";
import {
  useDashboardSummaryQuery,
  useJobsQuery,
  useProjectsQuery,
  useRetryJobMutation,
  useRetryProjectMutation,
  useDeleteFailedJobMutation,
  useDeleteProjectMutation,
  useYoutubeChannelStatsQuery,
  useYoutubeChannelsQuery,
  queryKeys,
} from "@/lib/queries";
import {
  aggregateActivityBucketsForDisplay,
  buildActivityBuckets,
  computeDashboardMetrics,
  computeDelta,
  type DashboardRange,
} from "@/lib/dashboard-metrics";
import { PulseMetricsStrip } from "@/components/dashboard/pulse-metrics-strip";
import { PulseHero21st } from "@/components/dashboard/pulse-hero-21st";
import type { StatCardItem21st } from "@/components/dashboard/stats-cards-21st";
import { ActionCenter21st } from "@/components/dashboard/action-center-21st";
import { AnalyticsPanel21st } from "@/components/dashboard/analytics-panel-21st";
import { WorkTabs21st, type WorkTabId } from "@/components/dashboard/work-tabs-21st";
import { YoutubeChannelPanel21st } from "@/components/dashboard/youtube-channel-panel-21st";
import { NextActionPanel, type NextActionItem } from "@/components/dashboard/next-action-panel";
import { DraftsPanel } from "@/components/dashboard/drafts-panel";
import { PublishStatusPanel } from "@/components/dashboard/publish-status-panel";
import { QuickStartsPanel } from "@/components/dashboard/quick-starts-panel";
import { RecentWinPanel } from "@/components/dashboard/recent-win-panel";
import { JobCard } from "@/components/job-card";
import { ProjectCard } from "@/components/project-card";
import { DashboardJobRowSkeleton } from "@/components/ui/content-skeletons";
import { motion } from "framer-motion";
import { appConfirm } from "@/stores/confirmDialogStore";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardPage() {
  const { projects, setProjects, jobs, setJobs } = useProjectStore();
  const [range, setRange] = useState<DashboardRange>("7");
  const [workTab, setWorkTab] = useState<WorkTabId>("queue");
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [retryingProjectId, setRetryingProjectId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [ytChannelId, setYtChannelId] = useState<string | null>(null);
  const { data: fetchedProjects, isLoading: loadingProjects, error: projectsError } = useProjectsQuery();
  const { data: fetchedJobs, isLoading: loadingJobs, error: jobsError } = useJobsQuery();
  const { data: summary } = useDashboardSummaryQuery();
  const { data: ytChannelsStatus } = useYoutubeChannelsQuery();
  const ytChannels = ytChannelsStatus?.channels || [];
  const ytConnected = ytChannelsStatus?.connected ?? false;
  const ytDefaultId =
    ytChannelsStatus?.default_channel_id ||
    ytChannels.find((c) => c.is_default)?.channel_id ||
    ytChannels[0]?.channel_id ||
    null;
  const {
    data: ytChannelStats,
    isLoading: ytStatsLoading,
    isFetching: ytStatsFetching,
    isError: ytStatsError,
  } = useYoutubeChannelStatsQuery(ytChannelId || ytDefaultId || undefined);
  const retryJobMutation = useRetryJobMutation();
  const retryProjectMutation = useRetryProjectMutation();
  const deleteFailedJobMutation = useDeleteFailedJobMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const queryClient = useQueryClient();
  const loading = loadingProjects || loadingJobs;
  const error = projectsError || jobsError;

  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
    if (fetchedJobs) setJobs(fetchedJobs);
  }, [fetchedProjects, fetchedJobs, setProjects, setJobs]);

  useEffect(() => {
    if (!ytChannelId && ytDefaultId) setYtChannelId(ytDefaultId);
  }, [ytChannelId, ytDefaultId]);


  const metrics = useMemo(() => computeDashboardMetrics(projects, jobs), [projects, jobs]);

  const projectMap = useMemo(() => {
    const map: Record<string, ProjectListItem> = {};
    for (const p of projects) map[p.id] = p;
    return map;
  }, [projects]);

  const analytics = useMemo(() => {
    const daily = buildActivityBuckets(jobs, range);
    const buckets = aggregateActivityBucketsForDisplay(daily, range);
    const maxCount = Math.max(1, ...buckets.map((b) => b.completed + b.failed));
    const splitPoint = Math.floor(buckets.length / 2);
    const previousCount = buckets.slice(0, splitPoint).reduce((acc, b) => acc + b.completed + b.failed, 0);
    const currentCount = buckets.slice(splitPoint).reduce((acc, b) => acc + b.completed + b.failed, 0);
    return {
      buckets,
      maxCount,
      throughputDelta: computeDelta(currentCount, previousCount),
      totalInRange: buckets.reduce((sum, b) => sum + b.completed + b.failed, 0),
    };
  }, [jobs, range]);

  const statItems: StatCardItem21st[] = useMemo(
    () => [
      {
        id: "progress",
        label: "In progress",
        value: String(metrics.inProgressProjects),
        hint: "Generating or queued",
        icon: <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
        accent: "amber",
      },
      {
        id: "completed",
        label: "Completed",
        value: String(metrics.completedProjects),
        hint: "Successfully finished generations",
        icon: <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
        accent: "emerald",
      },
      {
        id: "failed",
        label: "Failed",
        value: String(metrics.failedProjects),
        hint: "Need attention or retry",
        icon: <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
        accent: "rose",
      },
      {
        id: "avg",
        label: "Avg. processing",
        value: `${metrics.avgProcessingMin}m`,
        hint: "Per completed job",
        icon: <TrendingUp className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
        accent: "sky",
      },
    ],
    [metrics]
  );

  const handleRetry = async (id: string) => {
    try {
      setRetryingProjectId(id);
      await retryProjectMutation.mutateAsync(id);
      notify.success("Retry queued");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Retry failed";
      notify.error(message);
    } finally {
      setRetryingProjectId(null);
    }
  };

  const handleDeleteFailedJob = async (jobId: string) => {
    const ok = await appConfirm({
      title: "Delete failed job?",
      description:
        "This removes the failed job and its project (scenes, assets, and all related jobs). This cannot be undone.",
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

  const handleDeleteFailedProject = async (projectId: string) => {
    const ok = await appConfirm({
      title: "Delete failed project?",
      description: "This removes the project and all of its data. This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingProjectId(projectId);
    try {
      await deleteProjectMutation.mutateAsync(projectId);
      notify.success("Project deleted");
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const { failedJobsSlice, failedProjectsSlice } = useMemo(() => {
    const failedJobsList = jobs.filter((j) => j.status === "failed");
    const projectIdsWithFailedJob = new Set<string>();
    for (const j of failedJobsList) {
      if (j.project_id) projectIdsWithFailedJob.add(j.project_id);
    }
    return {
      failedJobsSlice: failedJobsList.slice(0, 3),
      failedProjectsSlice: projects
        .filter((p) => p.status === "failed" && !projectIdsWithFailedJob.has(p.id))
        .slice(0, 3),
    };
  }, [jobs, projects]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [projects]
  );

  const draftProjects = useMemo(
    () => sortedProjects.filter((p) => p.status !== "completed").slice(0, 3),
    [sortedProjects]
  );

  const completedProjects = useMemo(
    () => sortedProjects.filter((p) => p.status === "completed").slice(0, 3),
    [sortedProjects]
  );

  const recentWin = completedProjects[0] ?? null;

  const activeJobsCount =
    summary?.jobs != null
      ? summary.jobs.in_progress + summary.jobs.queued
      : jobs.filter((j) => j.status === "in_progress" || j.status === "queued").length;

  const lastUpdatedLabel =
    summary && "last_updated" in summary && summary.last_updated
      ? `Updated ${new Date(summary.last_updated).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`
      : null;

  const refreshDashboard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary }),
    ]);
  };

  const nextActions: NextActionItem[] = useMemo(() => {
    const items: NextActionItem[] = [];
    const failedCount = failedJobsSlice.length + failedProjectsSlice.length;
    if (failedCount > 0) {
      items.push({
        id: "fix-failures",
        title: "Resolve failed items",
        description: `${failedCount} failed item${failedCount === 1 ? "" : "s"} need attention.`,
        ctaLabel: "Open action center",
        href: "#needs-attention",
      });
    }
    if (activeJobsCount > 0) {
      items.push({
        id: "track-jobs",
        title: "Track active jobs",
        description: `${activeJobsCount} job${activeJobsCount === 1 ? "" : "s"} running or queued.`,
        ctaLabel: "View activity",
        href: "/history",
      });
    }
    if (projects.length === 0) {
      items.push({
        id: "first-project",
        title: "Create your first project",
        description: "Start with a script or idea to generate your first short.",
        ctaLabel: "Start now",
        href: "/generate",
      });
    }
    if (items.length === 0) {
      items.push({
        id: "new-project",
        title: "Start a fresh project",
        description: "Keep your momentum with a new idea or script.",
        ctaLabel: "New project",
        href: "/generate",
      });
    }
    return items.slice(0, 2);
  }, [activeJobsCount, failedJobsSlice.length, failedProjectsSlice.length, projects.length]);

  return (
    <div className="min-w-0 w-full max-w-none space-y-5 text-slate-900 dark:text-slate-100">
      <PulseHero21st
        title="Pulse"
        subtitle="From script to reel in minutes."
        activeJobsLabel={`${activeJobsCount} active job${activeJobsCount === 1 ? "" : "s"}`}
        lastUpdatedLabel={lastUpdatedLabel}
        loading={loading}
        onRefresh={refreshDashboard}
      />
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 dark:border-rose-900/50 dark:bg-rose-950/30"
        >
          <p className="text-sm text-rose-700 dark:text-rose-300">
            {(error as Error).message || "Failed to load dashboard data."}
          </p>
        </motion.div>
      )}

      {!loading && !error && projects.length === 0 && jobs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 px-6 py-14 text-center shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-zinc-700/80 dark:bg-zinc-900/80"
        >
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.12), transparent 55%), radial-gradient(circle at 80% 0%, rgba(14,165,233,0.14), transparent 45%), radial-gradient(circle at 50% 120%, rgba(34,211,238,0.12), transparent 55%)",
            }}
          />
          <div className="relative flex flex-col items-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/50 bg-linear-to-br from-cyan-500/20 via-sky-500/10 to-transparent dark:border-cyan-500/30 dark:from-cyan-500/20">
              <Video className="h-7 w-7 text-cyan-600 dark:text-cyan-300" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              Your studio is ready
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              No data yet. Create a project or start a generation to see insights, activity, and wins.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild className="gap-2 rounded-xl">
                <Link href="/generate">
                  <Plus className="h-4 w-4" />
                  Create project
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2 rounded-xl">
                <Link href="/scripts">
                  <Video className="h-4 w-4" />
                  Explore scripts
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {(!error && (projects.length > 0 || jobs.length > 0)) || loading ? (
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,34vw)] xl:items-start xl:gap-x-4 2xl:gap-x-6">
          <div className="min-w-0 space-y-4">
            <NextActionPanel items={nextActions} />

            <RecentWinPanel project={recentWin} />

            <PulseMetricsStrip items={statItems} />

            <DraftsPanel projects={draftProjects} />

            <div id="needs-attention">
              <ActionCenter21st
                failedJobs={failedJobsSlice.map((job) => ({
                  id: job.id,
                  title:
                    job.project_id && projectMap[job.project_id]?.title
                      ? projectMap[job.project_id].title
                      : job.type.replace(/_/g, " "),
                  subtitle: "Job failed — retry to continue",
                  retrying: retryingJobId === job.id,
                  deleting: deletingJobId === job.id,
                  onRetry: async () => {
                    setRetryingJobId(job.id);
                    try {
                      await retryJobMutation.mutateAsync(job.id);
                      notify.success("Retry queued");
                    } catch (e: unknown) {
                      notify.error(e instanceof Error ? e.message : "Retry failed");
                    } finally {
                      setRetryingJobId(null);
                    }
                  },
                  onDelete: () => handleDeleteFailedJob(job.id),
                }))}
                failedProjects={failedProjectsSlice.map((project) => ({
                  id: project.id,
                  title: project.title,
                  subtitle: "Project failed — retry render",
                  retrying: retryingProjectId === project.id,
                  deleting: deletingProjectId === project.id,
                  onRetry: () => handleRetry(project.id),
                  onDelete: () => handleDeleteFailedProject(project.id),
                }))}
              />
            </div>

            <PublishStatusPanel projects={completedProjects} youtubeConnected={ytConnected} />

            {ytConnected && (
              <YoutubeChannelPanel21st
                data={ytChannelStats}
                isLoading={ytStatsLoading}
                isFetching={ytStatsFetching}
                isError={ytStatsError}
                channels={ytChannels}
                activeChannelId={ytChannelId || ytDefaultId || undefined}
                onSelectChannel={(id) => setYtChannelId(id)}
              />
            )}

            <details className="rounded-xl border border-slate-200/80 bg-white/80 p-3 text-sm text-slate-600 dark:border-zinc-700/90 dark:bg-zinc-900/80 dark:text-slate-300">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Activity insights
              </summary>
              <div className="mt-3">
                <AnalyticsPanel21st
                  range={range}
                  onRangeChange={setRange}
                  buckets={analytics.buckets}
                  maxCount={analytics.maxCount}
                  totalInRange={analytics.totalInRange}
                  throughputDelta={analytics.throughputDelta}
                  topFailure={metrics.topFailureReason}
                />
              </div>
            </details>
          </div>

          <aside className="min-w-0 xl:sticky xl:top-3 xl:self-start xl:min-h-0">
            <QuickStartsPanel className="mb-4" />
            <WorkTabs21st
              className="w-full min-h-0"
              active={workTab}
              onChange={setWorkTab}
              queueCount={jobs.length}
              recentCount={projects.length}
              queueLink={
                jobs.length > 0 ? (
                  <Link href="/history">
                    <Button variant="ghost" size="sm" className="rounded-lg text-cyan-600 dark:text-cyan-400">
                      View all activity
                    </Button>
                  </Link>
                ) : null
              }
              recentLink={
                <Link href="/projects">
                  <Button variant="ghost" size="sm" className="rounded-lg text-cyan-600 dark:text-cyan-400">
                    Open library
                  </Button>
                </Link>
              }
            >
            {workTab === "queue" ? (
              <>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <DashboardJobRowSkeleton key={i} />
                    ))}
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                      <ListTodo className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">No recent jobs yet.</p>
                    <Button asChild variant="outline" size="sm" className="mt-4 gap-2 rounded-xl">
                      <Link href="/generate">
                        <Plus className="h-4 w-4" />
                        Create project
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobs.slice(0, 8).map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        projectTitle={job.project_id ? projectMap[job.project_id]?.title : undefined}
                        onRetry={async () => {
                          setRetryingJobId(job.id);
                          try {
                            await retryJobMutation.mutateAsync(job.id);
                            notify.success("Retry queued");
                          } catch (e: unknown) {
                            notify.error(e instanceof Error ? e.message : "Retry failed");
                          } finally {
                            setRetryingJobId(null);
                          }
                        }}
                        retrying={retryingJobId === job.id}
                        onDelete={() => handleDeleteFailedJob(job.id)}
                        deleting={deletingJobId === job.id}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {projects.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                      <FolderOpen className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet.</p>
                    <Button asChild variant="outline" size="sm" className="mt-4 gap-2 rounded-xl">
                      <Link href="/generate">
                        <Plus className="h-4 w-4" />
                        Create project
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {projects.slice(0, 8).map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onRetry={(id) => handleRetry(id)}
                        onDelete={(id) => handleDeleteFailedProject(id)}
                        retrying={retryingProjectId === project.id}
                        deleting={deletingProjectId === project.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
            </WorkTabs21st>
          </aside>
        </div>
      ) : null}

    </div>
  );
}
