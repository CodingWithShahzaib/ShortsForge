"use client";

type InlineErrorProps = {
  message: string;
  className?: string;
};

export function InlineError({ message, className }: InlineErrorProps) {
  return <p className={`text-xs text-red-600 dark:text-red-400 ${className || ""}`}>{message}</p>;
}
