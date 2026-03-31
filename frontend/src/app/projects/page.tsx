"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  FolderOpen,
  Plus,
  Search,
  RotateCcw,
  StopCircle,
  Trash2,
  XSquare,
  Youtube,
  ExternalLink,
  Upload,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectCard, ProjectCardSkeleton } from "@/components/project-card";
import { notify } from "@/lib/notify";
import { api, type YouTubeChannelsStatus } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { appConfirm } from "@/stores/confirmDialogStore";
import type { ProjectListItem } from "@/lib/types";
import { useCancelProjectMutation, useDeleteProjectMutation, useProjectsLibraryQuery, useRetryProjectActionMutation } from "@/lib/queries";

type SortKey = "newest" | "oldest" | "title_asc" | "scene_desc";
type SceneBucket = "all" | "small" | "medium" | "large";
type DateRange = "all" | "7d" | "30d" | "90d";
/** "active" = generating / in_progress / queued on the project record */
type StatusFilterKey =
  | "all"
  | "active"
  | "failed"
  | "ready_for_edit"
  | "ready_for_compile"
  | "completed"
  | "draft";

const ACTIVE_STATUSES = new Set(["generating", "in_progress", "queued"]);
const STATUS_FILTER_OPTIONS = [
  { key: "all" as const, label: "All" },
  { key: "active" as const, label: "Running" },
  { key: "failed" as const, label: "Failed" },
  { key: "ready_for_edit" as const, label: "Ready to review" },
  { key: "ready_for_compile" as const, label: "Ready to compile" },
  { key: "completed" as const, label: "Completed" },
  { key: "draft" as const, label: "Draft" },
];

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function projectMatchesStatus(p: ProjectListItem, key: StatusFilterKey): boolean {
  if (key === "all") return true;
  if (key === "active") return ACTIVE_STATUSES.has(p.status);
  return p.status === key;
}

export default function ProjectsPage() {
  const { projects, setProjects } = useProjectStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("all");
  const [storyTypeFilter, setStoryTypeFilter] = useState<string>("all");
  const [sceneBucket, setSceneBucket] = useState<SceneBucket>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ytStatus, setYtStatus] = useState<YouTubeChannelsStatus | null>(null);
  const [ytDialogProject, setYtDialogProject] = useState<ProjectListItem | null>(null);
  const [ytJobId, setYtJobId] = useState<string | null>(null);
  const [ytForm, setYtForm] = useState({ title: "", description: "", tags: "", privacy: "private" });
  const [ytChannelId, setYtChannelId] = useState<string | null>(null);
  const [ytUploading, setYtUploading] = useState(false);
  const [ytGenerating, setYtGenerating] = useState(false);
  const [ytResult, setYtResult] = useState<{ youtube_video_id: string; youtube_url: string } | null>(null);
  const { data: fetchedProjects, isLoading: loading } = useProjectsLibraryQuery();
  const deleteProjectMutation = useDeleteProjectMutation();
  const retryProjectMutation = useRetryProjectActionMutation();
  const cancelProjectMutation = useCancelProjectMutation();

  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
  }, [fetchedProjects, setProjects]);

  useEffect(() => {
    api.youtubeChannels().then(setYtStatus).catch(() => {});
  }, []);

  const ytChannels = ytStatus?.channels || [];
  const defaultYtChannelId =
    ytStatus?.default_channel_id ||
    ytChannels.find((c) => c.is_default)?.channel_id ||
    ytChannels[0]?.channel_id ||
    null;
  const activeYtChannel =
    ytChannels.find((c) => c.channel_id === ytChannelId) ||
    (defaultYtChannelId
      ? ytChannels.find((c) => c.channel_id === defaultYtChannelId)
      : undefined);

  const storyTypes = useMemo(
    () =>
      ["all", ...Array.from(new Set(projects.map((p) => (p.story_type || "").trim()).filter(Boolean))).sort()],
    [projects]
  );

  const statusCounts = useMemo(() => {
    const c: Record<StatusFilterKey, number> = {
      all: projects.length,
      active: 0,
      failed: 0,
      ready_for_edit: 0,
      ready_for_compile: 0,
      completed: 0,
      draft: 0,
    };
    for (const p of projects) {
      if (ACTIVE_STATUSES.has(p.status)) c.active += 1;
      else if (p.status === "failed") c.failed += 1;
      else if (p.status === "ready_for_edit") c.ready_for_edit += 1;
      else if (p.status === "ready_for_compile") c.ready_for_compile += 1;
      else if (p.status === "completed") c.completed += 1;
      else if (p.status === "draft") c.draft += 1;
    }
    return c;
  }, [projects]);

  const secondaryFilterCount =
    (storyTypeFilter !== "all" ? 1 : 0) + (sceneBucket !== "all" ? 1 : 0) + (dateRange !== "all" ? 1 : 0);

  const hasNonDefaultFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    secondaryFilterCount > 0 ||
    sortBy !== "newest";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sceneMatch = (p: ProjectListItem) => {
      if (sceneBucket === "all") return true;
      if (sceneBucket === "small") return p.scene_count <= 3;
      if (sceneBucket === "medium") return p.scene_count >= 4 && p.scene_count <= 8;
      return p.scene_count >= 9;
    };
    const dateMatch = (p: ProjectListItem) => {
      if (dateRange === "all") return true;
      const d = daysAgo(p.created_at);
      if (dateRange === "7d") return d <= 7;
      if (dateRange === "30d") return d <= 30;
      return d <= 90;
    };
    const base = projects.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false;
      if (!projectMatchesStatus(p, statusFilter)) return false;
      if (storyTypeFilter !== "all" && (p.story_type || "").trim() !== storyTypeFilter) return false;
      if (!sceneMatch(p)) return false;
      if (!dateMatch(p)) return false;
      return true;
    });
    return [...base].sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "title_asc") return a.title.localeCompare(b.title);
      if (sortBy === "scene_desc") return b.scene_count - a.scene_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects, search, statusFilter, storyTypeFilter, sceneBucket, dateRange, sortBy]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (statusFilter !== "all") {
      labels.push(STATUS_FILTER_OPTIONS.find((option) => option.key === statusFilter)?.label ?? statusFilter);
    }
    if (storyTypeFilter !== "all") labels.push(storyTypeFilter);
    if (sceneBucket !== "all") {
      labels.push(
        sceneBucket === "small"
          ? "1-3 scenes"
          : sceneBucket === "medium"
            ? "4-8 scenes"
            : "9+ scenes",
      );
    }
    if (dateRange !== "all") {
      labels.push(
        dateRange === "7d"
          ? "Last 7 days"
          : dateRange === "30d"
            ? "Last 30 days"
            : "Last 90 days",
      );
    }
    if (sortBy !== "newest") {
      labels.push(
        sortBy === "oldest"
          ? "Oldest first"
          : sortBy === "title_asc"
            ? "Title A-Z"
            : "Most scenes",
      );
    }
    return labels;
  }, [statusFilter, storyTypeFilter, sceneBucket, dateRange, sortBy]);

  const handleDelete = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    const ok = await appConfirm({
      title: "Delete project?",
      description: `Delete "${project?.title ?? "this project"}" and all of its generated data. This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteProjectMutation.mutateAsync(id);
      setProjects(projects.filter((p) => p.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== String(id)));
      notify.success("Project deleted");
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryProjectMutation.mutateAsync(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "generating" } : p)));
      notify.success("Retry added to queue");
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelProjectMutation.mutateAsync(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "failed" } : p)));
      notify.success("Project stopped");
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  const openYtDialog = async (project: ProjectListItem) => {
    setYtDialogProject(project);
    setYtForm({ title: project.title, description: "", tags: "", privacy: "private" });
    setYtResult(null);
    setYtJobId(null);
    setYtChannelId(ytChannels.length === 1 ? ytChannels[0].channel_id : null);
    try {
      const jobs = await api.listJobs({ limit: 50, project_id: project.id });
      const projectJobs = jobs.filter(
        (j) =>
          j.project_id === project.id &&
          j.status === "completed" &&
          j.type === "video_render" &&
          !!(j.result?.video_path || j.result?.video_url),
      );
      if (projectJobs.length) {
        const sorted = [...projectJobs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setYtJobId(sorted[0].id);
      } else {
      notify.error("No finished video found for this project");
        setYtDialogProject(null);
      }
    } catch {
      notify.error("Could not load task data");
      setYtDialogProject(null);
    }
  };

  useEffect(() => {
    if (ytDialogProject && !ytChannelId && defaultYtChannelId && ytChannels.length === 1) {
      setYtChannelId(defaultYtChannelId);
    }
  }, [defaultYtChannelId, ytChannelId, ytDialogProject, ytChannels.length]);

  const handleYtGenerateMetadata = async () => {
    if (!ytDialogProject) return;
    setYtGenerating(true);
    try {
      const meta = await api.youtubeAiMetadata(ytDialogProject.id);
      setYtForm((f) => ({
        ...f,
        title: meta.title || f.title,
        description: meta.description || f.description,
        tags: meta.tags?.join(", ") || f.tags,
      }));
      notify.success("AI title and description generated");
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Failed to generate metadata");
    } finally {
      setYtGenerating(false);
    }
  };

  const handleYtUpload = async () => {
    if (!ytJobId) return;
    setYtUploading(true);
    try {
      const tags = ytForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const result = await api.youtubeUpload({
        job_id: ytJobId,
        channel_id: ytChannelId || undefined,
        title: ytForm.title,
        description: ytForm.description,
        tags,
        privacy: ytForm.privacy,
      });
      setYtResult(result);
      notify.success("Video uploaded to YouTube");
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "YouTube upload failed");
    } finally {
      setYtUploading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const sid = String(id);
    setSelectedIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredIds.map(String));
  };

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setStoryTypeFilter("all");
    setSceneBucket("all");
    setDateRange("all");
    setSortBy("newest");
  };

  const runBulkDelete = async () => {
    if (!selectedIds.length) return;
    const confirmed = await appConfirm({
      title: `Delete ${selectedIds.length} project${selectedIds.length === 1 ? "" : "s"}?`,
      description: "This will permanently remove the selected projects and all related data. This cannot be undone.",
      confirmLabel: "Delete selected",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!confirmed) return;
    const ok = new Set<string>();
    await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await deleteProjectMutation.mutateAsync(id);
          ok.add(id);
        } catch {
          /* skip */
        }
      })
    );
    setProjects(projects.filter((p) => !ok.has(p.id)));
    clearSelection();
    notify.success(`Deleted ${ok.size} project(s)`);
  };

  const runBulkRetry = async () => {
    const ids = selectedIds.filter((id) => projects.find((p) => p.id === id)?.status === "failed");
    if (!ids.length) {
      notify.message("Select failed projects to retry.");
      return;
    }
    await Promise.all(
      ids.map(async (id) => {
        try {
          await api.retryProject(id);
        } catch {
          /* skip */
        }
      })
    );
    setProjects(projects.map((p) => (ids.includes(p.id) ? { ...p, status: "generating" } : p)));
    notify.success(`Retried ${ids.length} project(s)`);
  };

  const runBulkCancel = async () => {
    const ids = selectedIds.filter((id) => projects.find((p) => p.id === id)?.status === "generating");
    if (!ids.length) {
      notify.message("Select running projects to stop.");
      return;
    }
    await Promise.all(
      ids.map(async (id) => {
        try {
          await api.cancelProject(id);
        } catch {
          /* skip */
        }
      })
    );
    setProjects(projects.map((p) => (ids.includes(p.id) ? { ...p, status: "failed" } : p)));
      notify.success(`Stopped ${ids.length} project(s)`);
  };

  return (
    <div className="w-full space-y-5 text-slate-900 dark:text-slate-100">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-br from-white via-slate-50/95 to-cyan-50/40 px-5 py-4 shadow-sm dark:border-zinc-700/80 dark:from-zinc-900 dark:via-zinc-900 dark:to-cyan-950/15 sm:px-6">
        <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <FolderOpen className="h-7 w-7 text-cyan-500" />
              Library
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Find the right project quickly, keep active work visible, and jump back into Studio without digging through UI noise.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
                {filtered.length} visible
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                {projects.length} total
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                {statusCounts.active} running
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                {statusCounts.ready_for_compile} ready to compile
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                {statusCounts.failed} need attention
              </Badge>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {projects.length >= 500 ? "Showing up to 500 projects. Use search or filters to narrow the list." : "Browse all projects or refine the list below."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/generate">
              <Button className="rounded-xl">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/35 p-4 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/35 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <Field id="projects-search" label="Search" className="min-w-0 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                className="pl-9 w-full"
                placeholder="Search by project title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search projects"
              />
            </div>
          </Field>
          <div className="w-full shrink-0 space-y-1.5 lg:w-52">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block" id="projects-filter-sort-label">
              Sort
            </span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-full" aria-labelledby="projects-filter-sort-label">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="title_asc">Title A–Z</SelectItem>
                <SelectItem value="scene_desc">Most scenes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasNonDefaultFilters ? (
            <Button type="button" variant="ghost" className="lg:mb-0.5" onClick={resetFilters}>
              Reset filters
            </Button>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTER_OPTIONS
              .filter(
                (row) =>
                  (row.key !== "draft" || statusCounts.draft > 0) &&
                  (row.key !== "ready_for_compile" || statusCounts.ready_for_compile > 0)
              )
              .map(({ key, label }) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={statusFilter === key ? "default" : "outline"}
                  onClick={() => setStatusFilter(key)}
                  className="gap-1.5 tabular-nums"
                >
                  {label}
                  <span className="opacity-80">({statusCounts[key]})</span>
                </Button>
              ))}
          </div>
        </div>

        <details className="group mt-4 border-t border-slate-200/70 pt-3 dark:border-zinc-700/70 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-1 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              Refine by story, scenes, or date
              {secondaryFilterCount > 0 ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {secondaryFilterCount} active
                </Badge>
              ) : null}
            </span>
            <span className="text-slate-400 text-xs group-open:hidden">Expand</span>
            <span className="text-slate-400 text-xs hidden group-open:inline">Collapse</span>
          </summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 min-w-0">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block" id="projects-filter-story-label">
                Story type
              </span>
              <Select value={storyTypeFilter} onValueChange={setStoryTypeFilter}>
                <SelectTrigger className="w-full" aria-labelledby="projects-filter-story-label">
                  <SelectValue placeholder="Story type" />
                </SelectTrigger>
                <SelectContent>
                  {storyTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "all" ? "All types" : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block" id="projects-filter-scenes-label">
                Scene count
              </span>
              <Select value={sceneBucket} onValueChange={(v) => setSceneBucket(v as SceneBucket)}>
                <SelectTrigger className="w-full" aria-labelledby="projects-filter-scenes-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="small">Small (1–3)</SelectItem>
                  <SelectItem value="medium">Medium (4–8)</SelectItem>
                  <SelectItem value="large">Large (9+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block" id="projects-filter-date-label">
                Created
              </span>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="w-full" aria-labelledby="projects-filter-date-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </details>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-3 dark:border-zinc-700/70 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {filtered.length === projects.length
                ? `Showing all ${filtered.length} loaded`
                : `Showing ${filtered.length} of ${projects.length} loaded`}
            </span>
            {filtered.length === 0 && projects.length > 0 ? (
              <span className="text-slate-500 dark:text-slate-400">Try another status or search.</span>
            ) : null}
            {activeFilterLabels.map((label) => (
              <Badge key={label} variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                {label}
              </Badge>
            ))}
            {search.trim() ? (
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                Search: {search.trim()}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
                {selectedIds.length} selected
              </Badge>
            ) : null}
          <Button type="button" size="sm" variant="outline" onClick={selectAllFiltered} disabled={filtered.length === 0}>
            <CheckSquare className="h-4 w-4" /> Select all shown ({filtered.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={selectedIds.length === 0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearSelection();
            }}
          >
            <XSquare className="h-4 w-4" /> Clear selection
          </Button>
            {selectedIds.length > 0 ? (
              <>
                <Button type="button" size="sm" variant="outline" onClick={runBulkRetry}>
                  <RotateCcw className="h-4 w-4" /> Try again
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={runBulkCancel}>
                  <StopCircle className="h-4 w-4" /> Stop
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={runBulkDelete}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Open a project to continue editing, export, or recover it.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState title="No projects found" description="Try another filter, or create a new project." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              showCheckbox
              checked={selectedSet.has(String(project.id))}
              onToggleCheck={toggleSelect}
              onRetry={handleRetry}
              onDelete={handleDelete}
              onCancel={handleCancel}
              onYouTube={openYtDialog}
              youtubeConnected={ytStatus?.connected}
            />
          ))}
        </div>
      )}

      {ytDialogProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !ytUploading && setYtDialogProject(null)}>
          <Card className="w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Youtube className="h-5 w-5 text-red-500" /> Upload to YouTube</h3>
              <Button variant="ghost" size="icon" onClick={() => !ytUploading && setYtDialogProject(null)} disabled={ytUploading}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-6 pb-6 space-y-4">
              {ytResult ? (
                <div className="text-center space-y-4 py-4">
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center mx-auto">
                    <Youtube className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Uploaded successfully!</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your video is now on YouTube</p>
                  </div>
                  <a href={ytResult.youtube_url} target="_blank" rel="noopener noreferrer">
                    <Button><ExternalLink className="h-4 w-4 mr-1" /> Watch on YouTube</Button>
                  </a>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{ytResult.youtube_url}</p>
                </div>
              ) : !ytJobId ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-sm text-slate-500">Loading video data...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Uploading to: <span className="font-medium text-slate-700 dark:text-slate-300">{activeYtChannel?.channel_title || "Select channel"}</span>
                    </p>
                    <Button variant="outline" size="sm" onClick={handleYtGenerateMetadata} disabled={ytGenerating}>
                      {ytGenerating ? (
                        <><div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" /> Generating...</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5 mr-1" /> Generate with AI</>
                      )}
                    </Button>
                  </div>
                  {ytChannels.length > 1 && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Channel</label>
                      <Select value={ytChannelId || ""} onValueChange={(v) => setYtChannelId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                        <SelectContent>
                          {ytChannels.map((channel) => (
                            <SelectItem key={channel.channel_id} value={channel.channel_id}>
                              {channel.channel_title || channel.channel_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium mb-1 block">Title</label>
                    <Input placeholder="Video title (max 100 chars)" maxLength={100} value={ytForm.title} onChange={(e) => setYtForm((f) => ({ ...f, title: e.target.value }))} />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 text-right">{ytForm.title.length}/100</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Description</label>
                    <Textarea placeholder="Video description..." rows={5} maxLength={5000} value={ytForm.description} onChange={(e) => setYtForm((f) => ({ ...f, description: e.target.value }))} />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 text-right">{ytForm.description.length}/5000</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Tags</label>
                    <Input placeholder="tag1, tag2, tag3 (comma separated)" value={ytForm.tags} onChange={(e) => setYtForm((f) => ({ ...f, tags: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Privacy</label>
                    <Select value={ytForm.privacy} onValueChange={(v) => setYtForm((f) => ({ ...f, privacy: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleYtUpload} disabled={ytUploading || !ytForm.title.trim() || !ytChannelId}>
                    {ytUploading ? (
                      <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" /> Uploading to YouTube...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-1" /> Upload Video</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
