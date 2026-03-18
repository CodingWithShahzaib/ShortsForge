"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle,
  Clock,
  Star,
  TrendingUp,
  Video,
  Globe,
} from "lucide-react";

export type BentoAccentColor = "cyan" | "emerald" | "amber" | "rose" | "violet" | "sky";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  accentColor?: BentoAccentColor;
  cta?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
}

const NEON_STYLES: Record<BentoAccentColor, string> = {
  cyan: "text-cyan-400 [text-shadow:0_0_12px_rgba(34,211,238,0.9),0_0_24px_rgba(34,211,238,0.6),0_0_36px_rgba(34,211,238,0.4)]",
  emerald: "text-emerald-400 [text-shadow:0_0_12px_rgba(52,211,153,0.9),0_0_24px_rgba(52,211,153,0.6),0_0_36px_rgba(52,211,153,0.4)]",
  amber: "text-amber-400 [text-shadow:0_0_12px_rgba(251,191,36,0.9),0_0_24px_rgba(251,191,36,0.6),0_0_36px_rgba(251,191,36,0.4)]",
  rose: "text-rose-400 [text-shadow:0_0_12px_rgba(251,113,133,0.9),0_0_24px_rgba(251,113,133,0.6),0_0_36px_rgba(251,113,133,0.4)]",
  violet: "text-violet-400 [text-shadow:0_0_12px_rgba(167,139,250,0.9),0_0_24px_rgba(167,139,250,0.6),0_0_36px_rgba(167,139,250,0.4)]",
  sky: "text-sky-400 [text-shadow:0_0_12px_rgba(56,189,248,0.9),0_0_24px_rgba(56,189,248,0.6),0_0_36px_rgba(56,189,248,0.4)]",
};

interface BentoGridProps {
  items: BentoItem[];
}

const itemsSample: BentoItem[] = [
  {
    title: "Analytics Dashboard",
    meta: "v2.4.1",
    description:
      "Real-time metrics with AI-powered insights and predictive analytics",
    icon: <TrendingUp className="w-4 h-4 text-blue-500" />,
    status: "Live",
    tags: ["Statistics", "Reports", "AI"],
    colSpan: 2,
    hasPersistentHover: true,
  },
  {
    title: "Task Manager",
    meta: "84 completed",
    description: "Automated workflow management with priority scheduling",
    icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    status: "Updated",
    tags: ["Productivity", "Automation"],
  },
  {
    title: "Media Library",
    meta: "12GB used",
    description: "Cloud storage with intelligent content processing",
    icon: <Video className="w-4 h-4 text-purple-500" />,
    tags: ["Storage", "CDN"],
    colSpan: 2,
  },
  {
    title: "Global Network",
    meta: "6 regions",
    description: "Multi-region deployment with edge computing",
    icon: <Globe className="w-4 h-4 text-sky-500" />,
    status: "Beta",
    tags: ["Infrastructure", "Edge"],
  },
];

function BentoGrid({ items = itemsSample }: BentoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "group relative p-4 rounded-xl overflow-hidden transition-all duration-300",
            "border border-slate-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900/95",
            "hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]",
            "hover:-translate-y-0.5 will-change-transform",
            item.colSpan === 2 && "md:col-span-2",
            {
              "shadow-[0_2px_12px_rgba(0,0,0,0.03)] -translate-y-0.5":
                item.hasPersistentHover,
              "dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]":
                item.hasPersistentHover,
            }
          )}
        >
          <div
            className={`absolute inset-0 ${
              item.hasPersistentHover
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            } transition-opacity duration-300`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:4px_4px]" />
          </div>

          <div className="relative flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-black/5 dark:bg-zinc-800/80 group-hover:bg-gradient-to-br transition-all duration-300">
                {item.icon}
              </div>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded-lg backdrop-blur-sm",
                  "bg-black/5 dark:bg-zinc-800/80 text-slate-600 dark:text-slate-300",
                  "transition-colors duration-300 group-hover:bg-black/10 dark:group-hover:bg-zinc-700/80"
                )}
              >
                {item.status || "Active"}
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium text-slate-900 dark:text-slate-100 tracking-tight text-[15px]">
                {item.title}
              </h3>
              {item.meta != null && (
                <div
                  className={cn(
                    "text-3xl font-bold tabular-nums tracking-tight",
                    item.accentColor ? NEON_STYLES[item.accentColor] : "text-slate-700 dark:text-slate-300"
                  )}
                >
                  {item.meta}
                </div>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug font-[425]">
                {item.description}
              </p>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                {item.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-md bg-black/5 dark:bg-zinc-800/80 backdrop-blur-sm transition-all duration-200 hover:bg-black/10 dark:hover:bg-zinc-700/80"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {item.cta && (
                <span className="text-xs text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.cta}
                </span>
              )}
            </div>
          </div>

          <div
            className={`absolute inset-0 -z-10 rounded-xl p-px bg-gradient-to-br from-transparent via-slate-200/50 to-transparent dark:via-zinc-600/50 ${
              item.hasPersistentHover
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            } transition-opacity duration-300`}
          />
        </div>
      ))}
    </div>
  );
}

export { BentoGrid };
