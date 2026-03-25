"use client";

import { memo, useEffect, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Play } from "lucide-react";
import type { GenerateFormValues } from "@/app/generate/schema";
import type { ContentSource } from "@/components/generate/ContentSourceTabs";

type Props = {
  contentSource: ContentSource;
  generating: boolean;
  onSubmitValid: (values: GenerateFormValues) => Promise<void>;
};

export const GenerateStickyActions = memo(function GenerateStickyActions({
  contentSource,
  generating,
  onSubmitValid,
}: Props) {
  const form = useFormContext<GenerateFormValues>();
  const titleVal = useWatch({ control: form.control, name: "title" });
  const scriptVal = useWatch({ control: form.control, name: "custom_script" });
  const storyType = useWatch({ control: form.control, name: "story_type" });
  const llmProvider = useWatch({ control: form.control, name: "llm_provider" });
  const imageProvider = useWatch({ control: form.control, name: "image_provider" });
  const ttsProvider = useWatch({ control: form.control, name: "tts_provider" });
  const ttsVoice = useWatch({ control: form.control, name: "tts_voice" });
  const resolution = useWatch({ control: form.control, name: "resolution" });

  const canGenerate =
    contentSource === "concept" ? !!titleVal?.trim() : !!scriptVal?.trim();
  const generateHint = !canGenerate
    ? contentSource === "concept"
      ? "Add a title or concept to continue."
      : "Paste or write your script below."
    : null;
  const requiredChecks = [
    { key: "content", label: contentSource === "concept" ? "Title or concept" : "Script", ok: canGenerate },
    { key: "story_type", label: "Story type", ok: !!storyType?.trim() },
    { key: "llm_provider", label: "LLM provider", ok: !!llmProvider?.trim() },
    { key: "image_provider", label: "Image provider", ok: !!imageProvider?.trim() },
    { key: "tts_provider", label: "TTS provider", ok: !!ttsProvider?.trim() },
    { key: "tts_voice", label: "Voice", ok: !!ttsVoice?.trim() },
    { key: "resolution", label: "Resolution", ok: !!resolution?.trim() },
  ];
  const completedChecks = requiredChecks.filter((c) => c.ok).length;

  const handleGenerate = useCallback(() => {
    void form.handleSubmit(onSubmitValid)();
  }, [form, onSubmitValid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (!canGenerate || generating) return;
        e.preventDefault();
        void form.handleSubmit(onSubmitValid)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canGenerate, generating, form, onSubmitValid]);

  return (
    <Card className="lg:static sticky bottom-4 z-20 border-border/80 shadow-lg lg:shadow-sm">
      <CardContent className="pt-6 space-y-2">
        <Button
          variant="animated"
          className="w-full h-12 text-base"
          type="button"
          onClick={handleGenerate}
          disabled={generating || !canGenerate}
        >
          {generating ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{" "}
              Generating...
            </>
          ) : (
            <>
              <Play className="h-5 w-5" /> Generate Video
            </>
          )}
        </Button>
        {generateHint && (
          <p className="text-xs text-center text-muted-foreground" role="status">
            {generateHint}
          </p>
        )}
        <p className="text-[10px] text-center text-muted-foreground/80">
          <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">Ctrl</kbd>+
          <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">Enter</kbd> to
          generate
        </p>
        <div className="rounded-md border border-border/70 p-2.5">
          <p className="text-xs font-medium mb-1">
            Required checklist ({completedChecks}/{requiredChecks.length})
          </p>
          <div className="space-y-1">
            {requiredChecks.map((item) => (
              <p key={item.key} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                {item.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                {item.label}
              </p>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
