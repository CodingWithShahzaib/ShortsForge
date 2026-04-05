"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CreationPageShellProps = {
  header?: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CreationPageShell({
  header,
  intro,
  children,
  aside,
  className,
  contentClassName,
}: CreationPageShellProps) {
  return (
    <div className={cn("w-full min-w-0 space-y-4", className)}>
      {header}
      {intro}

      {aside ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]",
            contentClassName,
          )}
        >
          <div className="min-w-0 space-y-4">{children}</div>
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">{aside}</aside>
        </div>
      ) : (
        <div className={cn("min-w-0 space-y-4", contentClassName)}>{children}</div>
      )}
    </div>
  );
}
