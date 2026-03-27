"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SceneRowSkeleton() {
  return (
    <Card className="overflow-hidden border-slate-200/80 dark:border-white/10">
      <div className="flex">
        <div className="flex w-12 shrink-0 items-center justify-center border-r border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/50">
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="min-w-0 flex-1 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[168px_minmax(0,1fr)] sm:items-start">
            <Skeleton className="aspect-9/16 w-full max-w-[168px] mx-auto sm:mx-0 rounded-lg" />
            <div className="space-y-2 min-w-0">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ProjectDetailPageSkeleton() {
  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <section className="flex items-center gap-4">
        <Button variant="ghost" size="icon" disabled className="shrink-0 opacity-60">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-[min(100%,20rem)] max-w-xl" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </section>

      <Card className="border-cyan-500/15">
        <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-5 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-44 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4">
          <SceneRowSkeleton />
          <SceneRowSkeleton />
          <SceneRowSkeleton />
        </div>
        <Card className="xl:sticky xl:top-24 border-slate-200/80 dark:border-white/10">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function GeneratingScenesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy aria-label="Generating scenes">
      {Array.from({ length: count }).map((_, i) => (
        <SceneRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function SceneDetailsGeneratingSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Preparing scene editor">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/60 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
        </span>
        Crafting storyboard and assets…
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-28 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

/** Matches the project detail page grid: preview + filmstrip + inspector column. */
export function ProjectDetailShellSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border/60 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/80 border-b border-white/6">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <Skeleton className="h-3.5 w-3.5 rounded shrink-0" />
            <Skeleton className="h-5 flex-1 max-w-md rounded-md" />
            <Skeleton className="h-8 w-20 rounded-full shrink-0" />
            <div className="hidden sm:flex gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="border-b border-white/4 bg-zinc-900/30">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-11 flex items-center gap-6">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
        </div>
      </div>
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-6">
          <div className="space-y-6 min-w-0">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
              <div className="flex gap-1.5 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-18 w-28 shrink-0 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-5">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VideoPreviewSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`w-full rounded-lg max-h-[500px] min-h-[220px] overflow-hidden ${className || ""}`}
      aria-busy
      aria-label="Loading video preview"
    >
      <Skeleton className="h-full min-h-[220px] w-full rounded-lg" />
    </div>
  );
}
