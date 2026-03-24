"use client";

import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { GenerateFormValues } from "@/app/generate/schema";
import type { ContentSource } from "@/components/generate/ContentSourceTabs";

const DRAFT_KEY = "shortsforge-generate-draft-v2";

export type GenerateDraftPayload = {
  v: 2;
  values: GenerateFormValues;
  contentSource: ContentSource;
};

function normalizeContentSource(raw: unknown): ContentSource {
  if (raw === "script" || raw === "concept") return raw;
  return "script";
}

function withStoryTemplate<T extends { story_template?: string }>(values: T): T {
  if (values.story_template) return values;
  return { ...values, story_template: "default" };
}

type DraftOpts = {
  skipRestore: boolean;
  contentSource: ContentSource;
  setContentSource: (s: ContentSource) => void;
};

export function useGenerateDraft(form: UseFormReturn<GenerateFormValues>, opts: DraftOpts) {
  const { skipRestore, setContentSource } = opts;
  const restored = useRef(false);
  const metaRef = useRef({ contentSource: opts.contentSource });
  metaRef.current = { contentSource: opts.contentSource };

  useEffect(() => {
    if (skipRestore || restored.current) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as GenerateDraftPayload & { v?: number; contentSource?: string };
      if (!data?.values) return;
      if (data.v !== 2) {
        const legacy = data as { values: GenerateFormValues; contentSource?: string };
        form.reset(withStoryTemplate(legacy.values) as GenerateFormValues);
        setContentSource(normalizeContentSource(legacy.contentSource));
        restored.current = true;
        return;
      }
      form.reset(withStoryTemplate(data.values) as GenerateFormValues);
      setContentSource(normalizeContentSource(data.contentSource));
      restored.current = true;
    } catch {
      /* ignore */
    }
  }, [skipRestore, form, setContentSource]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const sub = form.watch(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const payload: GenerateDraftPayload = {
            v: 2,
            values: form.getValues(),
            contentSource: metaRef.current.contentSource,
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } catch {
          /* quota */
        }
      }, 600);
    });
    return () => {
      clearTimeout(t);
      sub.unsubscribe();
    };
  }, [form]);
}
