"use client";

import { Badge } from "@/components/ui/badge";
import { toFriendlyStatus } from "@/lib/user-facing-text";

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "error" | "warning" | "inProgress" | "secondary"> = {
    completed: "success",
    generating: "inProgress",
    in_progress: "inProgress",
    queued: "warning",
    failed: "error",
    draft: "secondary",
    ready_for_edit: "success",
    ready_for_compile: "warning",
    cancelled: "secondary",
  };
  const label = toFriendlyStatus(status);
  const variant = variantMap[status] || "secondary";
  const isActive = status === "in_progress" || status === "generating";
  const isQueued = status === "queued";

  if (isActive) {
    return (
      <Badge variant={variant} className="gap-1.5">
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
