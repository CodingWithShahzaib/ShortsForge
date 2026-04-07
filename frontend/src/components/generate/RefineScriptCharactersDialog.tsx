"use client";

import { useEffect, useMemo, useState } from "react";

import { CharacterManager } from "@/components/character-manager/CharacterManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import type { CharacterConfig, Voice } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;
  storyType: string;
  llmProvider: string;
  llmModel?: string | null;
  voices: Voice[];
  initialCharacters: CharacterConfig[];
  onApply: (payload: { text: string; characters: CharacterConfig[] }) => void;
};

export function RefineScriptCharactersDialog({
  open,
  onOpenChange,
  script,
  storyType,
  llmProvider,
  llmModel,
  voices,
  initialCharacters,
  onApply,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [refinedScript, setRefinedScript] = useState("");
  const [characters, setCharacters] = useState<CharacterConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInstruction("");
    setRefinedScript(script);
    setCharacters(initialCharacters);
    setHasGenerated(false);
  }, [initialCharacters, open, script]);

  const scriptStats = useMemo(() => {
    const trimmed = refinedScript.trim();
    if (!trimmed) {
      return { words: 0, lines: 0 };
    }
    return {
      words: trimmed.split(/\s+/).filter(Boolean).length,
      lines: trimmed.split("\n").filter((line) => line.trim().length > 0).length,
    };
  }, [refinedScript]);

  const handleGenerate = async () => {
    if (!script.trim()) {
      notify.error("Add a script before refining it.");
      return;
    }
    if (!instruction.trim()) {
      notify.error("Describe what should change in the script.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.refineScriptCharacters({
        text: script,
        instruction,
        story_type: storyType,
        llm_provider: llmProvider,
        llm_model: llmModel,
      });
      setRefinedScript(result.text);
      setCharacters(result.characters);
      setHasGenerated(true);
      notify.success("Refined script and characters are ready.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Refine request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!refinedScript.trim()) {
      notify.error("Generate a refined script first.");
      return;
    }
    if (characters.length < 2) {
      notify.error("Generate at least two characters before applying.");
      return;
    }
    onApply({ text: refinedScript, characters });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle>Refine current script and create relevant characters</DialogTitle>
            <DialogDescription>
              Describe the change you want. The assistant will rewrite the current script and suggest a dialogue-ready cast.
            </DialogDescription>
          </DialogHeader>

          <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-4 overflow-y-auto border-b border-border/60 px-6 py-5 lg:border-b-0 lg:border-r">
              <Field
                id="refine-script-instruction"
                label="What should change in the current script?"
                hint="Example: Make it sharper, more current, and turn it into a debate between a host and an analyst."
              >
                <Textarea
                  id="refine-script-instruction"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={5}
                  placeholder="Explain the changes you want..."
                />
              </Field>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Current script source</p>
                  <span className="text-xs text-muted-foreground">
                    {script.trim().split(/\s+/).filter(Boolean).length || 0} words
                  </span>
                </div>
                <Textarea
                  value={script}
                  readOnly
                  rows={12}
                  className="mt-3 resize-none bg-background/70"
                />
              </div>

              <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                Uses the selected script AI. Search-backed refinement is enabled when the chosen provider/model supports it.
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Generated result</p>
                  <p className="text-xs text-muted-foreground">
                    Review the rewritten dialogue and adjust any character details before applying.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                    {scriptStats.words} words
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                    {scriptStats.lines} lines
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                    {characters.length} characters
                  </span>
                </div>
              </div>

              <Field
                id="refined-dialogue-script"
                label="Refined script"
                hint="This will replace the current script when you apply the result."
              >
                <Textarea
                  id="refined-dialogue-script"
                  value={refinedScript}
                  onChange={(event) => setRefinedScript(event.target.value)}
                  rows={12}
                  placeholder="The refined dialogue script will appear here."
                />
              </Field>

              {hasGenerated || characters.length > 0 ? (
                <CharacterManager characters={characters} voices={voices} onChange={setCharacters} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/25 p-5 text-sm text-muted-foreground">
                  Run the refine step to populate a character cast for this script.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate refined draft"}
            </Button>
            <Button type="button" onClick={handleApply} disabled={loading || !hasGenerated}>
              Apply script and characters
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
