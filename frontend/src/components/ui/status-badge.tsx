"use client";

import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  generating: "Generating",
  in_progress: "Generating",
  queued: "Queued",
  failed: "Failed",
  draft: "Draft",
  ready_for_edit: "Ready to edit",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "destructive" | "secondary"> = {
    completed: "default",
    generating: "secondary",
    in_progress: "secondary",
    queued: "secondary",
    failed: "destructive",
    draft: "secondary",
    ready_for_edit: "default",
    cancelled: "secondary",
  };
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const variant = variantMap[status] || "secondary";
  const isActive = status === "in_progress" || status === "generating";
  const isQueued = status === "queued";

  if (isActive) {
    return (
      <Badge variant={variant} className="gap-1.5 border-primary/30 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {label}
      </Badge>
    );
  }
  if (isQueued) {
    return (
      <Badge variant={variant} className="gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        {label}
      </Badge>
    );
  }
  return <Badge variant={variant}>{label}</Badge>;
}
