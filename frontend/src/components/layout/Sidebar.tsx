"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Video, Sparkles, FolderOpen,
  FileText, History, Settings, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Pulse" },
  { href: "/generate", icon: Video, label: "Create" },
  { href: "/sora", icon: Film, label: "Studio" },
  { href: "/projects", icon: FolderOpen, label: "Library" },
  { href: "/scripts", icon: FileText, label: "Scripts" },
  { href: "/history", icon: History, label: "Activity" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const activeJobs = useProjectStore((s) => s.activeJobIds);

  return (
    <aside className="flex flex-col w-64 border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 backdrop-blur-xl h-screen sticky top-0 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200/80 dark:border-zinc-700">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 flex items-center justify-center shadow-[0_0_18px_rgba(56,189,248,0.45)]">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-400 bg-clip-text text-transparent">
          ShortsForge
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ animation: "nav-item-enter 0.3s ease-out forwards", animationDelay: `${index * 40}ms` }}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 opacity-0 hover:translate-x-0.5",
                isActive
                  ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-slate-100"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {activeJobs.size > 0 && (
        <div className="p-4 border-t border-slate-200/80 dark:border-zinc-700">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            {activeJobs.size} active job{activeJobs.size > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </aside>
  );
}
