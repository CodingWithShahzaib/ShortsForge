"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** When false, put `id` on the actual input/textarea inside children yourself (e.g. flex row with button). */
  applyIdToChild?: boolean;
  children: React.ReactNode;
};

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
  applyIdToChild = true,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;

  const child =
    React.isValidElement(children)
      ? React.cloneElement(children, {
          "aria-invalid": !!error,
          "aria-describedby": describedBy,
          ...(applyIdToChild ? { id } : {}),
        } as Record<string, unknown>)
      : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium block" htmlFor={id}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      {child}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
