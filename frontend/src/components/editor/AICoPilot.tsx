"use client";

import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Focus = "script" | "image_prompts" | "transitions";

export function AICoPilot({
  projectId,
  controlMode = "co_pilot",
}: {
  projectId: string;
  controlMode?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>("script");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  if (controlMode === "manual") return null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.projectAiSuggestions(projectId, { focus, hint: hint.trim() || null });
      setSuggestions(res.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-dashed border-cyan-500/30 bg-cyan-500/5">
      <CardHeader className="py-3 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            AI Co-pilot
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Suggestions only — nothing is applied until you edit scenes or script yourself.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["script", "Script"],
                ["image_prompts", "Visuals"],
                ["transitions", "Transitions"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={focus === id ? "default" : "outline"}
                onClick={() => setFocus(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="Optional hint for the model…"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          <Button type="button" size="sm" onClick={load} disabled={loading}>
            {loading ? "Thinking…" : "Get suggestions"}
          </Button>
          {suggestions.length > 0 && (
            <ul className="text-sm space-y-1 list-disc pl-4 text-slate-700 dark:text-slate-300">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
