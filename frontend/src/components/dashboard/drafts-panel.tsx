"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, PencilLine } from "lucide-react";
import type { ProjectListItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DraftsPanel({
  projects,
  className,
}: {
  projects: ProjectListItem[];
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
      aria-labelledby="drafts-heading"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-slate-200/80 via-white to-transparent text-slate-700 dark:from-zinc-800 dark:via-zinc-900 dark:text-slate-200">
          <FileText className="h-4 w-4" />
        </span>
        <div>
          <h2 id="drafts-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Drafts in progress
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Jump back into scripts or scenes you were working on.
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate-200/80 bg-white/70 px-3 py-3 text-sm text-slate-500 dark:border-zinc-700/80 dark:bg-zinc-800/40 dark:text-slate-400">
          No drafts yet. Start a project to see it here.
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link href="/generate">
              <PencilLine className="mr-1 h-3.5 w-3.5" />
              Start a script
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 transition hover:border-cyan-300/60 hover:bg-cyan-50/40 dark:border-zinc-700/70 dark:bg-zinc-800/40 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{project.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{project.story_type}</p>
              </div>
              <StatusBadge status={project.status} />
            </Link>
          ))}
        </div>
      )}
    </motion.section>
  );
}
