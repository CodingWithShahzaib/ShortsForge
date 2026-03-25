"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  RotateCcw,
  StopCircle,
  Trash2,
  XSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectListItem } from "@/lib/types";
import { useCancelProjectMutation, useDeleteProjectMutation, useProjectsQuery, useRetryProjectActionMutation } from "@/lib/queries";

type SortKey = "newest" | "oldest" | "title_asc" | "scene_desc";
type SceneBucket = "all" | "small" | "medium" | "large";
type DateRange = "all" | "7d" | "30d" | "90d";
type SavedView = {
  id: string;
  name: string;
  status: string;
  storyType: string;
  sceneBucket: SceneBucket;
  dateRange: DateRange;
  sort: SortKey;
  search: string;
};

const VIEW_KEY = "shortsforge-projects-views-v1";

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function ProjectsPage() {
  const { projects, setProjects } = useProjectStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [storyTypeFilter, setStoryTypeFilter] = useState<string>("all");
  const [sceneBucket, setSceneBucket] = useState<SceneBucket>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      const parsed = raw ? (JSON.parse(raw) as SavedView[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [bulkDeleteArmed, setBulkDeleteArmed] = useState(false);
  const { data: fetchedProjects, isLoading: loading } = useProjectsQuery();
  const deleteProjectMutation = useDeleteProjectMutation();
  const retryProjectMutation = useRetryProjectActionMutation();
  const cancelProjectMutation = useCancelProjectMutation();

  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
  }, [fetchedProjects, setProjects]);

  const storyTypes = useMemo(
    () => ["all", ...Array.from(new Set(projects.map((p) => p.story_type).filter(Boolean))).sort()],
    [projects]
  );

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
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (storyTypeFilter !== "all" && p.story_type !== storyTypeFilter) return false;
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

  const handleDelete = async (id: string) => {
    if (pendingDeleteProjectId !== id) {
      setPendingDeleteProjectId(id);
      toast.message("Press delete again to confirm.");
      return;
    }
    try {
      await deleteProjectMutation.mutateAsync(id);
      setProjects(projects.filter((p) => p.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      toast.success("Project deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingDeleteProjectId(null);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryProjectMutation.mutateAsync(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "generating" } : p)));
      toast.success("Retry queued");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelProjectMutation.mutateAsync(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "failed" } : p)));
      toast.success("Project cancelled");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredIds);
  };

  const clearSelection = () => setSelectedIds([]);

  const saveCurrentView = () => {
    const name = window.prompt("Save this view as");
    if (!name?.trim()) return;
    const next: SavedView[] = [
      ...savedViews,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        status: statusFilter,
        storyType: storyTypeFilter,
        sceneBucket,
        dateRange,
        sort: sortBy,
        search,
      },
    ].slice(-12);
    setSavedViews(next);
    localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    toast.success("View saved");
  };

  const applyView = (id: string) => {
    const view = savedViews.find((v) => v.id === id);
    if (!view) return;
    setStatusFilter(view.status);
    setStoryTypeFilter(view.storyType);
    setSceneBucket(view.sceneBucket);
    setDateRange(view.dateRange);
    setSortBy(view.sort);
    setSearch(view.search);
    toast.message(`Applied view: ${view.name}`);
  };

  const runBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!bulkDeleteArmed) {
      setBulkDeleteArmed(true);
      toast.message(`Press bulk delete again to delete ${selectedIds.length} project(s).`);
      return;
    }
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
    toast.success(`Deleted ${ok.size} project(s)`);
    setBulkDeleteArmed(false);
  };

  const runBulkRetry = async () => {
    const ids = selectedIds.filter((id) => projects.find((p) => p.id === id)?.status === "failed");
    if (!ids.length) {
      toast.message("Select failed projects to retry.");
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
    toast.success(`Retried ${ids.length} project(s)`);
  };

  const runBulkCancel = async () => {
    const ids = selectedIds.filter((id) => projects.find((p) => p.id === id)?.status === "generating");
    if (!ids.length) {
      toast.message("Select generating projects to cancel.");
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
    toast.success(`Cancelled ${ids.length} project(s)`);
  };

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><FolderOpen className="h-8 w-8 text-cyan-500" /> Library</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{projects.length} projects</p>
        </div>
        <Link href="/generate"><Button><Plus className="h-4 w-4" /> New Project</Button></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Field id="projects-search" label="Search" className="relative lg:col-span-2" hint="Filter by project title">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search projects"
            />
          </div>
        </Field>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="generating">Generating</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="ready_for_edit">Ready to edit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={storyTypeFilter} onValueChange={setStoryTypeFilter}>
          <SelectTrigger aria-label="Filter by story type">
            <SelectValue placeholder="Story type" />
          </SelectTrigger>
          <SelectContent>
            {storyTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "all" ? "All story types" : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger aria-label="Sort projects">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="title_asc">Title A-Z</SelectItem>
            <SelectItem value="scene_desc">Most scenes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          type="button"
          variant={statusFilter === "generating" ? "default" : "outline"}
          onClick={() => setStatusFilter("generating")}
        >
          In progress
        </Button>
        <Button
          size="sm"
          type="button"
          variant={statusFilter === "failed" ? "default" : "outline"}
          onClick={() => setStatusFilter("failed")}
        >
          Failed
        </Button>
        <Button
          size="sm"
          type="button"
          variant={statusFilter === "ready_for_edit" ? "default" : "outline"}
          onClick={() => setStatusFilter("ready_for_edit")}
        >
          Ready to edit
        </Button>
        <Select value={sceneBucket} onValueChange={(v) => setSceneBucket(v as SceneBucket)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scene counts</SelectItem>
            <SelectItem value="small">Small (1-3)</SelectItem>
            <SelectItem value="medium">Medium (4-8)</SelectItem>
            <SelectItem value="large">Large (9+)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" type="button" onClick={saveCurrentView}>
          Save view
        </Button>
        {savedViews.length > 0 && (
          <Select onValueChange={applyView}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Apply saved view" />
            </SelectTrigger>
            <SelectContent>
              {savedViews.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedIds.length > 0 && (
        <Card className="border-cyan-500/30">
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{selectedIds.length} selected</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={runBulkRetry}>
                <RotateCcw className="h-4 w-4" /> Bulk retry
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={runBulkCancel}>
                <StopCircle className="h-4 w-4" /> Bulk cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bulkDeleteArmed ? "destructive" : "outline"}
                onClick={runBulkDelete}
              >
                <Trash2 className="h-4 w-4" /> Bulk delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={selectAllFiltered}>
          <CheckSquare className="h-4 w-4" /> Select filtered
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
          <XSquare className="h-4 w-4" /> Clear selection
        </Button>
      </div>

      {loading ? (
        <LoadingState label="Loading projects..." />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState title="No projects found" description="Try another filter, or create a new project." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <Card
              key={project.id}
              className="hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="h-5 w-5 rounded border border-input bg-background mt-0.5 flex items-center justify-center"
                    aria-label={`Select ${project.title}`}
                    aria-pressed={selectedSet.has(project.id)}
                    onClick={() => toggleSelect(project.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect(project.id);
                      }
                    }}
                  >
                    {selectedSet.has(project.id) ? <CheckSquare className="h-3.5 w-3.5 text-cyan-500" /> : null}
                  </button>
                  <Link className="flex-1 min-w-0" href={`/projects/${project.id}`}>
                    <h3 className="font-semibold group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-2">
                      {project.title}
                    </h3>
                  </Link>
                  <details className="relative">
                    <summary className="list-none cursor-pointer rounded p-1 hover:bg-slate-100 dark:hover:bg-zinc-800">
                      <MoreHorizontal className="h-4 w-4 text-slate-500" />
                    </summary>
                    <div className="absolute right-0 top-7 z-10 w-36 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 shadow-lg">
                      {project.status === "generating" && (
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800 rounded"
                          onClick={() => handleCancel(project.id)}
                        >
                          Stop
                        </button>
                      )}
                      {project.status === "failed" && (
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800 rounded"
                          onClick={() => handleRetry(project.id)}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        onClick={() => handleDelete(project.id)}
                      >
                        {pendingDeleteProjectId === project.id ? "Confirm delete" : "Delete"}
                      </button>
                    </div>
                  </details>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={project.status} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{project.scene_count} scenes</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {project.story_type}
                  </Badge>
                </div>
                <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                  <p>Created: {new Date(project.created_at).toLocaleDateString()}</p>
                  <p>Render mode: standard</p>
                  <p>Duration: {Math.max(1, project.scene_count * 5)}s est.</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
