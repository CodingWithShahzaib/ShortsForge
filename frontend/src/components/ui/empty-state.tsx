"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`py-16 text-center ${className || ""}`}>
      <p className="text-base font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
