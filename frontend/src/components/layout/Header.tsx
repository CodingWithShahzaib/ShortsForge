"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useProjectStore } from "@/stores/projectStore";

export function Header() {
  const { setTheme, resolvedTheme } = useTheme();
  const activeJobIds = useProjectStore((s) => s.activeJobIds);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/95 backdrop-blur-xl px-6 shadow-sm dark:shadow-none">
      <div>
        {activeJobIds.size > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            {activeJobIds.size} job{activeJobIds.size > 1 ? "s" : ""} running
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {!mounted ? (
            <span className="h-4 w-4" aria-hidden />
          ) : resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
