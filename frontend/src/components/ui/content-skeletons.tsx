"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectsLibrarySkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={i}
          className="overflow-hidden border-slate-200/80 dark:border-white/10"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 flex-1 max-w-[min(100%,14rem)]" />
              <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-3/5 max-w-48" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function HistoryJobsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="border-slate-200/80 dark:border-white/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-48 max-w-full" />
                  <Skeleton className="h-1.5 w-full max-w-xs rounded-full" />
                </div>
              </div>
              <Skeleton className="h-8 w-10 shrink-0 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ViralIdeasGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 -m-2 rounded-2xl bg-violet-500/5 animate-pulse pointer-events-none" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 relative">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="viral-idea-skeleton-card rounded-xl border border-violet-500/20 bg-card/50 p-4 space-y-3 overflow-hidden relative"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="absolute inset-0 bg-linear-to-r from-transparent via-violet-500/4 to-transparent viral-idea-sweep" style={{ animationDelay: `${i * 120}ms` }} />

            <div className="flex gap-2 relative">
              <div className="h-4 w-4 shrink-0 rounded-md mt-0.5 bg-amber-400/20 viral-idea-icon-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3" style={{ width: `${60 + (i % 3) * 15}%` }} />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-24 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardJobRowSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-white/10 dark:bg-zinc-900/90 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-40 max-w-full" />
      <Skeleton className="h-1.5 w-full rounded-full mt-1" />
    </div>
  );
}
