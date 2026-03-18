"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Trash2, Search, RotateCcw, StopCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectListItem } from "@/lib/types";

export default function ProjectsPage() {
  const { projects, setProjects } = useProjectStore();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listProjects({ limit: 100 }).then(setProjects).finally(() => setLoading(false));
  }, [setProjects]);

  const filtered = projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    await api.deleteProject(id);
    setProjects(projects.filter((p) => p.id !== id));
  };

  const handleRetry = async (id: string) => {
    try {
      await api.retryProject(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "generating" } : p)));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.cancelProject(id);
      setProjects(projects.map((p) => (p.id === id ? { ...p, status: "failed" } : p)));
    } catch (e) {
      alert((e as Error).message);
    }
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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-20 text-center text-slate-500 dark:text-slate-400">No projects found</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <Card key={project.id} className="hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
              <CardContent className="pt-6">
                <Link href={`/projects/${project.id}`}>
                  <h3 className="font-semibold group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-2">{project.title}</h3>
                </Link>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={project.status} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{project.scene_count} scenes</span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(project.created_at).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    {project.status === "generating" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-amber-500" title="Stop" onClick={() => handleCancel(project.id)}>
                        <StopCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {project.status === "failed" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-cyan-500" title="Retry" onClick={() => handleRetry(project.id)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-500" onClick={() => handleDelete(project.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
