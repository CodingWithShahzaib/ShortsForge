"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("sf-skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}
