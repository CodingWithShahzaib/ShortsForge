"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import type { Job } from "@/lib/types";
import { useVideoPreviewStore } from "@/stores/videoPreviewStore";
import { jobHasVideoAsset, resolveJobVideoPlaybackUrl } from "@/lib/job-video-url";
import { notify } from "@/lib/notify";

export function DashboardJobRow({
  job,
  projectTitle,
  onRetry,
  retrying,
  onDelete,
  deleting,
}: {
  job: Job;
  projectTitle?: string;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
  onDelete?: () => void | Promise<void>;
  deleting?: boolean;
}) {
  const openPreview = useVideoPreviewStore((s) => s.openPreview);
  const [resolving, setResolving] = useState(false);
  const created = job.created_at ? new Date(job.created_at) : null;
  const canPreview = jobHasVideoAsset(job);
  const typeLabel = job.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handlePreview = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPreview) return;
    setResolving(true);
    try {
      const url = await resolveJobVideoPlaybackUrl(job);
      if (!url) {
        notify.error("No video preview available");
        return;
      }
      const label = projectTitle ? `${projectTitle} — ${typeLabel}` : typeLabel;
      openPreview(url, label);
    } catch {
      notify.error("Could not load video");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="group relative flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 ring-1 ring-transparent transition-all hover:ring-cyan-500/15 dark:border-white/10 dark:bg-zinc-900/90 dark:hover:ring-cyan-400/10">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {projectTitle ? (
            job.project_id ? (
              <Link
                href={`/projects/${job.project_id}`}
                className="min-w-0 max-w-full truncate text-sm font-medium text-slate-900 hover:text-cyan-600 dark:text-slate-100 dark:hover:text-cyan-400"
              >
                {projectTitle}
              </Link>
            ) : (
              <p className="min-w-0 max-w-full truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {projectTitle}
              </p>
            )
          ) : (
            <p className="min-w-0 max-w-full truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {typeLabel}
            </p>
          )}
          <StatusBadge status={job.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {created && <span className="tabular-nums">{created.toLocaleString()}</span>}
        </div>
        {(job.status === "in_progress" || job.status === "queued") && (
          <LinearProgress value={job.progress} className="mt-1 h-1.5" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canPreview && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            title="Preview video"
            aria-label="Preview video"
            disabled={resolving}
            onClick={handlePreview}
          >
            <Play className="h-4 w-4 fill-current" />
          </Button>
        )}
        {job.status === "failed" && onRetry && (
          <Button
            variant="outline-animated"
            size="sm"
            className="rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            disabled={(retrying ?? false) || (deleting ?? false)}
            title="Retry"
          >
            {retrying ?? false ? (
              <>
                <div className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{" "}
                Retrying...
              </>
            ) : (
              <>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
              </>
            )}
          </Button>
        )}
        {job.status === "failed" && onDelete && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={(retrying ?? false) || (deleting ?? false)}
            title="Delete job and related project"
          >
            {deleting ?? false ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </>
            )}
          </Button>
        )}
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{job.progress}%</span>
      </div>
    </div>
  );
}
