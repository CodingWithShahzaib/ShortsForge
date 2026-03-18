"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Copy, Check, Plus, Minus, GripVertical, LayoutGrid, Send,
  Volume2, Camera, Shield, Sparkles, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TimelineEntry {
  id: string;
  startSec: number;
  endSec: number;
  phaseLabel?: string;
  script: string;
  bulletNotes: string[];
}

export interface DirectorBoardState {
  overallStory: string;
  totalDuration: number;
  timelineEntries: TimelineEntry[];
  cinematicSettings: string;
  audioDesign: string;
  safetyRules: string[];
  customSafetyRules: string;
}

const PHASE_OPTIONS = ["Hook", "Build", "Climax", "Resolution", "Scan", "Approach", "Discovery", "Reaction", "Tension", "Escape", "Loop Ending"];

const CINEMATIC_PRESETS = [
  { id: "photorealistic", label: "Ultra photorealistic" },
  { id: "8k", label: "8K resolution" },
  { id: "smartphone", label: "Smartphone-style video" },
  { id: "handheld", label: "Handheld shake + micro jitter" },
  { id: "autofocus", label: "Autofocus breathing" },
  { id: "lowlight", label: "Low-light grain" },
  { id: "cinematic", label: "Cinematic camera" },
];

const SAFETY_RULE_PRESETS = [
  "No real song or copyrighted melody",
  "No advanced human-like instrument playing",
  "No aggression",
  "No exaggerated facial expressions",
  "No text or overlays",
  "Keep behavior natural and believable",
];

function generateId() {
  return `tl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function compileToSoraPrompt(state: DirectorBoardState, selectedCinematic: Set<string>): string {
  const parts: string[] = [];

  if (state.overallStory.trim()) {
    parts.push(`Prompt:\n\n${state.overallStory.trim()}`);
  }

  if (state.timelineEntries.length > 0) {
    const validEntries = state.timelineEntries.filter((e) => e.script.trim());
    if (validEntries.length > 0) {
      const lastEnd = validEntries[validEntries.length - 1].endSec;
      parts.push(`\n⏱️ DETAILED TIMELINE (0.0s → ${lastEnd}s)`);
      validEntries.forEach((e) => {
        const phasePart = e.phaseLabel ? ` (${e.phaseLabel})` : "";
        parts.push(`\n${e.startSec}s – ${e.endSec}s${phasePart}\n\n${e.script.trim()}`);
        if (e.bulletNotes.length > 0) {
          e.bulletNotes.filter((n) => n.trim()).forEach((n) => parts.push(`\n👉 ${n.trim()}`));
        }
      });
    }
  }

  const cinematicPresetLines = CINEMATIC_PRESETS.filter((p) => selectedCinematic.has(p.id)).map((p) => p.label);
  const cinematicContent = [...cinematicPresetLines, state.cinematicSettings.trim()].filter(Boolean).join("\n");
  if (cinematicContent) {
    parts.push(`\n\n🎨 CINEMATIC & TECH SETTINGS\n\n${cinematicContent}`);
  }

  if (state.audioDesign.trim()) {
    parts.push(`\n\n🔊 AUDIO DESIGN (IMPORTANT FOR VIRALITY)\n\n${state.audioDesign.trim()}`);
  }

  const allSafetyRules = [
    ...state.safetyRules,
    ...state.customSafetyRules
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  if (allSafetyRules.length > 0) {
    const formatted = allSafetyRules.map((r) => {
      if (/^(no\s|keep\s)/i.test(r)) return r;
      return `No ${r}`;
    });
    parts.push(`\n\n🚫 STRICT SAFETY RULES\n\n${formatted.join("\n")}`);
  }

  return parts.join("");
}

interface DirectorBoardProps {
  onSendToGenerate?: (prompt: string) => void;
}

const INITIAL_STATE: DirectorBoardState = {
  overallStory: "",
  totalDuration: 8,
  timelineEntries: [
    { id: generateId(), startSec: 0, endSec: 0.7, phaseLabel: "Hook", script: "", bulletNotes: [] },
  ],
  cinematicSettings: "",
  audioDesign: "",
  safetyRules: [],
  customSafetyRules: "",
};

export function DirectorBoard({ onSendToGenerate }: DirectorBoardProps) {
  const providers = useSettingsStore((s) => s.providers);
  const [state, setState] = useState<DirectorBoardState>(INITIAL_STATE);
  const [showOutput, setShowOutput] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedCinematic, setSelectedCinematic] = useState<Set<string>>(new Set());
  const defaults = useSettingsStore((s) => s.defaults);
  const [llmProvider, setLlmProvider] = useState(defaults.llm_provider);
  const [generating, setGenerating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const compiledPrompt = useCallback(() => compileToSoraPrompt(state, selectedCinematic), [state, selectedCinematic]);

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledPrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToGenerate = () => {
    onSendToGenerate?.(compiledPrompt());
  };

  const addTimelineEntry = () => {
    const last = state.timelineEntries[state.timelineEntries.length - 1];
    const startSec = last ? last.endSec : 0;
    const endSec = Math.min(startSec + 0.8, state.totalDuration);
    setState((s) => ({
      ...s,
      timelineEntries: [
        ...s.timelineEntries,
        { id: generateId(), startSec, endSec, script: "", bulletNotes: [] },
      ],
    }));
  };

  const removeTimelineEntry = (id: string) => {
    setState((s) => ({
      ...s,
      timelineEntries: s.timelineEntries.filter((e) => e.id !== id),
    }));
  };

  const updateTimelineEntry = (id: string, updates: Partial<TimelineEntry>) => {
    setState((s) => ({
      ...s,
      timelineEntries: s.timelineEntries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }));
  };

  const addBulletNote = (entryId: string) => {
    setState((s) => ({
      ...s,
      timelineEntries: s.timelineEntries.map((e) =>
        e.id === entryId ? { ...e, bulletNotes: [...e.bulletNotes, ""] } : e
      ),
    }));
  };

  const updateBulletNote = (entryId: string, idx: number, value: string) => {
    setState((s) => ({
      ...s,
      timelineEntries: s.timelineEntries.map((e) =>
        e.id === entryId
          ? {
              ...e,
              bulletNotes: e.bulletNotes.map((n, i) => (i === idx ? value : n)),
            }
          : e
      ),
    }));
  };

  const removeBulletNote = (entryId: string, idx: number) => {
    setState((s) => ({
      ...s,
      timelineEntries: s.timelineEntries.map((e) =>
        e.id === entryId
          ? { ...e, bulletNotes: e.bulletNotes.filter((_, i) => i !== idx) }
          : e
      ),
    }));
  };

  const toggleSafetyRule = (rule: string) => {
    setState((s) => ({
      ...s,
      safetyRules: s.safetyRules.includes(rule)
        ? s.safetyRules.filter((r) => r !== rule)
        : [...s.safetyRules, rule],
    }));
  };

  const toggleCinematicPreset = (preset: string) => {
    setSelectedCinematic((prev) => {
      const next = new Set(prev);
      if (next.has(preset)) next.delete(preset);
      else next.add(preset);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = state.timelineEntries.findIndex((e) => e.id === active.id);
    const newIdx = state.timelineEntries.findIndex((e) => e.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(state.timelineEntries, oldIdx, newIdx);
    setState((s) => ({ ...s, timelineEntries: reordered }));
  };

  const handleGenerateWithAI = async () => {
    if (!state.overallStory.trim()) {
      toast.error("Add overall story first");
      return;
    }
    setGenerating(true);
    try {
      const result = await api.generateDirectorBoardSections({
        overall_story: state.overallStory,
        timeline_entries: state.timelineEntries.map((e) => ({
          start_sec: e.startSec,
          end_sec: e.endSec,
          phase_label: e.phaseLabel,
          script: e.script,
          bullet_notes: e.bulletNotes,
        })),
        total_duration: state.totalDuration,
        llm_provider: llmProvider,
      });
      const timelineEntries = (result.timeline_entries || []).map((e) => ({
        id: generateId(),
        startSec: e.start_sec,
        endSec: e.end_sec,
        phaseLabel: e.phase_label || undefined,
        script: e.script || "",
        bulletNotes: e.bullet_notes || [],
      }));
      setState((s) => ({
        ...s,
        timelineEntries: timelineEntries.length > 0 ? timelineEntries : s.timelineEntries,
        cinematicSettings: result.cinematic_settings || "",
        audioDesign: result.audio_design || "",
        safetyRules: result.safety_rules || [],
      }));
      toast.success("Timeline, cinematic, audio & safety sections generated");
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" /> Director Board
          </h2>
          <Badge variant="secondary" className="font-mono text-xs">
            {state.totalDuration}s
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowOutput(!showOutput)}>
            {showOutput ? "Hide" : "Show"} Output
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "Copied" : "Copy Prompt"}
          </Button>
          {onSendToGenerate && (
            <Button variant="animated" size="sm" onClick={handleSendToGenerate}>
              <Send className="h-4 w-4 mr-1" /> Send to Generate
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          {/* Overall Story */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overall Story</CardTitle>
              <CardDescription>
                Describe the scene setup: environment, camera type, lighting, mood. This becomes the opening paragraph of your Sora prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="A hyper-realistic handheld smartphone recording inside a dimly lit bedroom at night. Warm ambient lighting from a bedside lamp creates soft shadows..."
                rows={5}
                value={state.overallStory}
                onChange={(e) => setState((s) => ({ ...s, overallStory: e.target.value }))}
                className="font-mono text-sm"
              />
              <div>
                <label className="text-sm font-medium mb-1.5 block">Total Duration</label>
                <div className="flex gap-2">
                  {[4, 8, 12, 16, 20].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setState((s) => ({ ...s, totalDuration: sec }))}
                      className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
                        state.totalDuration === sec
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600"
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400"
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Entries */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Timeline (Script vs Timestamp)</CardTitle>
                  <CardDescription>
                    Add timestamped segments. Drag to reorder.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addTimelineEntry}>
                  <Plus className="h-4 w-4 mr-1" /> Add Segment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={state.timelineEntries.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {state.timelineEntries.map((entry, idx) => (
                      <SortableTimelineRow
                        key={entry.id}
                        entry={entry}
                        idx={idx}
                        totalDuration={state.totalDuration}
                        onUpdate={(updates) => updateTimelineEntry(entry.id, updates)}
                        onRemove={() => removeTimelineEntry(entry.id)}
                        onAddBullet={() => addBulletNote(entry.id)}
                        onUpdateBullet={(i, v) => updateBulletNote(entry.id, i, v)}
                        onRemoveBullet={(i) => removeBulletNote(entry.id, i)}
                        canRemove={state.timelineEntries.length > 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Generate with AI */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
              </CardTitle>
              <CardDescription>
                Write your overall story and select duration. AI will generate timeline (split by duration), cinematic settings, audio design, and safety rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">LLM Provider</label>
                <Select value={llmProvider} onValueChange={setLlmProvider}>
                  <SelectTrigger className="border-border/60">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {(providers.llm?.filter((p) => p.configured) ?? []).length > 0
                      ? providers.llm.filter((p) => p.configured).map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                          </SelectItem>
                        ))
                      : <SelectItem value="openai">OpenAI</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="default"
                onClick={handleGenerateWithAI}
                disabled={generating || !state.overallStory.trim()}
                className="w-full h-11 font-medium bg-primary hover:bg-primary/90"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Generate Timeline, Cinematic, Audio & Safety
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Cinematic & Tech Settings (AI-generated, editable) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4" /> Cinematic & Tech Settings
              </CardTitle>
              <CardDescription>AI-generated. Edit as needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CINEMATIC_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleCinematicPreset(p.id)}
                    className={`px-2.5 py-1 text-xs rounded border transition-all ${
                      selectedCinematic.has(p.id)
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Generated by AI or add manually..."
                rows={4}
                value={state.cinematicSettings}
                onChange={(e) => setState((s) => ({ ...s, cinematicSettings: e.target.value }))}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Audio Design (AI-generated, editable) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Volume2 className="h-4 w-4" /> Audio Design
              </CardTitle>
              <CardDescription>AI-generated. Edit as needed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Generated by AI or add manually..."
                rows={4}
                value={state.audioDesign}
                onChange={(e) => setState((s) => ({ ...s, audioDesign: e.target.value }))}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Safety Rules (AI-generated, editable) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Strict Safety Rules
              </CardTitle>
              <CardDescription>AI-generated. Toggle or add custom rules.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SAFETY_RULE_PRESETS.map((rule) => (
                  <button
                    key={rule}
                    onClick={() => toggleSafetyRule(rule)}
                    className={`px-2.5 py-1 text-xs rounded border transition-all ${
                      state.safetyRules.includes(rule)
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400"
                    }`}
                  >
                    {rule}
                  </button>
                ))}
                {state.safetyRules
                  .filter((r) => !SAFETY_RULE_PRESETS.includes(r))
                  .map((rule) => (
                    <button
                      key={rule}
                      onClick={() => toggleSafetyRule(rule)}
                      className="px-2.5 py-1 text-xs rounded border border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                    >
                      {rule}
                    </button>
                  ))}
              </div>
              <Textarea
                placeholder="Custom rules (one per line)..."
                rows={2}
                value={state.customSafetyRules}
                onChange={(e) => setState((s) => ({ ...s, customSafetyRules: e.target.value }))}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Output Panel */}
      {showOutput && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compiled Prompt Preview</CardTitle>
            <CardDescription>Live preview of the Sora-ready prompt.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-zinc-100 dark:bg-zinc-900 rounded-lg p-4 max-h-80 overflow-auto whitespace-pre-wrap break-words">
              {compiledPrompt() || "(Fill in the sections above to see the compiled prompt)"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SortableTimelineRow({
  entry,
  idx,
  totalDuration,
  onUpdate,
  onRemove,
  onAddBullet,
  onUpdateBullet,
  onRemoveBullet,
  canRemove,
}: {
  entry: TimelineEntry;
  idx: number;
  totalDuration: number;
  onUpdate: (updates: Partial<TimelineEntry>) => void;
  onRemove: () => void;
  onAddBullet: () => void;
  onUpdateBullet: (idx: number, value: string) => void;
  onRemoveBullet: (idx: number) => void;
  canRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/30"
    >
      <div className="flex gap-3 items-start">
        <button
          {...attributes}
          {...listeners}
          className="mt-2 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-grab active:cursor-grabbing text-zinc-400"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {idx + 1}
            </Badge>
            <Input
              type="number"
              step={0.1}
              min={0}
              max={totalDuration}
              value={entry.startSec}
              onChange={(e) => onUpdate({ startSec: parseFloat(e.target.value) || 0 })}
              className="w-16 h-8 text-xs font-mono"
              placeholder="0.0"
            />
            <span className="text-zinc-400">–</span>
            <Input
              type="number"
              step={0.1}
              min={0}
              max={totalDuration}
              value={entry.endSec}
              onChange={(e) => onUpdate({ endSec: parseFloat(e.target.value) || 0 })}
              className="w-16 h-8 text-xs font-mono"
              placeholder="0.7"
            />
            <span className="text-zinc-400 text-xs">s</span>
            <select
              value={entry.phaseLabel || ""}
              onChange={(e) => onUpdate({ phaseLabel: e.target.value || undefined })}
              className="h-8 px-2 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-background"
            >
              <option value="">Phase</option>
              {PHASE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {canRemove && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={onRemove}>
                <Minus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Input
            placeholder="Script / action for this segment..."
            value={entry.script}
            onChange={(e) => onUpdate({ script: e.target.value })}
            className="text-sm"
          />
          {entry.bulletNotes.map((note, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-zinc-400 text-xs">👉</span>
              <Input
                placeholder="Bullet note"
                value={note}
                onChange={(e) => onUpdateBullet(i, e.target.value)}
                className="text-xs flex-1"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveBullet(i)}>
                <Minus className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddBullet}>
            <Plus className="h-3 w-3 mr-1" /> Add bullet
          </Button>
        </div>
      </div>
    </div>
  );
}
