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
  GripVertical,
  Image as ImageIcon,
  Lightbulb,
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
  type DragCancelEvent,
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
import { RoundBokehLayer } from "@/components/layout/RoundBokehLayer";
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
  /** True when the last video_render job failed before any scenes existed (or user should retry script generation). */
  projectFailed?: boolean;
  failureMessage?: string;
  onRetryGeneration?: () => void | Promise<void>;
  pipelineBusy?: boolean;
  onScenesChange: () => void;
  onNext: () => void;
}

/* ------------------------------------------------------------------ */
/*  Fun-facts / tips shown during generation                          */
/* ------------------------------------------------------------------ */

const FUN_FACTS = [
  "Did you know? The average YouTube Short is watched for 8.5 seconds.",
  "Tip: Hook viewers in the first 2 seconds for maximum retention.",
  "Fun fact: Vertical videos get 90% more completion than landscape.",
  "Tip: Curiosity gaps in your script keep viewers watching longer.",
  "Did you know? Adding subtitles can boost engagement by 40%.",
  "Tip: End with a question or CTA to drive comments and shares.",
  "Fun fact: Most viral Shorts have 3–5 scene transitions.",
  "Tip: Pacing matters — aim for a new visual every 2–3 seconds.",
  "Did you know? 70% of Short views come from the algorithm, not subscribers.",
  "Tip: A strong opening line is worth more than any thumbnail.",
];

/* ------------------------------------------------------------------ */
/*  Generating Mode                                                    */
/* ------------------------------------------------------------------ */

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  size: 4 + Math.random() * 4,
  left: `${10 + Math.random() * 80}%`,
  top: `${10 + Math.random() * 80}%`,
  duration: `${6 + Math.random() * 8}s`,
  delay: `${-Math.random() * 10}s`,
  isPrimary: i % 2 === 0,
}));

function GeneratingView({
  scenes,
  targetCount,
}: {
  scenes: Scene[];
  targetCount: number;
}) {
  const [factIdx, setFactIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setFactIdx((i) => (i + 1) % FUN_FACTS.length),
      4000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="generating-gradient relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl py-10">
      {/* Scoped CSS keyframes */}
      <style>{`
        @keyframes meshDrift1 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(15%, -10%) scale(1.1); }
          66% { transform: translate(-10%, 15%) scale(0.95); }
        }
        @keyframes meshDrift2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          33% { transform: translate(-20%, 10%) scale(1.05); }
          66% { transform: translate(10%, -20%) scale(1.1); }
        }
        @keyframes meshDrift3 {
          0%, 100% { transform: translate(0%, 0%) scale(1.05); }
          33% { transform: translate(10%, 20%) scale(0.95); }
          66% { transform: translate(-15%, -5%) scale(1.1); }
        }
        @keyframes orbHue {
          0% { filter: blur(40px) hue-rotate(0deg); }
          100% { filter: blur(40px) hue-rotate(360deg); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.15; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.25; }
          50% { transform: translateY(-10px) translateX(-8px); opacity: 0.1; }
          75% { transform: translateY(-30px) translateX(5px); opacity: 0.2; }
        }
      `}</style>

      {/* Animated mesh background */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute h-[60%] w-[60%] rounded-full opacity-20"
          style={{
            top: "10%",
            left: "5%",
            background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
            animation: "meshDrift1 18s ease-in-out infinite",
          }}
        />
        <div
          className="absolute h-[50%] w-[50%] rounded-full opacity-15"
          style={{
            top: "30%",
            right: "0%",
            background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)",
            animation: "meshDrift2 22s ease-in-out infinite",
          }}
        />
        <div
          className="absolute h-[55%] w-[55%] rounded-full opacity-10"
          style={{
            bottom: "0%",
            left: "20%",
            background: "radial-gradient(circle, hsl(var(--muted)) 0%, transparent 70%)",
            animation: "meshDrift3 20s ease-in-out infinite",
          }}
        />
      </div>

      <RoundBokehLayer accent="var(--primary)" glow="var(--accent)" className="rounded-2xl" />

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className={cn(
            "pointer-events-none absolute rounded-full",
            p.isPrimary ? "bg-primary" : "bg-accent",
          )}
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            top: p.top,
            opacity: 0.15,
            animation: `particleFloat ${p.duration} ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Center content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-6 py-14">
        {/* Animated orb + title */}
        <div className="flex flex-col items-center gap-5">
          <motion.div
            className="h-[120px] w-[120px] rounded-full bg-linear-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))]"
            style={{ animation: "orbHue 8s linear infinite" }}
            animate={{ scale: [0.9, 1.1, 0.9] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          />

          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.span
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Sparkles className="h-7 w-7 text-primary" />
            </motion.span>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Writing your story…
            </h2>
          </motion.div>
        </div>

        {/* Segmented progress bar */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <div className="flex w-full gap-1.5">
            {Array.from({ length: targetCount }).map((_, i) => (
              <motion.div
                key={i}
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{ background: "hsl(var(--muted) / 0.2)" }}
              >
                {i < scenes.length && (
                  <motion.div
                    className="h-full w-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                      transformOrigin: "left",
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.05 }}
                  />
                )}
              </motion.div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Scene{" "}
            <span className="font-semibold text-primary">{scenes.length}</span>{" "}
            of{" "}
            <span className="font-semibold text-primary">{targetCount}</span>
          </p>
        </div>

        {/* Streaming scene cards */}
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {scenes.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: 60, filter: "blur(8px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -30, filter: "blur(4px)" }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm"
              >
                <span className="mr-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-linear-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] px-2 text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-foreground/90">
                  {s.narration || "…"}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Rotating fun facts */}
        <div className="relative h-8 w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={factIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/40 px-4 py-1.5 backdrop-blur-sm">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
                <span className="text-sm italic text-muted-foreground/80">
                  {FUN_FACTS[factIdx]}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
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
  totalScenes: number;
}

/** Lightweight clone under the cursor — avoids fighting framer-motion layout on the list item */
function SceneDragPreview({ scene, index, localEdits }: { scene: Scene; index: number; localEdits: SceneCardProps["localEdits"] }) {
  const edits = localEdits[scene.id];
  const narration = edits?.narration ?? scene.narration ?? "";
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
  totalScenes,
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
  const narration = edits?.narration ?? scene.narration ?? "";
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
            className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
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
    } catch (err: any) {
      notify.error(err?.message || "Failed to save scenes.");
    } finally {
      setSaving(false);
    }
  }, [dirtySceneIds, localEdits, project.id, onScenesChange]);

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
      } catch (err: any) {
        notify.error(err?.message || "Failed to reorder scenes.");
      }
    },
    [orderedIds, project.id, onScenesChange],
  );

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
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
    } catch (err: any) {
      notify.error(err?.message || "Failed to add scene.");
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
      } catch (err: any) {
        notify.error(err?.message || "Failed to delete scene.");
      }
    },
    [project.id, scenes.length, onScenesChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Actions — top toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
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
        <Button variant="animated" onClick={onNext}>
          Continue to Assets
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-2">
        <div className="flex flex-col gap-6 pb-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Your Script</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-bold text-primary">
              {scenes.length}
            </span>
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
                        totalScenes={scenes.length}
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
    return <GeneratingView scenes={scenes} targetCount={targetCount} />;
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
        <div className="max-w-md space-y-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-8">
          <p className="text-base font-semibold text-foreground">Script generation failed</p>
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
            Retry script generation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Sparkles className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        No scenes yet. Start generating to create your script.
      </p>
    </div>
  );
}
