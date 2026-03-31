"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
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
import { STUDIO_STEP_COLORS } from "@/components/studio/studio-step-colors";
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

const AURORA_BEAMS = [
  { left: "-8%", top: "8%", width: "46%", height: "28%", rotate: "-12deg", opacity: 0.18 },
  { right: "-10%", top: "24%", width: "42%", height: "30%", rotate: "14deg", opacity: 0.14 },
  { left: "18%", bottom: "-12%", width: "54%", height: "34%", rotate: "8deg", opacity: 0.12 },
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
  const [factIdx, setFactIdx] = useState(0);
  const reduceMotion = useReducedMotion();
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

  useEffect(() => {
    const t = setInterval(
      () => setFactIdx((i) => (i + 1) % FUN_FACTS.length),
      4000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl border border-border/40 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_40%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-size-[36px_36px] opacity-40" />
      {AURORA_BEAMS.map((beam, index) => (
        <motion.div
          key={index}
          className="pointer-events-none absolute rounded-full blur-3xl"
          style={{
            ...beam,
            background:
              index === 1
                ? "radial-gradient(circle, hsl(var(--accent) / 0.75) 0%, transparent 70%)"
                : "radial-gradient(circle, hsl(var(--primary) / 0.85) 0%, transparent 72%)",
          }}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: [0, index === 1 ? -18 : 18, 0],
                  y: [0, index === 1 ? 14 : -14, 0],
                  scale: [1, 1.06, 1],
                }
          }
          transition={{
            duration: 12 + index * 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      <RoundBokehLayer
        accent="var(--primary)"
        glow="var(--accent)"
        className="rounded-3xl opacity-70"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-background/55 shadow-[0_30px_120px_-40px_hsl(var(--primary)/0.45)] backdrop-blur-2xl"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="relative overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent" />
            <div className="relative flex h-full flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Storyboard engine
                </span>
                <span className="inline-flex rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {hasDraftedScenes ? "Draft assembled" : "In progress"}
                </span>
              </div>

              <div className="mt-7 flex flex-col gap-6 xl:flex-row xl:items-center">
                <div className="flex justify-center xl:justify-start">
                  <div className="relative flex h-36 w-36 items-center justify-center">
                    <motion.div
                      className="absolute inset-0 rounded-full border border-primary/20"
                      animate={
                        reduceMotion
                          ? undefined
                          : { scale: [1, 1.08, 1], opacity: [0.35, 0.8, 0.35] }
                      }
                      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                      className="absolute inset-[12px] rounded-full border border-accent/20"
                      animate={
                        reduceMotion
                          ? undefined
                          : { scale: [1.04, 0.98, 1.04], opacity: [0.25, 0.6, 0.25] }
                      }
                      transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {!reduceMotion && (
                      <motion.div
                        className="absolute inset-0"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                      >
                        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_20px_hsl(var(--accent)/0.75)]" />
                      </motion.div>
                    )}
                    <motion.div
                      className="relative flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-primary via-primary/85 to-accent text-primary-foreground shadow-[0_0_40px_hsl(var(--primary)/0.45)]"
                      animate={reduceMotion ? undefined : { scale: [0.98, 1.03, 0.98] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Sparkles className="h-9 w-9" />
                    </motion.div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <motion.p
                    key={activePhase.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="text-sm font-medium text-primary/85"
                  >
                    {activePhase.label}
                  </motion.p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Building your story structure and preparing scene-ready beats
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    The engine is analyzing your brief, drafting the narrative flow, and preparing a storyboard handoff for visuals. This is a phase-based process, so progress updates here reflect workflow stages instead of fake per-scene percentages.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Workflow
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {hasDraftedScenes ? "Storyboard drafted" : "Generating"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Target scenes
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {safeTargetCount}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Current status
                  </p>
                  <p className="text-sm font-medium text-foreground/80">
                    {hasDraftedScenes ? "Almost ready" : activePhase.label}
                  </p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full border border-border/60 bg-background/60">
                  <div className="relative h-full overflow-hidden rounded-full bg-linear-to-r from-primary/75 via-cyan-400/80 to-accent/75">
                    {!reduceMotion && (
                      <motion.div
                        className="absolute inset-y-0 left-[-30%] w-1/3 bg-linear-to-r from-transparent via-white/45 to-transparent"
                        animate={{ x: ["0%", "360%"] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {statusLabel}
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {STORYBOARD_PHASES.map((phase, index) => {
                  const isDone = hasDraftedScenes ? index <= activePhaseIndex : index < activePhaseIndex;
                  const isActive = index === activePhaseIndex && !hasDraftedScenes;
                  const phaseColor = STUDIO_STEP_COLORS[index % STUDIO_STEP_COLORS.length];
                  const shimmerEnabled = !reduceMotion && !isDone;
                  return (
                    <motion.div
                      key={phase.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: index * 0.06 }}
                      className={cn(
                        "relative overflow-hidden rounded-2xl border px-4 py-3",
                        isActive &&
                          "border-primary/30 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]",
                        isDone && "border-emerald-500/25 bg-emerald-500/8",
                        !isDone && !isActive && "border-border/60 bg-background/45",
                      )}
                    >
                      {shimmerEnabled && (
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-[-55%] w-[62%] skew-x-[-20deg]"
                          animate={{ x: ["0%", "235%"] }}
                          transition={{
                            duration: isActive ? 1.55 : 2.1,
                            repeat: Infinity,
                            repeatDelay: isActive ? 0.2 : 0.45,
                            ease: "easeInOut",
                            delay: index * 0.14,
                          }}
                          style={{
                            background: `linear-gradient(90deg, transparent 0%, hsl(${phaseColor.accent} / ${isActive ? 0.08 : 0.04}) 25%, hsl(0 0% 100% / ${isActive ? 0.26 : 0.14}) 50%, hsl(${phaseColor.glow} / ${isActive ? 0.14 : 0.08}) 72%, transparent 100%)`,
                          }}
                        />
                      )}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-px"
                        style={{
                          background: `linear-gradient(90deg, transparent, hsl(${phaseColor.accent} / ${isActive ? 0.45 : 0.18}), transparent)`,
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "relative inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                            isDone &&
                              "border-emerald-500/30 bg-emerald-500/12 text-emerald-400",
                            isActive && "border-primary/40 bg-primary/15 text-primary",
                            !isDone &&
                              !isActive &&
                              "border-border/60 text-muted-foreground",
                          )}
                        >
                          {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <p className="text-sm font-semibold text-foreground">
                          {phase.label}
                        </p>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {phase.description}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="relative mt-6 h-12 overflow-hidden rounded-2xl border border-border/50 bg-background/40 px-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={factIdx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 flex items-center gap-2 px-4"
                  >
                    <Lightbulb className="h-4 w-4 shrink-0 text-yellow-400" />
                    <p className="text-sm text-muted-foreground">
                      {FUN_FACTS[factIdx]}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/10 px-6 py-7 sm:px-8 lg:border-l lg:border-t-0">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Live storyboard feed
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Storyboard activity
                  </h3>
                </div>
                <div className="rounded-full border border-border/60 bg-background/55 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {hasDraftedScenes ? `${draftedScenes} drafted` : "Live status"}
                </div>
              </div>

              <div className="mt-5 flex flex-1 flex-col gap-3">
                {recentScenes.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-border/60 bg-background/35 px-6 py-10 text-center">
                    <div className="max-w-xs">
                      <motion.div
                        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
                        animate={reduceMotion ? undefined : { scale: [1, 1.04, 1] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <RefreshCw className="h-5 w-5" />
                      </motion.div>
                      <p className="mt-4 text-sm font-medium text-foreground">
                        Storyboard is being assembled
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Scenes are generated together at the end of this pass, so this panel reflects backend activity and phase changes instead of pretending beats are streaming in one by one.
                      </p>
                    </div>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {recentScenes.map((scene, index) => {
                      const sceneNumber = draftedScenes - index;
                      return (
                        <motion.div
                          key={scene.id}
                          initial={{ opacity: 0, x: 28, scale: 0.98 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -18, scale: 0.98 }}
                          transition={{ duration: 0.35, delay: index * 0.05 }}
                          className="rounded-3xl border border-white/10 bg-background/45 p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05)]"
                        >
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-accent px-2 text-sm font-bold text-primary-foreground shadow-[0_10px_30px_-15px_hsl(var(--primary)/0.85)]">
                              {sceneNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/85">
                                Scene {sceneNumber}
                              </p>
                              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-foreground/90">
                                {scene.narration ||
                                  scene.subtitle ||
                                  "Drafting narration..."}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
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
    } catch (err: any) {
      notify.error(err?.message || "Failed to save scenes.");
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
        } catch (err: any) {
          notify.info(
            err?.message
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
        } catch (err: any) {
          notify.info(
            err?.message
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
    } catch (err: any) {
      notify.error(err?.message || "Failed to recover missing narration.");
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
