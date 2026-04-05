"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  GripVertical,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { BodyPortal } from "@/components/ui/drag-overlay-portal";
import { appConfirm } from "@/stores/confirmDialogStore";
import type { Project, Scene } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ScriptStepProps {
  project: Project;
  scenes: Scene[];
  isGenerating: boolean;
  progressDetail?: string;
  /** True when the last video_render job failed before any scenes existed (or user should retry script generation). */
  projectFailed?: boolean;
  failureMessage?: string;
  onRetryGeneration?: () => void | Promise<void>;
  pipelineBusy?: boolean;
  onScenesChange: () => void;
  onNext: () => void;
}

const STORYBOARD_PHASES = [
  {
    label: "Read brief",
    description: "Interpreting your concept and story settings.",
  },
  {
    label: "Draft beats",
    description: "Turning the script into scene-by-scene moments.",
  },
  {
    label: "Tune pacing",
    description: "Balancing rhythm, hooks, and scene timing.",
  },
  {
    label: "Prep handoff",
    description: "Locking the storyboard for visual generation.",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Generating Mode                                                    */
/* ------------------------------------------------------------------ */

function GeneratingView({
  scenes,
  targetCount,
  progressDetail,
}: {
  scenes: Scene[];
  targetCount: number;
  progressDetail?: string;
}) {
  const draftedScenes = scenes.length;
  const safeTargetCount = Math.max(targetCount, draftedScenes, 1);
  const normalizedDetail = (progressDetail || "").toLowerCase();
  const detailPhaseIndex = useMemo(() => {
    if (!normalizedDetail) return null;
    if (
      normalizedDetail.includes("brief") ||
      normalizedDetail.includes("concept") ||
      normalizedDetail.includes("story settings") ||
      normalizedDetail.includes("storyboard queued")
    ) {
      return 0;
    }
    if (
      normalizedDetail.includes("draft") ||
      normalizedDetail.includes("beat") ||
      normalizedDetail.includes("scene") ||
      normalizedDetail.includes("script")
    ) {
      return 1;
    }
    if (
      normalizedDetail.includes("pace") ||
      normalizedDetail.includes("timing") ||
      normalizedDetail.includes("rhythm") ||
      normalizedDetail.includes("hook")
    ) {
      return 2;
    }
    if (
      normalizedDetail.includes("prep") ||
      normalizedDetail.includes("handoff") ||
      normalizedDetail.includes("final") ||
      normalizedDetail.includes("lock")
    ) {
      return 3;
    }
    return null;
  }, [normalizedDetail]);
  const activePhaseIndex =
    detailPhaseIndex ?? (draftedScenes > 0 ? STORYBOARD_PHASES.length - 1 : 0);
  const activePhase = STORYBOARD_PHASES[activePhaseIndex];
  const recentScenes = scenes.slice(-3).reverse();
  const hasDraftedScenes = draftedScenes > 0;
  const statusLabel = progressDetail?.trim() || activePhase.description;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-card/85 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Storyboard engine
          </span>
          <span className="inline-flex rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            {hasDraftedScenes ? "Draft assembled" : "Generating"}
          </span>
          <span className="inline-flex rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            Target {safeTargetCount} scenes
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Building your storyboard
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Progress is phase-based while the system prepares scene-ready beats.
        </p>

        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {STORYBOARD_PHASES.map((phase, index) => {
            const isDone = hasDraftedScenes ? index <= activePhaseIndex : index < activePhaseIndex;
            const isActive = !hasDraftedScenes && index === activePhaseIndex;
            return (
              <li
                key={phase.label}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  isDone && "border-emerald-500/30 bg-emerald-500/5",
                  isActive && "border-primary/35 bg-primary/5",
                  !isDone && !isActive && "border-border/60 bg-background/70",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                      isDone && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                      isActive && "border-primary/35 bg-primary/10 text-primary",
                      !isDone && !isActive && "border-border/60 text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <p className="text-sm font-medium">{phase.label}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{phase.description}</p>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">Current status</p>
          <p className="mt-1 text-sm text-muted-foreground">{statusLabel}</p>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest scenes</p>
          {recentScenes.length > 0 ? (
            <div className="mt-2 space-y-2">
              {recentScenes.map((scene, index) => (
                <div key={scene.id} className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">Scene {draftedScenes - index}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {scene.narration || scene.subtitle || "Drafting narration..."}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Scene cards will appear here as soon as generation completes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable Scene Card                                                */
/* ------------------------------------------------------------------ */

interface SceneCardProps {
  scene: Scene;
  index: number;
  localEdits: Record<string, { narration?: string; image_prompt?: string }>;
  onLocalEdit: (
    id: string,
    field: "narration" | "image_prompt",
    value: string,
  ) => void;
  onDelete: (id: string) => void;
}

/** Lightweight clone under the cursor — avoids fighting framer-motion layout on the list item */
function SceneDragPreview({ scene, index, localEdits }: { scene: Scene; index: number; localEdits: SceneCardProps["localEdits"] }) {
  const edits = localEdits[scene.id];
  const narration = edits?.narration ?? scene.narration ?? scene.subtitle ?? "";
  const imagePrompt = edits?.image_prompt ?? scene.image_prompt ?? "";
  return (
    <div className="pointer-events-none w-[min(100%,42rem)] cursor-grabbing rounded-xl border-2 border-primary/35 bg-card/98 p-4 shadow-2xl ring-2 ring-primary/15 backdrop-blur-sm">
      <div className="flex gap-3">
        <div className="flex min-h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
          <GripVertical className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{narration || "—"}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            <span className="font-medium text-muted-foreground/90">Image: </span>
            {imagePrompt || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function SceneCard({
  scene,
  index,
  localEdits,
  onLocalEdit,
  onDelete,
}: SceneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const edits = localEdits[scene.id];
  const narration = edits?.narration ?? scene.narration ?? scene.subtitle ?? "";
  const imagePrompt = edits?.image_prompt ?? scene.image_prompt ?? "";
  const narrationRef = useRef<HTMLTextAreaElement | null>(null);
  const imagePromptRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTextarea(narrationRef.current);
  }, [narration, resizeTextarea]);

  useEffect(() => {
    resizeTextarea(imagePromptRef.current);
  }, [imagePrompt, resizeTextarea]);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.35 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "ring-1 ring-primary/25",
      )}
    >
      {/* Drag handle — large hit target; dnd listeners only here so textareas don’t fight the drag */}
      <button
        type="button"
        aria-label={`Drag to reorder scene ${index + 1}`}
        className={cn(
          "flex shrink-0 cursor-grab touch-none select-none flex-col items-center justify-center gap-1 rounded-lg border border-transparent",
          "min-h-12 w-11 -translate-y-0.5 py-1.5 text-muted-foreground/60",
          "hover:border-border/60 hover:bg-muted/50 hover:text-muted-foreground",
          "active:cursor-grabbing active:bg-muted/70",
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Scene number + delete */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={() => onDelete(scene.id)}
            className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete scene"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Narration */}
        <textarea
          ref={narrationRef}
          value={narration}
          onChange={(e) => onLocalEdit(scene.id, "narration", e.target.value)}
          placeholder="Scene narration…"
          rows={2}
          className="w-full resize-none overflow-hidden rounded-lg border border-border/50 bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          onInput={(e) => {
            resizeTextarea(e.currentTarget);
          }}
        />

        {/* Image prompt */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            Image Prompt
          </label>
          <textarea
            ref={imagePromptRef}
            value={imagePrompt}
            onChange={(e) =>
              onLocalEdit(scene.id, "image_prompt", e.target.value)
            }
            placeholder="Describe the visual…"
            rows={2}
            className="w-full resize-none overflow-hidden rounded-lg border border-border/50 bg-background px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            onInput={(e) => {
              resizeTextarea(e.currentTarget);
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editing Mode                                                       */
/* ------------------------------------------------------------------ */

function EditingView({
  project,
  scenes,
  onScenesChange,
  onNext,
}: {
  project: Project;
  scenes: Scene[];
  onScenesChange: () => void;
  onNext: () => void;
}) {
  const [localEdits, setLocalEdits] = useState<
    Record<string, { narration?: string; image_prompt?: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [repairingNarration, setRepairingNarration] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const origRef = useRef<Record<string, Scene>>({});
  useEffect(() => {
    const map: Record<string, Scene> = {};
    for (const s of scenes) map[s.id] = s;
    origRef.current = map;
    setLocalEdits({});
  }, [scenes]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedIds = useMemo(() => scenes.map((s) => s.id), [scenes]);

  const handleLocalEdit = useCallback(
    (id: string, field: "narration" | "image_prompt", value: string) => {
      setLocalEdits((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: value },
      }));
    },
    [],
  );

  const dirtySceneIds = useMemo(() => {
    const ids: string[] = [];
    for (const [id, edits] of Object.entries(localEdits)) {
      const orig = origRef.current[id];
      if (!orig) continue;
      if (
        (edits.narration !== undefined &&
          edits.narration !== (orig.narration ?? "")) ||
        (edits.image_prompt !== undefined &&
          edits.image_prompt !== (orig.image_prompt ?? ""))
      ) {
        ids.push(id);
      }
    }
    return ids;
  }, [localEdits]);

  const missingNarrationScenes = useMemo(
    () =>
      scenes.filter((scene) => {
        const effectiveNarration =
          localEdits[scene.id]?.narration ?? scene.narration ?? scene.subtitle ?? "";
        return !effectiveNarration.trim();
      }),
    [scenes, localEdits],
  );

  const missingNarrationCount = missingNarrationScenes.length;

  const handleSave = useCallback(async () => {
    if (dirtySceneIds.length === 0) {
      notify.info("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        dirtySceneIds.map((id) => {
          const edits = localEdits[id];
          const payload: Record<string, string> = {};
          if (edits?.narration !== undefined) payload.narration = edits.narration;
          if (edits?.image_prompt !== undefined)
            payload.image_prompt = edits.image_prompt;
          return api.updateScene(project.id, id, payload);
        }),
      );
      notify.success(`Saved ${dirtySceneIds.length} scene(s).`);
      onScenesChange();
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Failed to save scenes.");
    } finally {
      setSaving(false);
    }
  }, [dirtySceneIds, localEdits, project.id, onScenesChange]);

  const handleRecoverMissingNarration = useCallback(async () => {
    if (missingNarrationScenes.length === 0) {
      notify.info("No missing narration detected.");
      return;
    }

    setRepairingNarration(true);
    try {
      const settings = project.settings || {};
      const storyType = project.story_type || "general";
      const storyTemplate = (settings.story_template as string | undefined) || "default";
      const llmProvider = (settings.llm_provider as string | undefined) || "openai";
      const llmModel = (settings.llm_model as string | null | undefined) || null;

      const splitWithScript = async (scriptText: string) => {
        const result = await api.splitScriptToScenes({
          script: scriptText,
          scene_count: scenes.length,
          story_type: storyType,
          story_template: storyTemplate,
          generate_subtitles: true,
          llm_provider: llmProvider,
          llm_model: llmModel,
        });
        return Array.isArray(result?.scenes)
          ? (result.scenes as Array<{ narration?: string }>)
          : [];
      };

      let generatedScenes: Array<{ narration?: string }> = [];
      const directScript = (project.script || "").trim();
      const joinedSceneText = scenes
        .map((s) => (s.narration || s.subtitle || "").trim())
        .filter(Boolean)
        .join(" ");
      let workingScript = directScript || joinedSceneText;

      if (workingScript) {
        try {
          generatedScenes = await splitWithScript(workingScript);
        } catch (err: unknown) {
          notify.info(
            err instanceof Error
              ? `Could not re-split script: ${err.message}`
              : "Could not re-split script. Trying script regeneration fallback.",
          );
        }
      }

      // Last-resort: regenerate a fresh script from project title and split it.
      if (generatedScenes.length === 0) {
        try {
          const regenerated = await api.generateScript({
            concept: (project.title || "").trim() || "Create a short, engaging story",
            story_type: storyType,
            story_template: storyTemplate,
            word_count: Math.max(220, scenes.length * 45),
            llm_provider: llmProvider,
            llm_model: llmModel,
          });
          workingScript = (regenerated?.script || "").trim();
          if (workingScript) {
            generatedScenes = await splitWithScript(workingScript);
            await api.updateProject(project.id, { script: workingScript });
          }
        } catch (err: unknown) {
          notify.info(
            err instanceof Error
              ? `Script regeneration fallback failed: ${err.message}`
              : "Script regeneration fallback failed.",
          );
        }
      }

      const sceneIndexById = new Map(scenes.map((scene, idx) => [scene.id, idx]));
      const updates = missingNarrationScenes
        .map((scene) => {
          const idx = sceneIndexById.get(scene.id) ?? -1;
          const fromSubtitle = (scene.subtitle || "").trim();
          const fromGenerated = idx >= 0 ? (generatedScenes[idx]?.narration || "").trim() : "";
          const recovered = fromSubtitle || fromGenerated;
          if (!recovered) return null;
          return api.updateScene(project.id, scene.id, { narration: recovered });
        })
        .filter(Boolean) as Array<Promise<unknown>>;

      if (updates.length === 0) {
        notify.error(
          "Couldn't auto-recover narration. Try editing script content and run recovery again.",
        );
        return;
      }

      await Promise.all(updates);
      notify.success(`Recovered narration for ${updates.length} scene(s).`);
      onScenesChange();
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Failed to recover missing narration.");
    } finally {
      setRepairingNarration(false);
    }
  }, [missingNarrationScenes, project, scenes, onScenesChange]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(orderedIds, oldIndex, newIndex);
      try {
        await api.reorderScenes(project.id, newOrder);
        onScenesChange();
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Failed to reorder scenes.");
      }
    },
    [orderedIds, project.id, onScenesChange],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const activeDragScene = useMemo(() => {
    if (!activeDragId) return null;
    return scenes.find((s) => s.id === activeDragId) ?? null;
  }, [activeDragId, scenes]);

  const activeDragIndex = useMemo(() => {
    if (!activeDragId) return -1;
    return scenes.findIndex((s) => s.id === activeDragId);
  }, [activeDragId, scenes]);

  const handleAddScene = useCallback(async () => {
    setAdding(true);
    try {
      await api.addScene(project.id, {
        narration: "",
        image_prompt: "",
        order_index: scenes.length,
      });
      notify.success("Scene added.");
      onScenesChange();
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Failed to add scene.");
    } finally {
      setAdding(false);
    }
  }, [project.id, scenes.length, onScenesChange]);

  const handleDeleteScene = useCallback(
    async (sceneId: string) => {
      if (scenes.length > 1) {
        const ok = await appConfirm({
          title: "Delete scene?",
          description: "This action cannot be undone.",
          confirmLabel: "Delete",
          variant: "destructive",
        });
        if (!ok) return;
      }
      try {
        await api.deleteScene(project.id, sceneId);
        notify.success("Scene deleted.");
        onScenesChange();
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Failed to delete scene.");
      }
    },
    [project.id, scenes.length, onScenesChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Actions — top toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            loading={saving}
            loadingLabel="Saving…"
            disabled={dirtySceneIds.length === 0}
          >
            <Save className="h-4 w-4" />
            Save Changes
            {dirtySceneIds.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({dirtySceneIds.length})
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleRecoverMissingNarration}
            loading={repairingNarration}
            loadingLabel="Recovering…"
            disabled={missingNarrationCount === 0}
            title="Fill empty narration using subtitle fallback and script re-split"
          >
            <RefreshCw className="h-4 w-4" />
            Recover Missing Narration
            {missingNarrationCount > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({missingNarrationCount})
              </span>
            )}
          </Button>
        </div>
        <Button variant="animated" onClick={onNext}>
          Continue to Visuals
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-2">
        <div className="flex flex-col gap-6 pb-4">
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 px-4 py-4 shadow-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-primary/10 via-transparent to-transparent" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Storyboard
                  </span>
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-bold text-primary">
                    {scenes.length}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Shape the story before asset prep</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Tighten narration, patch missing scene copy, and reorder beats so the engine gets a cleaner storyboard to work from.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenes</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{scenes.length}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Missing</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{missingNarrationCount}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unsaved</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{dirtySceneIds.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scene list */}
          <div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={orderedIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-5">
                  <AnimatePresence mode="popLayout">
                    {scenes.map((scene, i) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={i}
                        localEdits={localEdits}
                        onLocalEdit={handleLocalEdit}
                        onDelete={handleDeleteScene}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </SortableContext>
              <BodyPortal>
                <DragOverlay
                  adjustScale={false}
                  dropAnimation={{
                    duration: 180,
                    easing: "cubic-bezier(0.25,1,0.5,1)",
                  }}
                >
                  {activeDragScene && activeDragIndex >= 0 ? (
                    <SceneDragPreview
                      scene={activeDragScene}
                      index={activeDragIndex}
                      localEdits={localEdits}
                    />
                  ) : null}
                </DragOverlay>
              </BodyPortal>
            </DndContext>
          </div>
        </div>

        {/* Add scene */}
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={handleAddScene}
          loading={adding}
          loadingLabel="Adding…"
        >
          <Plus className="h-4 w-4" />
          Add Scene
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScriptStep (main export)                                           */
/* ------------------------------------------------------------------ */

export default function ScriptStep({
  project,
  scenes,
  isGenerating,
  progressDetail,
  projectFailed = false,
  failureMessage,
  onRetryGeneration,
  pipelineBusy = false,
  onScenesChange,
  onNext,
}: ScriptStepProps) {
  const targetCount =
    (project.settings?.scene_count as number | undefined) ?? scenes.length;

  if (isGenerating) {
    return (
      <GeneratingView
        scenes={scenes}
        targetCount={targetCount}
        progressDetail={progressDetail}
      />
    );
  }

  if (scenes.length > 0) {
    return (
      <EditingView
        project={project}
        scenes={scenes}
        onScenesChange={onScenesChange}
        onNext={onNext}
      />
    );
  }

  if (projectFailed && onRetryGeneration) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="max-w-xl space-y-4 rounded-3xl border border-destructive/20 bg-card px-6 py-8 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <RefreshCw className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-foreground">Storyboard generation failed</p>
          <p className="text-sm text-muted-foreground wrap-break-word leading-relaxed">
            {failureMessage?.trim() || "Something went wrong while creating your story."}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-2"
            loading={pipelineBusy}
            loadingLabel="Retrying…"
            onClick={() => void onRetryGeneration()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry storyboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="max-w-xl rounded-3xl border border-border/50 bg-card/80 px-8 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Start building the storyboard</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This step is where the engine turns your idea into scene-ready story beats. Once scenes exist here, the rest of Studio becomes much easier to manage.
        </p>
      </div>
    </div>
  );
}
