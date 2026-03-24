"use client";

import { memo, useTransition } from "react";

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
      className="flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg"
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
            className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-colors ${
              selected
                ? "bg-white dark:bg-zinc-900/95 shadow-sm text-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
});
