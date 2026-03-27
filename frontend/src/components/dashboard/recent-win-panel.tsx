"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { ProjectListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RecentWinPanel({
  project,
  className,
}: {
  project: ProjectListItem | null;
  className?: string;
}) {
  if (!project) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl border border-emerald-200/70 bg-linear-to-br from-emerald-50/80 via-white to-white/80 p-4 shadow-[0_12px_35px_rgba(16,185,129,0.15)] dark:border-emerald-900/50 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-900",
        className
      )}
      aria-labelledby="recent-win-heading"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-700 dark:from-emerald-500/25 dark:text-emerald-200">
          <Trophy className="h-4 w-4" />
        </span>
        <div>
          <h2 id="recent-win-heading" className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Recent win
          </h2>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-200/80">
            Latest completed project ready to share.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-emerald-900 dark:text-emerald-100">{project.title}</p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-200/80">
            {project.scene_count} scenes • {project.story_type}
          </p>
        </div>
        <Button asChild size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400">
          <Link href={`/projects/${project.id}`}>View</Link>
        </Button>
      </div>
    </motion.section>
  );
}
