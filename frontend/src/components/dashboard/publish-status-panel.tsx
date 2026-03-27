"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UploadCloud, Youtube } from "lucide-react";
import type { ProjectListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PublishStatusPanel({
  projects,
  youtubeConnected,
  className,
}: {
  projects: ProjectListItem[];
  youtubeConnected: boolean;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/75",
        className
      )}
      aria-labelledby="publish-heading"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-500/20 via-orange-500/10 to-transparent text-amber-700 dark:from-amber-500/25 dark:text-amber-300">
          <UploadCloud className="h-4 w-4" />
        </span>
        <div>
          <h2 id="publish-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ready to publish
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Completed projects that can be shared next.
          </p>
        </div>
      </div>

      {!youtubeConnected ? (
        <div className="mt-4 rounded-xl border border-dashed border-amber-200/80 bg-amber-50/70 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Connect YouTube to publish directly from ShortsForge.
          <Button asChild size="sm" variant="outline" className="mt-2 rounded-lg">
            <Link href="/settings">
              <Youtube className="mr-1 h-3.5 w-3.5" />
              Connect YouTube
            </Link>
          </Button>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          No completed projects yet. Finish a project to see it here.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 transition hover:border-amber-300/60 hover:bg-amber-50/40 dark:border-zinc-700/70 dark:bg-zinc-800/40 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{project.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {project.scene_count} scenes • {project.story_type}
                </p>
              </div>
              <Button asChild size="sm" className="rounded-lg">
                <Link href={`/projects/${project.id}`}>Open</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
