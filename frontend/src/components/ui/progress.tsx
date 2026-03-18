"use client";

import React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface Vo2MaxCardProps {
  /** The main title of the card. */
  title: string;
  /** The primary numerical value to display. */
  value: number;
  /** A descriptive status text below the value (e.g., 'Excellent'). */
  status: string;
  /** A footer description. Can be a string or a ReactNode for rich text. */
  description: React.ReactNode;
  /** The progress percentage (0-100) for the radial bar. */
  progress: number;
  /** An icon component to display in the top-right corner. */
  icon: React.ReactNode;
  /** Optional className to merge with the default card styles. */
  className?: string;
  /** Compact size for overlay/thumbnail use. */
  compact?: boolean;
}

export const Vo2MaxCard: React.FC<Vo2MaxCardProps> = ({
  title,
  value,
  status,
  description,
  progress,
  icon,
  className,
  compact = false,
}) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const progressValue = useMotionValue(0);

  React.useEffect(() => {
    const valueAnimation = animate(count, value, {
      duration: 1.5,
      ease: [0.43, 0.13, 0.23, 0.96],
    });

    const progressAnimation = animate(progressValue, progress, {
      duration: 1.5,
      ease: [0.43, 0.13, 0.23, 0.96],
    });

    return () => {
      valueAnimation.stop();
      progressAnimation.stop();
    };
  }, [value, progress, count, progressValue]);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = useTransform(
    progressValue,
    (v) => circumference - (v / 100) * circumference
  );

  return (
    <div
      className={cn(
        "relative flex w-full flex-col gap-4 rounded-2xl border bg-card p-6 text-card-foreground shadow-sm overflow-hidden",
        compact ? "max-w-[180px] gap-2 p-3" : "max-w-sm gap-4 p-6",
        className
      )}
    >
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-10" />

      <div className="flex items-center justify-between">
        <h3 className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-lg")}>{title}</h3>
        <div className={cn("flex items-center justify-center rounded-full bg-primary text-primary-foreground", compact ? "h-6 w-6" : "h-10 w-10")}>
          {icon}
        </div>
      </div>

      <div className={cn("relative flex w-full items-center justify-center", compact ? "h-28" : "h-56")}>
        <svg
          width={compact ? 100 : 200}
          height={compact ? 100 : 200}
          viewBox="0 0 200 200"
          className="-rotate-90"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <circle
            cx="100"
            cy="100"
            r={radius}
            strokeWidth={compact ? "8" : "12"}
            fill="transparent"
            className="stroke-primary/10"
            strokeDasharray="8 12"
            strokeLinecap="round"
          />
          <motion.circle
            cx="100"
            cy="100"
            r={radius}
            strokeWidth={compact ? "8" : "12"}
            fill="transparent"
            className="stroke-primary"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="round"
            style={{ strokeDashoffset }}
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center">
          <motion.span className={cn("font-bold tracking-tighter", compact ? "text-2xl" : "text-6xl")}>
            {rounded}
          </motion.span>
          <p className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-xl")}>{status}</p>
        </div>
      </div>

      {!compact && (
        <div className="text-center text-sm text-muted-foreground">
          {description}
        </div>
      )}
    </div>
  );
};
