"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import type { Job } from "@/lib/types";
import { engineStageLabel, inferCurrentStage, inferTargetStage, summarizeEngineOutcome } from "@/lib/engine-pipeline";
import { useVideoPreviewStore } from "@/stores/videoPreviewStore";
import { jobHasVideoAsset, resolveJobVideoPlaybackUrl } from "@/lib/job-video-url";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const statusIconMap: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-5 w-5 text-emerald-500" />,
  failed: <XCircle className="h-5 w-5 text-rose-500" />,
  in_progress: <Loader2 className="h-5 w-5 text-cyan-500 animate-spin" />,
  queued: <Clock className="h-5 w-5 text-amber-500" />,
};

interface JobCardProps {
  job: Job;
  projectTitle?: string;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
  onDelete?: () => void | Promise<void>;
  deleting?: boolean;
  className?: string;
  variant?: "card" | "log";
}

export function JobCard({
  job,
  projectTitle,
  onRetry,
  retrying,
  onDelete,
  deleting,
  className,
  variant = "card",
}: JobCardProps) {
  const openPreview = useVideoPreviewStore((s) => s.openPreview);
  const [resolving, setResolving] = useState(false);
  const canPreview = jobHasVideoAsset(job);
  const typeLabel = job.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const isActive = job.status === "in_progress" || job.status === "queued";
  const shortId = job.id ? job.id.slice(0, 8) : "";
  const currentStage = inferCurrentStage(job);
  const targetStage = inferTargetStage(job);
  const stageSummary = summarizeEngineOutcome(job);
  const statusDotMap: Record<string, string> = {
    completed: "bg-emerald-500",
    failed: "bg-rose-500",
    in_progress: "bg-cyan-500",
    queued: "bg-amber-500",
  };

  const formatTimestamp = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const handlePreview = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPreview) return;
    setResolving(true);
    try {
      const url = await resolveJobVideoPlaybackUrl(job);
      if (!url) { notify.error("No video preview available"); return; }
      const label = projectTitle ? `${projectTitle} — ${typeLabel}` : typeLabel;
      openPreview(url, label);
    } catch {
      notify.error("Could not load video");
    } finally {
      setResolving(false);
    }
  };

  if (variant === "log") {
    const hasPayload = Boolean(job.result || job.error);
    return (
      <details
        className={cn(
          "group rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm shadow-sm transition hover:bg-card/70",
          className
        )}
      >
        <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  statusDotMap[job.status] ?? "bg-muted-foreground"
                )}
              />
              {job.created_at && (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTimestamp(job.created_at)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{typeLabel}</span>
                <StatusBadge status={job.status} />
                {shortId && (
                  <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    #{shortId}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {projectTitle ? (
                  job.project_id ? (
                    <Link
                      href={`/projects/${job.project_id}`}
                      className="truncate font-medium text-foreground/80 hover:text-cyan-500"
                    >
                      {projectTitle}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-foreground/80">{projectTitle}</span>
                  )
                ) : job.project_id ? (
                  <span className="font-mono">project:{job.project_id.slice(0, 6)}</span>
                ) : null}
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {engineStageLabel(currentStage)}
                </span>
                <span className="tabular-nums">{job.progress}%</span>
                {job.created_at && <span>({timeAgo(job.created_at)})</span>}
                {hasPayload && (
                  <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-500">
                    details
                  </span>
                )}
              </div>
              {isActive && <LinearProgress value={job.progress} className="mt-1 h-1" />}
              <div className="text-[11px] text-muted-foreground">{stageSummary}</div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {canPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  title="Preview video"
                  disabled={resolving}
                  onClick={handlePreview}
                >
                  <Play className="h-4 w-4 fill-current" />
                </Button>
              )}
              {job.status === "failed" && onRetry && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  disabled={(retrying ?? false) || (deleting ?? false)}
                  title="Retry"
                >
                  <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
                </Button>
              )}
              {job.status === "failed" && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  disabled={(retrying ?? false) || (deleting ?? false)}
                  title="Delete"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </summary>

        <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div>
              <span className="font-semibold text-foreground">Status level:</span>{" "}
              {job.status === "failed"
                ? "Error"
                : job.status === "queued"
                  ? "Waiting"
                  : job.status === "in_progress"
                    ? "In progress"
                    : "Done"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Task type:</span>{" "}
              job:{job.type}
            </div>
            <div>
              <span className="font-semibold text-foreground">Current stage:</span>{" "}
              {engineStageLabel(currentStage)}
            </div>
            <div>
              <span className="font-semibold text-foreground">Target stage:</span>{" "}
              {engineStageLabel(targetStage)}
            </div>
            <div>
              <span className="font-semibold text-foreground">Trace ID:</span>{" "}
              {job.result?.trace_id
                ?? job.result?.trace
                ?? job.error?.trace_id
                ?? "n/a"}
            </div>
            <div>
              <span className="font-semibold text-foreground">Request ID:</span>{" "}
              {job.result?.request_id
                ?? job.error?.request_id
                ?? "n/a"}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div><span className="font-semibold text-foreground">Task ID:</span> {job.id}</div>
              {job.project_id && (
                <div><span className="font-semibold text-foreground">Project ID:</span> {job.project_id}</div>
              )}
              <div><span className="font-semibold text-foreground">Type:</span> {job.type}</div>
              <div><span className="font-semibold text-foreground">Status:</span> {job.status}</div>
            </div>
            <div className="space-y-1">
              <div><span className="font-semibold text-foreground">Progress:</span> {job.progress}%</div>
              {job.created_at && (
                <div><span className="font-semibold text-foreground">Created:</span> {formatTimestamp(job.created_at)}</div>
              )}
              {job.started_at && (
                <div><span className="font-semibold text-foreground">Started:</span> {formatTimestamp(job.started_at)}</div>
              )}
              {job.completed_at && (
                <div><span className="font-semibold text-foreground">Completed:</span> {formatTimestamp(job.completed_at)}</div>
              )}
            </div>
          </div>
          {job.error && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-rose-500">Error</div>
              <pre className="mt-1 whitespace-pre-wrap wrap-break-word rounded-md bg-background/60 p-2 text-[11px] text-foreground">
                {JSON.stringify(job.error, null, 2)}
              </pre>
            </div>
          )}
          {job.result && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-cyan-500">Result</div>
              <pre className="mt-1 whitespace-pre-wrap wrap-break-word rounded-md bg-background/60 p-2 text-[11px] text-foreground">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className={cn(
      "group relative flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-cyan-500/20 duration-200",
      className,
    )}>
      {/* Status icon */}
      <div className="shrink-0">
        {statusIconMap[job.status] ?? <Clock className="h-5 w-5 text-muted-foreground" />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {projectTitle ? (
            job.project_id ? (
              <Link
                href={`/projects/${job.project_id}`}
                className="text-sm font-semibold text-foreground hover:text-cyan-600 dark:hover:text-cyan-400 truncate max-w-[200px]"
              >
                {projectTitle}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{projectTitle}</span>
            )
          ) : (
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{typeLabel}</span>
          )}
          <StatusBadge status={job.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wide">{typeLabel}</span>
          {shortId && (
            <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono">#{shortId}</span>
          )}
          {job.project_id && (
            <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono">
              project:{job.project_id.slice(0, 6)}
            </span>
          )}
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            {engineStageLabel(currentStage)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {job.created_at && <span>{timeAgo(job.created_at)}</span>}
          <span className="tabular-nums">{job.progress}%</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{stageSummary}</div>
        {isActive && <LinearProgress value={job.progress} className="mt-1 h-1" />}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {canPreview && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            title="Preview video"
            disabled={resolving}
            onClick={handlePreview}
          >
            <Play className="h-4 w-4 fill-current" />
          </Button>
        )}
        {job.status === "failed" && onRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            disabled={(retrying ?? false) || (deleting ?? false)}
            title="Retry"
          >
            <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
          </Button>
        )}
        {job.status === "failed" && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={(retrying ?? false) || (deleting ?? false)}
            title="Delete"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
