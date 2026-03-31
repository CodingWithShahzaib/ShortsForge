"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Clock,
  Film,
  ImageIcon,
  MoreVertical,
  Play,
  RotateCcw,
  Sparkles,
  StopCircle,
  Trash2,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProjectListItem } from "@/lib/types";
import { toFriendlyStatus } from "@/lib/user-facing-text";
import { cn } from "@/lib/utils";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `0:${s.toString().padStart(2, "0")}`;
}

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
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function projectTone(status: string) {
  if (status === "failed") {
    return {
      frame: "border-rose-500/25 hover:border-rose-500/35",
      glow: "from-rose-500/14 via-transparent to-transparent",
      chip: "error" as const,
    };
  }
  if (status === "ready_for_compile") {
    return {
      frame: "border-amber-500/25 hover:border-amber-500/35",
      glow: "from-amber-500/12 via-transparent to-transparent",
      chip: "warning" as const,
    };
  }
  if (status === "completed") {
    return {
      frame: "border-emerald-500/20 hover:border-emerald-500/30",
      glow: "from-emerald-500/12 via-transparent to-transparent",
      chip: "success" as const,
    };
  }
  if (status === "generating" || status === "in_progress" || status === "queued") {
    return {
      frame: "border-cyan-500/25 hover:border-cyan-500/35",
      glow: "from-cyan-500/14 via-transparent to-transparent",
      chip: "inProgress" as const,
    };
  }
  return {
    frame: "border-border/60 hover:border-cyan-500/30",
    glow: "from-slate-500/8 via-transparent to-transparent",
    chip: "secondary" as const,
  };
}

function projectStateSummary(project: ProjectListItem): string {
  if (project.status === "ready_for_compile") return "Storyboard and assets are ready for final compile.";
  if (project.status === "ready_for_edit") return "Storyboard is ready to review before asset prep.";
  if (project.status === "failed") return "Needs attention before the engine can continue.";
  if (project.status === "completed") return "Final video is compiled and ready to ship.";
  if (project.status === "generating" || project.status === "in_progress") return "Engine is actively processing this project.";
  if (project.status === "queued") return "Queued and waiting for the next engine slot.";
  return "Open the project to continue building and refining.";
}

function projectPrimaryCta(project: ProjectListItem) {
  if (project.status === "ready_for_compile") {
    return { href: `/projects/${project.id}/studio`, label: "Open studio", icon: Clapperboard };
  }
  if (project.status === "ready_for_edit") {
    return { href: `/projects/${project.id}/studio`, label: "Review storyboard", icon: Sparkles };
  }
  if (project.status === "failed") {
    return { href: `/projects/${project.id}/studio`, label: "Open recovery", icon: RotateCcw };
  }
  if (project.status === "completed") {
    return { href: `/projects/${project.id}`, label: "Open project", icon: Play };
  }
  if (project.status === "generating" || project.status === "in_progress" || project.status === "queued") {
    return { href: `/projects/${project.id}/studio`, label: "Track progress", icon: Sparkles };
  }
  return { href: `/projects/${project.id}`, label: "Continue", icon: ArrowRight };
}

interface ProjectCardProps {
  project: ProjectListItem;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCancel?: (id: string) => void;
  onYouTube?: (project: ProjectListItem) => void;
  showCheckbox?: boolean;
  checked?: boolean;
  onToggleCheck?: (id: string) => void;
  retrying?: boolean;
  deleting?: boolean;
  className?: string;
  youtubeConnected?: boolean;
}

export function ProjectCard({
  project,
  onRetry,
  onDelete,
  onCancel,
  onYouTube,
  showCheckbox,
  checked,
  onToggleCheck,
  retrying,
  deleting,
  className,
  youtubeConnected,
}: ProjectCardProps) {
  const [imgError, setImgError] = useState(false);
  const isActive = project.status === "generating" || project.status === "in_progress" || project.status === "queued";
  const durationSec = project.duration_sec ?? project.scene_count * 5;
  const tone = projectTone(project.status);
  const primaryCta = projectPrimaryCta(project);
  const hasPrimaryAction =
    (project.status === "generating" && !!onCancel) ||
    (project.status === "failed" && !!onRetry) ||
    (project.status === "completed" && !!youtubeConnected && !!onYouTube);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        tone.frame,
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b", tone.glow)} />
      {/* Thumbnail area */}
      <Link href={`/projects/${project.id}`} className="relative block aspect-video bg-zinc-900 overflow-hidden">
        {project.thumbnail_url && !imgError ? (
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-zinc-800 to-zinc-900">
            <ImageIcon className="h-10 w-10 text-zinc-600" />
          </div>
        )}
        {/* Duration badge */}
        {durationSec > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {formatDuration(durationSec)}
          </span>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-2">
          <StatusBadge status={project.status} />
          {project.status === "ready_for_compile" ? (
            <Badge variant={tone.chip} className="h-6 rounded-full px-2 text-[10px] uppercase tracking-wide">
              Studio next
            </Badge>
          ) : null}
        </div>
        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
            <Play className="h-6 w-6 fill-white text-white" />
          </div>
        </div>
        {/* Progress bar for active */}
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
            <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: project.status === "queued" ? "5%" : "60%" }} />
          </div>
        )}
      </Link>

      {/* Info section */}
      <div className="relative flex gap-3 p-4">
        {showCheckbox && (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-500/40"
            checked={checked}
            onChange={() => onToggleCheck?.(project.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${project.title}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-snug text-foreground line-clamp-2 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                {project.title}
              </h3>
            </Link>
            {/* Three-dot menu */}
            <div className="relative shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {project.status === "generating" && onCancel && (
                    <DropdownMenuItem onSelect={() => onCancel(project.id)}>
                      <StopCircle className="h-3.5 w-3.5" /> Stop
                    </DropdownMenuItem>
                  )}
                  {project.status === "failed" && onRetry && (
                    <DropdownMenuItem onSelect={() => onRetry(project.id)} disabled={retrying}>
                      <RotateCcw className="h-3.5 w-3.5" /> {retrying ? "Retrying..." : "Try again"}
                    </DropdownMenuItem>
                  )}
                  {project.status === "completed" && youtubeConnected && onYouTube && (
                    <DropdownMenuItem onSelect={() => onYouTube(project)}>
                      <Youtube className="h-3.5 w-3.5 text-red-500" /> Upload on YouTube
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      {hasPrimaryAction && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onSelect={() => onDelete(project.id)}
                        disabled={deleting}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting..." : "Delete"}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
              {project.story_type}
            </Badge>
            <span className="flex items-center gap-1 rounded-full bg-muted/55 px-2 py-1">
              <Film className="h-3 w-3" />
              {project.scene_count} scene{project.scene_count === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-muted/55 px-2 py-1">
              <Clock className="h-3 w-3" />
              {timeAgo(project.created_at)}
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {toFriendlyStatus(project.status)}
            </p>
            <p className="text-sm leading-relaxed text-foreground/75">
              {projectStateSummary(project)}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button asChild variant="outline" className="h-9 flex-1 justify-between rounded-xl">
              <Link href={primaryCta.href}>
                <span>{primaryCta.label}</span>
                <primaryCta.icon className="h-4 w-4" />
              </Link>
            </Button>
            {project.status === "completed" && youtubeConnected && onYouTube ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onYouTube(project);
                }}
                aria-label="Upload to YouTube"
              >
                <Youtube className="h-4 w-4 text-red-500" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm animate-pulse">
      <div className="aspect-video bg-zinc-200 dark:bg-zinc-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-3 w-3/5 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
    </div>
  );
}
