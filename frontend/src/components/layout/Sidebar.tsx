"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  Sparkles,
  FolderOpen,
  FileText,
  History,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { APP_SECTION_COLORS, appSectionPalette, getAppSectionIndex } from "@/components/layout/app-route-colors";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Home" },
  { href: "/generate", icon: Video, label: "Create" },
  { href: "/projects", icon: FolderOpen, label: "Library" },
  { href: "/scripts", icon: FileText, label: "Scripts" },
  { href: "/history", icon: History, label: "Activity" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const activeSection = getAppSectionIndex(pathname);
  const rail = appSectionPalette(activeSection);
  const activeJobs = useProjectStore((s) => s.activeJobIds);
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <aside className="relative z-20 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200/90 bg-white/95 backdrop-blur-xl dark:border-zinc-700 dark:bg-zinc-950/95">
      {/* Active-section accent on the rail (edge toward main content) */}
      <motion.div
        key={activeSection}
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-px"
        initial={{ opacity: 0.45 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: `linear-gradient(180deg, transparent 0%, hsl(${rail.glow} / 0.55) 14%, hsl(${rail.accent} / 0.95) 50%, hsl(${rail.glow} / 0.55) 86%, transparent 100%)`,
          boxShadow: `-5px 0 20px hsl(${rail.glow} / 0.32), -12px 0 44px hsl(${rail.accent} / 0.12), -1px 0 0 hsl(${rail.accent} / 0.35)`,
        }}
        aria-hidden
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-zinc-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 shadow-[0_0_20px_rgba(56,189,248,0.4)]">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500">
            ShortsForge
          </p>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">Workspace</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Main">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          Main menu
        </p>
        {navItems.map((item, index) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const pal = APP_SECTION_COLORS[index];
          const activeStyle = isActive
            ? {
                background: `hsl(${pal.accent} / 0.11)`,
                boxShadow: `inset 0 0 0 1px hsl(${pal.accent} / 0.28)`,
                color: `hsl(${pal.accent})`,
              }
            : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                animation: "nav-item-enter 0.3s ease-out forwards",
                animationDelay: `${index * 35}ms`,
                ...activeStyle,
              }}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium opacity-0 transition-[color,background-color,box-shadow] duration-300",
                !isActive &&
                  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-100",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-200/80 px-3 pb-3 pt-3 pr-4 dark:border-zinc-800">
        {activeJobs.size > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-cyan-500/8 px-2.5 py-2 text-xs text-slate-600 dark:text-zinc-300">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-500" />
            <span className="min-w-0 truncate">
              {activeJobs.size} task{activeJobs.size > 1 ? "s" : ""} running
            </span>
          </div>
        )}
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {!mounted ? (
              <span className="h-4 w-4" aria-hidden />
            ) : resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
