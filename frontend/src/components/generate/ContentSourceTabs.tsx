"use client";

import { memo, useTransition } from "react";
import { Play } from "lucide-react";

export type ContentSource = "concept" | "script";

const TABS: { id: ContentSource; label: string }[] = [
  { id: "concept", label: "Concept" },
  { id: "script", label: "Custom Script" },
];

type Props = {
  value: ContentSource;
  onChange: (next: ContentSource) => void;
};

export const ContentSourceTabs = memo(function ContentSourceTabs({ value, onChange }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="tablist"
      aria-label="Content source"
      className="flex gap-0.5 rounded-md bg-slate-100 p-0.5 dark:bg-zinc-800/80"
    >
      {TABS.map(({ id, label }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`content-tab-${id}`}
            aria-selected={selected}
            aria-controls={`content-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            disabled={pending}
            onClick={() => {
              startTransition(() => onChange(id));
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? "bg-white dark:bg-zinc-900/95 shadow-sm text-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {id === "concept" ? (
              <>
                <Play
                  className="h-3.5 w-3.5 shrink-0 fill-current opacity-90"
                  aria-hidden
                />
                {label}
              </>
            ) : (
              label
            )}
          </button>
        );
      })}
    </div>
  );
});
