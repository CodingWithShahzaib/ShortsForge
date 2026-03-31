"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Slider as RadixSlider } from "@radix-ui/themes";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock,
  Film,
  GripHorizontal,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  Save,
  Upload,
  Volume2,
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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import type {
  Project,
  SafeZoneConfig,
  SafeZonePlatform,
  Scene,
  SubtitleSettings,
  Transition,
} from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BodyPortal } from "@/components/ui/drag-overlay-portal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  pickLatestAsset,
  assetMediaSrc,
} from "@/components/projects/scene-assets";
import {
  sceneDurationSec,
  sceneStartTimes,
} from "@/components/projects/scene-timeline-utils";
import { getAudioDurationFromUrl } from "@/lib/audio-duration";
import {
  SAFE_ZONE_PRESETS,
  SafeZoneOverlay,
  resolveSafeZoneConfig,
} from "@/components/studio/SafeZoneOverlay";

const SCENE_DUR_MIN = 0.5;
const SCENE_DUR_MAX = 15;
const INTER_SCENE_PAUSE_MIN = 0;
const INTER_SCENE_PAUSE_MAX = 1200;
const TRANSITION_OVERLAP_MIN = 0;
const TRANSITION_OVERLAP_MAX = 800;
const SAFE_ZONE_CONTENT_MIN_WIDTH = 0.22;
const SAFE_ZONE_CONTENT_MIN_HEIGHT = 0.24;
const SAFE_ZONE_CAPTION_MIN_WIDTH = 0.2;
const SAFE_ZONE_CAPTION_MIN_HEIGHT = 0.08;

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Mirrors backend `transition_service.AVAILABLE_TRANSITIONS` + none; used if settings API not loaded yet. */
const FALLBACK_TRANSITIONS: Transition[] = [
  { id: "fade", name: "Fade", description: "Classic fade to black and back" },
  { id: "dissolve", name: "Dissolve", description: "Smooth cross-dissolve between scenes" },
  { id: "wipeleft", name: "Wipe Left", description: "Wipe from right to left" },
  { id: "wiperight", name: "Wipe Right", description: "Wipe from left to right" },
  { id: "wipeup", name: "Wipe Up", description: "Wipe from bottom to top" },
  { id: "wipedown", name: "Wipe Down", description: "Wipe from top to bottom" },
  { id: "slideup", name: "Slide Up", description: "Slide up transition" },
  { id: "slidedown", name: "Slide Down", description: "Slide down transition" },
  { id: "slideleft", name: "Slide Left", description: "Slide left transition" },
  { id: "slideright", name: "Slide Right", description: "Slide right transition" },
  { id: "circleopen", name: "Circle Open", description: "Circle opening reveal" },
  { id: "circleclose", name: "Circle Close", description: "Circle closing transition" },
  { id: "zoom_in", name: "Zoom In", description: "Ken Burns zoom in on image" },
  { id: "zoom_out", name: "Zoom Out", description: "Ken Burns zoom out on image" },
  { id: "pan_left", name: "Pan Left", description: "Horizontal pan right to left" },
  { id: "pan_right", name: "Pan Right", description: "Horizontal pan left to right" },
  { id: "pan_up", name: "Pan Up", description: "Vertical pan bottom to top" },
  { id: "pan_down", name: "Pan Down", description: "Vertical pan top to bottom" },
  { id: "none", name: "None", description: "Soft blend at cuts (same as fade in export)" },
];

const CARD_W = 160;
const DEFAULT_TIMECODE = "0:00.0";

type SceneDraft = {
  narration?: string;
  image_prompt?: string;
  duration?: number;
  transition_type?: string;
};

type SafeZoneNumericField = Exclude<keyof SafeZoneConfig, "platform">;
type GuidePresetId = SafeZonePlatform | "custom";

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_TIMECODE;
  let mins = Math.floor(seconds / 60);
  let secs = seconds - mins * 60;
  if (secs >= 59.95) {
    mins += 1;
    secs = 0;
  }
  const secText = secs.toFixed(1).padStart(4, "0");
  return `${mins}:${secText}`;
}

function toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function safeZoneConfigKey(config: SafeZoneConfig | null | undefined): string {
  return JSON.stringify(config ?? null);
}

function roundSafeZoneValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampSafeZoneConfigField(
  config: SafeZoneConfig,
  field: SafeZoneNumericField,
  rawValue: number,
): SafeZoneConfig {
  const next = { ...config };
  const value = roundSafeZoneValue(rawValue);

  switch (field) {
    case "top_pct":
      next.top_pct = Math.min(0.5, Math.max(0, value));
      next.top_pct = Math.min(
        next.top_pct,
        1 - SAFE_ZONE_CONTENT_MIN_HEIGHT - next.bottom_pct,
      );
      break;
    case "bottom_pct":
      next.bottom_pct = Math.min(0.7, Math.max(0, value));
      next.bottom_pct = Math.min(
        next.bottom_pct,
        1 - SAFE_ZONE_CONTENT_MIN_HEIGHT - next.top_pct,
      );
      break;
    case "left_pct":
      next.left_pct = Math.min(0.4, Math.max(0, value));
      next.left_pct = Math.min(
        next.left_pct,
        1 - SAFE_ZONE_CONTENT_MIN_WIDTH - next.right_pct,
      );
      break;
    case "right_pct":
      next.right_pct = Math.min(0.4, Math.max(0, value));
      next.right_pct = Math.min(
        next.right_pct,
        1 - SAFE_ZONE_CONTENT_MIN_WIDTH - next.left_pct,
      );
      break;
    case "caption_band_left_pct":
      next.caption_band_left_pct = Math.min(0.45, Math.max(0, value));
      next.caption_band_left_pct = Math.min(
        next.caption_band_left_pct,
        1 - SAFE_ZONE_CAPTION_MIN_WIDTH - next.caption_band_right_pct,
      );
      break;
    case "caption_band_right_pct":
      next.caption_band_right_pct = Math.min(0.45, Math.max(0, value));
      next.caption_band_right_pct = Math.min(
        next.caption_band_right_pct,
        1 - SAFE_ZONE_CAPTION_MIN_WIDTH - next.caption_band_left_pct,
      );
      break;
    case "caption_band_top_pct":
      next.caption_band_top_pct = Math.min(1, Math.max(0, value));
      next.caption_band_top_pct = Math.min(
        next.caption_band_top_pct,
        next.caption_band_bottom_pct - SAFE_ZONE_CAPTION_MIN_HEIGHT,
      );
      break;
    case "caption_band_bottom_pct":
      next.caption_band_bottom_pct = Math.min(1, Math.max(0, value));
      next.caption_band_bottom_pct = Math.max(
        next.caption_band_bottom_pct,
        next.caption_band_top_pct + SAFE_ZONE_CAPTION_MIN_HEIGHT,
      );
      break;
    default:
      return next;
  }

  return next;
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface ArrangeStepProps {
  project: Project;
  scenes: Scene[];
  onRefresh: () => void;
  onNext: () => void;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Sortable thumbnail card                                           */
/* ------------------------------------------------------------------ */

function ArrangeDragPreview({
  scene,
  index,
  startTimeSec,
}: {
  scene: Scene;
  index: number;
  startTimeSec: number;
}) {
  const imgAsset = pickLatestAsset(scene.assets, "image");
  const src = assetMediaSrc(imgAsset);
  const dur = sceneDurationSec(scene);
  return (
    <div
      className="pointer-events-none cursor-grabbing overflow-hidden rounded-xl border-2 border-primary/40 bg-muted/40 shadow-2xl ring-2 ring-primary/20"
      style={{ width: CARD_W }}
    >
      <div className="relative aspect-9/16 w-full overflow-hidden bg-black/20">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1 text-[10px] font-bold text-white backdrop-blur-sm">
          {index + 1}
        </span>
        <span className="absolute bottom-1.5 left-1.5 flex items-center rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm">
          {formatTimecode(startTimeSec)}
        </span>
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Clock className="h-2.5 w-2.5" />
          {dur.toFixed(1)}s
        </span>
        <div className="absolute bottom-1.5 left-1/2 flex h-8 w-12 -translate-x-1/2 items-center justify-center rounded-md bg-black/55 text-white">
          <GripHorizontal className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

/*  Vertical scene stack card                                         */
/* ------------------------------------------------------------------ */

function VerticalSortableCard({
  scene,
  index,
  startTimeSec,
  isSelected,
  onSelect,
  suppressSelect,
}: {
  scene: Scene;
  index: number;
  startTimeSec: number;
  isSelected: boolean;
  onSelect: () => void;
  suppressSelect: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const imgAsset = pickLatestAsset(scene.assets, "image");
  const src = assetMediaSrc(imgAsset);
  const audioAsset = pickLatestAsset(scene.assets, "audio");
  const hasAudio = Boolean(audioAsset);
  const hasImage = Boolean(imgAsset);
  const dur = sceneDurationSec(scene);
  const transitionType = scene.transition_type || "fade";
  const narration = (scene.narration || "").trim();

  return (
    <motion.div
      ref={setNodeRef}
      style={{ ...style, touchAction: "pan-y" }}
      initial={false}
      animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
        isSelected
          ? "border-primary/50 bg-primary/6 shadow-sm shadow-primary/10"
          : "border-border/40 bg-card/80 hover:border-primary/40",
        isDragging && "ring-1 ring-primary/25",
      )}
      onClick={() => {
        if (!suppressSelect) {
          onSelect();
        }
      }}
    >
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-semibold text-white">
          {index + 1}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Scene {index + 1}</p>
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatTimecode(startTimeSec)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {dur.toFixed(1)}s
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {narration || "No narration yet."}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/80">
          <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground/70">
            {transitionType.replace(/_/g, " ")}
          </span>
          <span className={cn("flex items-center gap-1", hasImage ? "text-foreground/70" : "text-muted-foreground/50")}>
            <ImageIcon className="h-3 w-3" />
            Img
          </span>
          <span className={cn("flex items-center gap-1", hasAudio ? "text-foreground/70" : "text-muted-foreground/50")}>
            <Volume2 className="h-3 w-3" />
            Aud
          </span>
        </div>
      </div>

      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder scene ${index + 1}`}
        {...attributes}
        {...listeners}
        className={cn(
          "flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition active:cursor-grabbing",
          "hover:text-foreground hover:border-primary/40",
          isDragging && "cursor-grabbing",
        )}
        style={{ touchAction: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <GripHorizontal className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene inspector (right panel)                                     */
/* ------------------------------------------------------------------ */

function SceneInspector({
  scene,
  draft,
  onDraftChange,
  onSaveScene,
  showSafeZone,
  safeZonePlatform,
  safeZoneConfig,
  onSafeZoneChange,
  onSafeZoneCommit,
  onSafeZoneReset,
  onSaveSafeZoneAsDefaults,
  safeZoneSaving,
  safeZoneDefaultsSaving,
}: {
  scene: Scene;
  draft?: SceneDraft;
  onDraftChange: (sceneId: string, patch: SceneDraft) => void;
  onSaveScene: (sceneId: string) => Promise<boolean>;
  showSafeZone: boolean;
  safeZonePlatform: "tiktok" | "instagram_reel" | "youtube_short";
  safeZoneConfig: SafeZoneConfig | null;
  onSafeZoneChange: (config: SafeZoneConfig) => void;
  onSafeZoneCommit: (config: SafeZoneConfig) => void;
  onSafeZoneReset: () => void;
  onSaveSafeZoneAsDefaults: (config: SafeZoneConfig) => void;
  safeZoneSaving: boolean;
  safeZoneDefaultsSaving: boolean;
}) {
  const [narration, setNarration] = useState(
    draft?.narration ?? scene.narration ?? "",
  );
  const [imagePrompt, setImagePrompt] = useState(
    draft?.image_prompt ?? scene.image_prompt ?? "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNarration(draft?.narration ?? scene.narration ?? "");
    setImagePrompt(draft?.image_prompt ?? scene.image_prompt ?? "");
  }, [scene.id, scene.narration, scene.image_prompt, draft?.narration, draft?.image_prompt]);

  const imgAsset = pickLatestAsset(scene.assets, "image");
  const imgSrc = assetMediaSrc(imgAsset);
  const activeSafeZoneConfig = resolveSafeZoneConfig(
    safeZonePlatform,
    safeZoneConfig,
  );
  const selectedGuidePreset = (
    (Object.keys(SAFE_ZONE_PRESETS) as SafeZonePlatform[]).find((presetPlatform) => {
      const presetConfig = resolveSafeZoneConfig(
        safeZonePlatform,
        SAFE_ZONE_PRESETS[presetPlatform],
      );
      return safeZoneConfigKey(presetConfig) === safeZoneConfigKey(activeSafeZoneConfig);
    }) ?? "custom"
  ) as GuidePresetId;

  const applySafeZoneField = (
    field: SafeZoneNumericField,
    nextValue: string,
    commit: boolean,
  ) => {
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    const nextConfig = clampSafeZoneConfigField(
      activeSafeZoneConfig,
      field,
      parsed / 100,
    );
    onSafeZoneChange(nextConfig);
    if (commit) {
      onSafeZoneCommit(nextConfig);
    }
  };

  const applySafeZoneSlider = (
    field: SafeZoneNumericField,
    values: number[],
    commit: boolean,
  ) => {
    const nextValue = values[0];
    if (!Number.isFinite(nextValue)) return;
    const nextConfig = clampSafeZoneConfigField(
      activeSafeZoneConfig,
      field,
      nextValue / 100,
    );
    onSafeZoneChange(nextConfig);
    if (commit) {
      onSafeZoneCommit(nextConfig);
    }
  };

  const snapToPreset = (presetPlatform: typeof safeZonePlatform) => {
    const nextConfig = resolveSafeZoneConfig(
      safeZonePlatform,
      SAFE_ZONE_PRESETS[presetPlatform],
    );
    onSafeZoneChange(nextConfig);
    onSafeZoneCommit(nextConfig);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      onDraftChange(scene.id, {
        narration,
        image_prompt: imagePrompt,
      });
      await onSaveScene(scene.id);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Failed to save scene");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-border/30 bg-background/70 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Scene content
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleSave}
          loading={saving}
          loadingLabel="Saving…"
        >
          <Save className="h-3.5 w-3.5" />
          Save Changes
        </Button>
      </div>

      {/* Image preview */}
      <div className="rounded-xl border border-border/30 bg-card/80 p-2">
        <div className="relative flex h-[280px] w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40 md:h-[320px]">
          {imgSrc ? (
            <>
              <img
                src={imgSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
              />
              <div className="absolute inset-0 bg-black/35" />
            </>
          ) : null}
          <div className="relative aspect-9/16 h-[92%] max-w-full overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="Scene preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <ImageIcon className="h-12 w-12" />
              </div>
            )}
            {showSafeZone ? (
              <SafeZoneOverlay
                platform={safeZonePlatform}
                config={safeZoneConfig}
                editable
                onChange={onSafeZoneChange}
                onCommit={onSafeZoneCommit}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2">
          <p className="text-[11px] text-muted-foreground">
            Drag the frame and subtitle band. Use the corner handles to resize.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {safeZoneSaving ? "Saving guide..." : "Guide follows project subtitle settings"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onSafeZoneReset}
              disabled={!showSafeZone || safeZoneSaving}
            >
              Reset guides
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onSaveSafeZoneAsDefaults(activeSafeZoneConfig)}
              disabled={!showSafeZone || safeZoneSaving || safeZoneDefaultsSaving}
            >
              {safeZoneDefaultsSaving ? "Saving defaults..." : "Save as defaults"}
            </Button>
          </div>
        </div>
      </div>

      {showSafeZone ? (
        <div className="rounded-xl border border-border/30 bg-background/75 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Guide Controls
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Snap to a preset geometry or fine-tune the insets in percent.
              </p>
            </div>
            <Tabs
              value={selectedGuidePreset}
              onValueChange={(value) => {
                const presetValue = value as GuidePresetId;
                switch (presetValue) {
                  case "tiktok":
                  case "instagram_reel":
                  case "youtube_short":
                    snapToPreset(presetValue);
                    break;
                  case "custom":
                  default:
                    break;
                }
              }}
            >
              <TabsList className="h-auto flex-wrap p-1">
                <TabsTrigger value="tiktok" className="px-3 py-1.5 text-[11px]">
                  TikTok
                </TabsTrigger>
                <TabsTrigger value="instagram_reel" className="px-3 py-1.5 text-[11px]">
                  Reels
                </TabsTrigger>
                <TabsTrigger value="youtube_short" className="px-3 py-1.5 text-[11px]">
                  Shorts
                </TabsTrigger>
                <TabsTrigger value="custom" disabled className="px-3 py-1.5 text-[11px]">
                  Custom
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/30 bg-card/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                Frame Insets
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["top_pct", "Top", activeSafeZoneConfig.top_pct],
                    ["bottom_pct", "Bottom", activeSafeZoneConfig.bottom_pct],
                    ["left_pct", "Left", activeSafeZoneConfig.left_pct],
                    ["right_pct", "Right", activeSafeZoneConfig.right_pct],
                  ] as const
                ).map(([field, label, value]) => (
                  <label key={field} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {(value * 100).toFixed(1)}%
                      </span>
                    </div>
                    <RadixSlider
                      value={[value * 100]}
                      min={0}
                      max={50}
                      step={0.5}
                      size="2"
                      variant="surface"
                      color="cyan"
                      radius="full"
                      onValueChange={(values) =>
                        applySafeZoneSlider(field, values, false)
                      }
                      onValueCommit={(values) =>
                        applySafeZoneSlider(field, values, true)
                      }
                      disabled={safeZoneSaving}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={(value * 100).toFixed(1)}
                      onChange={(e) =>
                        applySafeZoneField(field, e.target.value, false)
                      }
                      onBlur={(e) =>
                        applySafeZoneField(field, e.target.value, true)
                      }
                      disabled={safeZoneSaving}
                      className="h-9"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/30 bg-card/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                Subtitle Insets
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    [
                      "caption_band_top_pct",
                      "Top",
                      activeSafeZoneConfig.caption_band_top_pct,
                    ],
                    [
                      "caption_band_bottom_pct",
                      "Bottom",
                      activeSafeZoneConfig.caption_band_bottom_pct,
                    ],
                    [
                      "caption_band_left_pct",
                      "Left",
                      activeSafeZoneConfig.caption_band_left_pct,
                    ],
                    [
                      "caption_band_right_pct",
                      "Right",
                      activeSafeZoneConfig.caption_band_right_pct,
                    ],
                  ] as const
                ).map(([field, label, value]) => (
                  <label key={field} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {(value * 100).toFixed(1)}%
                      </span>
                    </div>
                    <RadixSlider
                      value={[value * 100]}
                      min={0}
                      max={95}
                      step={0.5}
                      size="2"
                      variant="surface"
                      color="amber"
                      radius="full"
                      onValueChange={(values) =>
                        applySafeZoneSlider(field, values, false)
                      }
                      onValueCommit={(values) =>
                        applySafeZoneSlider(field, values, true)
                      }
                      disabled={safeZoneSaving}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={95}
                      step={0.5}
                      value={(value * 100).toFixed(1)}
                      onChange={(e) =>
                        applySafeZoneField(field, e.target.value, false)
                      }
                      onBlur={(e) =>
                        applySafeZoneField(field, e.target.value, true)
                      }
                      disabled={safeZoneSaving}
                      className="h-9"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Narration + image prompt */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
        <label className="flex flex-col gap-2 rounded-lg border border-border/30 bg-background/80 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Narration
          </span>
          <textarea
            value={narration}
            onChange={(e) => {
              const next = e.target.value;
              setNarration(next);
              onDraftChange(scene.id, { narration: next });
            }}
            rows={3}
            className="w-full resize-none rounded-md border border-border/50 bg-background/80 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </label>

        <label className="flex flex-col gap-2 rounded-lg border border-border/30 bg-background/80 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Image Prompt
          </span>
          <textarea
            value={imagePrompt}
            onChange={(e) => {
              const next = e.target.value;
              setImagePrompt(next);
              onDraftChange(scene.id, { image_prompt: next });
            }}
            rows={6}
            className="w-full resize-none rounded-md border border-border/50 bg-background/80 px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene quick tools (right panel)                                   */
/* ------------------------------------------------------------------ */

function SceneQuickTools({
  project,
  scene,
  draft,
  onDraftChange,
  onSaveScene,
  onRefresh,
}: {
  project: Project;
  scene: Scene;
  draft?: SceneDraft;
  onDraftChange: (sceneId: string, patch: SceneDraft) => void;
  onSaveScene: (sceneId: string) => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [duration, setDuration] = useState(
    draft?.duration ?? sceneDurationSec(scene),
  );
  const [transitionType, setTransitionType] = useState(
    draft?.transition_type ?? (scene.transition_type || "fade"),
  );
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingTts, setGeneratingTts] = useState(false);
  const [matchingAudio, setMatchingAudio] = useState(false);
  const [regenerateMode, setRegenerateMode] = useState<"image" | "audio" | "both">("image");
  const [ttsText, setTtsText] = useState(
    (scene.narration || scene.subtitle || "").trim(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const apiTransitions = useSettingsStore((s) => s.transitions);
  const transitionOptions = useMemo(() => {
    const list = apiTransitions.length ? apiTransitions : FALLBACK_TRANSITIONS;
    const ids = new Set(list.map((t) => t.id));
    const extraIds = new Set<string>();
    const cur = scene.transition_type || "fade";
    if (cur && !ids.has(cur)) extraIds.add(cur);
    if (transitionType && !ids.has(transitionType)) extraIds.add(transitionType);
    if (extraIds.size === 0) return list;
    const extras: Transition[] = [...extraIds].map((id) => ({
      id,
      name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: "",
    }));
    return [...list, ...extras];
  }, [apiTransitions, scene.transition_type, transitionType]);

  useEffect(() => {
    setDuration(draft?.duration ?? sceneDurationSec(scene));
    setTransitionType(draft?.transition_type ?? (scene.transition_type || "fade"));
    setTtsText((scene.narration || scene.subtitle || "").trim());
  }, [scene.id, scene.duration, scene.transition_type, draft?.duration, draft?.transition_type]);

  const audioAsset = pickLatestAsset(scene.assets, "audio");
  const audioSrc = assetMediaSrc(audioAsset);

  const handleSave = async () => {
    setSaving(true);
    try {
      onDraftChange(scene.id, {
        duration,
        transition_type: transitionType,
      });
      await onSaveScene(scene.id);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Failed to save scene");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.regenerateSceneAssets(project.id, scene.id, { mode: regenerateMode });
      notify.success(`Queued ${regenerateMode} regeneration`);
      onRefresh();
    } catch (e: unknown) {
      notify.error(
        e instanceof Error ? e.message : "Failed to regenerate scene assets",
      );
    } finally {
      setRegenerating(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadSceneAsset(project.id, scene.id, file);
      notify.success("Asset uploaded");
      onRefresh();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Asset upload failed");
    } finally {
      event.target.value = "";
    }
  };

  const playAudio = () => {
    if (!audioSrc) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioSrc);
    } else {
      audioRef.current.src = audioSrc;
    }
    audioRef.current.play().catch(() => {});
  };

  const matchDurationToAudio = async () => {
    if (!audioSrc) return;
    setMatchingAudio(true);
    try {
      const dur = await getAudioDurationFromUrl(audioSrc, {
        min: SCENE_DUR_MIN,
        max: SCENE_DUR_MAX,
      });
      setDuration(dur);
      await api.updateScene(project.id, scene.id, { duration: dur });
      notify.success(`Duration set to ${dur.toFixed(1)}s to match voiceover`);
      onRefresh();
    } catch {
      notify.error("Could not read audio length.");
    } finally {
      setMatchingAudio(false);
    }
  };

  const queueSceneTts = async () => {
    const narrationText = (scene.narration || scene.subtitle || "").trim();
    const override = ttsText.trim();
    if (!narrationText && !override) {
      notify.error("No narration available. Enter TTS text first.");
      return;
    }
    setGeneratingTts(true);
    try {
      await api.queueSceneAssetGenerate(project.id, scene.id, {
        asset_type: "audio",
        prompt_override: override || undefined,
      });
      notify.success("TTS generation queued");
      onRefresh();
    } catch (e: unknown) {
      notify.error(
        e instanceof Error ? e.message : "Failed to queue TTS generation",
      );
    } finally {
      setGeneratingTts(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Duration
            <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-semibold text-foreground">
              {duration.toFixed(1)}s
            </span>
          </span>
          <input
            type="range"
            min={SCENE_DUR_MIN}
            max={SCENE_DUR_MAX}
            step={0.5}
            value={duration}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              setDuration(next);
              onDraftChange(scene.id, { duration: next });
            }}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Transition
          </span>
          <div className="relative">
            <select
              value={transitionType}
              onChange={(e) => {
                const next = e.target.value;
                setTransitionType(next);
                onDraftChange(scene.id, { transition_type: next });
              }}
              className="w-full appearance-none rounded-lg border border-border/60 bg-background/80 px-3 py-2 pr-8 text-sm outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              title={transitionOptions.find((t) => t.id === transitionType)?.description}
            >
              {transitionOptions.map((t) => (
                <option key={t.id} value={t.id} title={t.description}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>
      </div>

      <div className="h-px w-full bg-border/40" />

      <div className="grid grid-cols-1 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Regenerate mode
          </span>
          <select
            value={regenerateMode}
            onChange={(e) => setRegenerateMode(e.target.value as "image" | "audio" | "both")}
            className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          >
            <option value="image">Image only</option>
            <option value="audio">Audio only</option>
            <option value="both">Image + audio</option>
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRegenerate}
          loading={regenerating}
          loadingLabel="Regenerating…"
          className="h-9 w-full gap-1.5 justify-center"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-9 w-full gap-1.5 justify-center"
          onClick={() => uploadRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload media
        </Button>
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,video/*"
          onChange={(e) => void handleUpload(e)}
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-9 w-full gap-1.5 justify-center"
          onClick={() => void queueSceneTts()}
          loading={generatingTts}
          loadingLabel="Generating…"
        >
          <Volume2 className="h-3.5 w-3.5" />
          Generate TTS
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={playAudio}
          disabled={!audioSrc}
          className="h-9 w-full gap-1.5 justify-center"
        >
          <Volume2 className="h-3.5 w-3.5" />
          Play Audio
        </Button>
      </div>

      {!((scene.narration || scene.subtitle || "").trim()) ? (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            TTS text (narration missing)
          </label>
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            rows={3}
            placeholder="Enter text to synthesize audio for this scene"
            className="w-full resize-none rounded-md border border-border/50 bg-background/80 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 w-full gap-1.5 justify-center"
        onClick={() => void matchDurationToAudio()}
        disabled={matchingAudio || !audioSrc}
      >
        {matchingAudio ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        Match to audio
      </Button>

      <div className="h-px w-full bg-border/40" />

      <Button
        variant="secondary"
        size="sm"
        className="w-full h-9 gap-1.5 justify-center"
        onClick={handleSave}
        loading={saving}
        loadingLabel="Saving…"
      >
        <Save className="h-4 w-4" />
        Save Scene
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene configuration list (left panel)                             */
/* ------------------------------------------------------------------ */

/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export default function ArrangeStep({
  project,
  scenes: rawScenes,
  onRefresh,
  onNext,
  onBack,
}: ArrangeStepProps) {
  const scenes = useMemo(
    () => [...rawScenes].sort((a, b) => a.order_index - b.order_index),
    [rawScenes],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    scenes[0]?.id ?? null,
  );
  const [orderedIds, setOrderedIds] = useState<string[]>(
    scenes.map((s) => s.id),
  );

  useEffect(() => {
    setOrderedIds(scenes.map((s) => s.id));
    if (selectedId && !scenes.find((s) => s.id === selectedId)) {
      setSelectedId(scenes[0]?.id ?? null);
    }
  }, [scenes, selectedId]);

  const orderedScenes = useMemo(
    () =>
      orderedIds
        .map((id) => scenes.find((s) => s.id === id))
        .filter(Boolean) as Scene[],
    [orderedIds, scenes],
  );
  const startTimes = useMemo(
    () => sceneStartTimes(orderedScenes),
    [orderedScenes],
  );

  const selectedScene = useMemo(
    () => orderedScenes.find((s) => s.id === selectedId) ?? orderedScenes[0],
    [orderedScenes, selectedId],
  );

  const selectedIndex = orderedScenes.findIndex(
    (s) => s.id === selectedScene?.id,
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, SceneDraft>>({});
  const [suppressSceneSelect, setSuppressSceneSelect] = useState(false);
  const suppressSelectTimeoutRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (suppressSelectTimeoutRef.current) {
      window.clearTimeout(suppressSelectTimeoutRef.current);
    }
    setSuppressSceneSelect(true);
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveDragId(null);
    if (suppressSelectTimeoutRef.current) {
      window.clearTimeout(suppressSelectTimeoutRef.current);
    }
    suppressSelectTimeoutRef.current = window.setTimeout(() => {
      setSuppressSceneSelect(false);
      suppressSelectTimeoutRef.current = null;
    }, 180);
  }, []);

  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActiveDragId(null);
      if (suppressSelectTimeoutRef.current) {
        window.clearTimeout(suppressSelectTimeoutRef.current);
      }
      suppressSelectTimeoutRef.current = window.setTimeout(() => {
        setSuppressSceneSelect(false);
        suppressSelectTimeoutRef.current = null;
      }, 180);
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIdx = orderedIds.indexOf(active.id as string);
      const newIdx = orderedIds.indexOf(over.id as string);
      if (oldIdx === -1 || newIdx === -1) return;

      const next = arrayMove(orderedIds, oldIdx, newIdx);
      setOrderedIds(next);

      try {
        await api.reorderScenes(project.id, next);
        onRefresh();
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : "Reorder failed");
        setOrderedIds(scenes.map((s) => s.id));
      }
    },
    [orderedIds, project.id, scenes, onRefresh],
  );

  useEffect(() => {
    return () => {
      if (suppressSelectTimeoutRef.current) {
        window.clearTimeout(suppressSelectTimeoutRef.current);
      }
    };
  }, []);

  const activeDragScene = useMemo(() => {
    if (!activeDragId) return null;
    return orderedScenes.find((s) => s.id === activeDragId) ?? null;
  }, [activeDragId, orderedScenes]);

  const activeDragIndex = useMemo(() => {
    if (!activeDragId) return -1;
    return orderedScenes.findIndex((s) => s.id === activeDragId);
  }, [activeDragId, orderedScenes]);

  useEffect(() => {
    const sceneIds = new Set(scenes.map((s) => s.id));
    setSceneDrafts((prev) => {
      const next: Record<string, SceneDraft> = {};
      for (const [sceneId, draft] of Object.entries(prev)) {
        if (sceneIds.has(sceneId)) {
          next[sceneId] = draft;
        }
      }
      return next;
    });
  }, [scenes]);

  const updateSceneDraft = useCallback((sceneId: string, patch: SceneDraft) => {
    setSceneDrafts((prev) => ({
      ...prev,
      [sceneId]: {
        ...(prev[sceneId] || {}),
        ...patch,
      },
    }));
  }, []);

  const saveSceneDraft = useCallback(
    async (sceneId: string) => {
      const scene = orderedScenes.find((s) => s.id === sceneId);
      if (!scene) throw new Error("Scene not found");

      const draft = sceneDrafts[sceneId] || {};
      const payload: {
        narration?: string;
        image_prompt?: string;
        duration?: number;
        transition_type?: string;
      } = {};

      if (
        draft.narration !== undefined &&
        draft.narration !== (scene.narration ?? "")
      ) {
        payload.narration = draft.narration;
      }
      if (
        draft.image_prompt !== undefined &&
        draft.image_prompt !== (scene.image_prompt ?? "")
      ) {
        payload.image_prompt = draft.image_prompt;
      }
      if (draft.duration !== undefined && draft.duration !== scene.duration) {
        payload.duration = draft.duration;
      }
      if (
        draft.transition_type !== undefined &&
        draft.transition_type !== (scene.transition_type || "fade")
      ) {
        payload.transition_type = draft.transition_type;
      }

      if (Object.keys(payload).length === 0) {
        notify.info("No changes to save.");
        return false;
      }

      await api.updateScene(project.id, sceneId, payload);
      notify.success("Scene updated");
      setSceneDrafts((prev) => {
        const next = { ...prev };
        delete next[sceneId];
        return next;
      });
      onRefresh();
      return true;
    },
    [onRefresh, orderedScenes, project.id, sceneDrafts],
  );

  const [matchingAll, setMatchingAll] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const defaultSubtitleSettings = useSettingsStore((s) => s.defaults.subtitles);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const [interScenePauseMs, setInterScenePauseMs] = useState<number>(() =>
    toBoundedInt(project.settings?.inter_scene_pause_ms, 600, INTER_SCENE_PAUSE_MIN, INTER_SCENE_PAUSE_MAX)
  );
  const [transitionOverlapMs, setTransitionOverlapMs] = useState<number>(() =>
    toBoundedInt(project.settings?.transition_overlap_ms, 250, TRANSITION_OVERLAP_MIN, TRANSITION_OVERLAP_MAX)
  );
  const [savingPacing, setSavingPacing] = useState(false);
  const hasAnyAudio = useMemo(
    () =>
      orderedScenes.some((s) => !!pickLatestAsset(s.assets, "audio")),
    [orderedScenes],
  );
  const selectedHasAudio = Boolean(
    selectedScene && pickLatestAsset(selectedScene.assets, "audio"),
  );
  const selectedHasImage = Boolean(
    selectedScene && pickLatestAsset(selectedScene.assets, "image"),
  );
  const safeZonePlatform =
    project.video_settings?.subtitles.safe_zone_platform ||
    "tiktok";
  const resolvedSubtitleSettings: SubtitleSettings =
    project.video_settings?.subtitles ?? defaultSubtitleSettings;
  const projectSafeZoneConfig =
    project.video_settings?.subtitles.safe_zone_config ?? null;
  const projectSafeZoneConfigKey = safeZoneConfigKey(
    projectSafeZoneConfig,
  );
  const [safeZoneConfig, setSafeZoneConfig] = useState<SafeZoneConfig | null>(() =>
    resolveSafeZoneConfig(
      safeZonePlatform,
      projectSafeZoneConfig,
    ),
  );
  const [safeZoneSaving, setSafeZoneSaving] = useState(false);
  const [safeZoneDefaultsSaving, setSafeZoneDefaultsSaving] = useState(false);

  useEffect(() => {
    setInterScenePauseMs(
      toBoundedInt(project.settings?.inter_scene_pause_ms, 600, INTER_SCENE_PAUSE_MIN, INTER_SCENE_PAUSE_MAX)
    );
    setTransitionOverlapMs(
      toBoundedInt(project.settings?.transition_overlap_ms, 250, TRANSITION_OVERLAP_MIN, TRANSITION_OVERLAP_MAX)
    );
  }, [project.id, project.settings?.inter_scene_pause_ms, project.settings?.transition_overlap_ms]);

  useEffect(() => {
    setSafeZoneConfig(
      resolveSafeZoneConfig(
        safeZonePlatform,
        projectSafeZoneConfig,
      ),
    );
  }, [
    project.id,
    projectSafeZoneConfig,
    safeZonePlatform,
    projectSafeZoneConfigKey,
  ]);

  const commitSafeZoneConfig = useCallback(
    async (nextConfig: SafeZoneConfig) => {
      const currentConfig = resolveSafeZoneConfig(
        safeZonePlatform,
        projectSafeZoneConfig,
      );
      if (safeZoneConfigKey(nextConfig) === safeZoneConfigKey(currentConfig)) {
        return;
      }
      setSafeZoneSaving(true);
      try {
        await api.updateProjectVideoSettings(project.id, {
          subtitles: {
            ...resolvedSubtitleSettings,
            safe_zone_platform: safeZonePlatform,
            safe_zone_config: nextConfig,
          },
        });
        onRefresh();
      } catch (err: unknown) {
        setSafeZoneConfig(currentConfig);
        notify.error(
          err instanceof Error
            ? err.message
            : "Failed to save subtitle guide settings",
        );
      } finally {
        setSafeZoneSaving(false);
      }
    },
    [
      onRefresh,
      project.id,
      projectSafeZoneConfig,
      resolvedSubtitleSettings,
      safeZonePlatform,
    ],
  );

  const resetSafeZoneConfig = useCallback(() => {
    const preset = resolveSafeZoneConfig(safeZonePlatform, null);
    setSafeZoneConfig(preset);
    void commitSafeZoneConfig(preset);
  }, [commitSafeZoneConfig, safeZonePlatform]);

  const saveSafeZoneAsDefaults = useCallback(
    async (nextConfig: SafeZoneConfig) => {
      setSafeZoneDefaultsSaving(true);
      try {
        await api.updateSettings({
          default_subtitle_safe_zone_platform: safeZonePlatform,
          default_subtitle_safe_zone_config: nextConfig,
        });
        setDefaults({
          subtitles: {
            ...defaultSubtitleSettings,
            safe_zone_platform: safeZonePlatform,
            safe_zone_config: nextConfig,
          },
        });
        notify.success("Saved guide defaults for new projects");
      } catch (err: unknown) {
        notify.error(
          err instanceof Error
            ? err.message
            : "Failed to save default guide settings",
        );
      } finally {
        setSafeZoneDefaultsSaving(false);
      }
    },
    [defaultSubtitleSettings, safeZonePlatform, setDefaults],
  );

  const matchAllScenesToAudio = useCallback(async () => {
    setMatchingAll(true);
    let updated = 0;
    try {
      for (const sc of orderedScenes) {
        const audio = pickLatestAsset(sc.assets, "audio");
        if (!audio) continue;
        const url = assetMediaSrc(audio);
        if (!url) continue;
        try {
          const dur = await getAudioDurationFromUrl(url, {
            min: SCENE_DUR_MIN,
            max: SCENE_DUR_MAX,
          });
          await api.updateScene(project.id, sc.id, { duration: dur });
          updated += 1;
        } catch {
          /* skip scene */
        }
      }
      if (updated > 0) {
        notify.success(
          `Matched ${updated} scene${updated === 1 ? "" : "s"} to voiceover length`,
        );
        onRefresh();
      } else {
        notify.error("No scenes with readable audio. Generate voiceover in Assets first.");
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Batch sync failed");
    } finally {
      setMatchingAll(false);
    }
  }, [onRefresh, orderedScenes, project.id]);

  const savePacingSettings = useCallback(async () => {
    const pause = toBoundedInt(interScenePauseMs, 600, INTER_SCENE_PAUSE_MIN, INTER_SCENE_PAUSE_MAX);
    const overlap = toBoundedInt(transitionOverlapMs, 250, TRANSITION_OVERLAP_MIN, TRANSITION_OVERLAP_MAX);
    setSavingPacing(true);
    try {
      await api.updateProject(project.id, {
        settings: {
          ...(project.settings || {}),
          inter_scene_pause_ms: pause,
          transition_overlap_ms: overlap,
        },
      });
      setInterScenePauseMs(pause);
      setTransitionOverlapMs(overlap);
      notify.success("Project pacing saved");
      onRefresh();
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Failed to save pacing settings");
    } finally {
      setSavingPacing(false);
    }
  }, [interScenePauseMs, onRefresh, project.id, project.settings, transitionOverlapMs]);

  if (!scenes.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <Film className="h-12 w-12 opacity-40" />
        <p className="text-sm">No scenes to arrange.</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Assets
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-card/70 px-3 py-2.5">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Assets
        </Button>
        <div className="text-sm font-semibold text-foreground">
          Arrange & Edit
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {orderedScenes.length} scenes
          </span>
        </div>
        <Button onClick={onNext} variant="animated">
          Compile Video
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 rounded-2xl border border-border/50 bg-card/80 px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              Arrange
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Tune pacing, transitions, and scene order</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              This is the review pass before compile. Reorder beats, fine-tune durations, and make sure each scene feels ready for the final cut.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:min-w-[340px] lg:grid-cols-4">
            <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenes</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{orderedScenes.length}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Audio</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{hasAnyAudio ? "Ready" : "Missing"}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected image</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedHasImage ? "Ready" : "Missing"}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected audio</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedHasAudio ? "Ready" : "Missing"}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              <input
                id="safe-zone-toggle"
                type="checkbox"
                checked={showSafeZone}
                onChange={(e) => setShowSafeZone(e.target.checked)}
              />
              <label htmlFor="safe-zone-toggle" className="cursor-pointer">
                Show safe zone overlay
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12 lg:items-stretch lg:gap-4">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/30 bg-card/70 lg:col-span-3">
          <div className="shrink-0 border-b border-border/20 bg-background/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground/90 uppercase tracking-wide">
                <Film className="h-3.5 w-3.5 text-primary/80" />
                Scene Stack
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {orderedScenes.length} scenes
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Drag to reorder. Click to edit.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pr-2">
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
                <div className="flex flex-col gap-2">
                  {orderedScenes.map((sc, i) => (
                    <VerticalSortableCard
                      key={sc.id}
                      scene={sc}
                      index={i}
                      startTimeSec={startTimes[i] ?? 0}
                      isSelected={sc.id === selectedId}
                      suppressSelect={suppressSceneSelect}
                      onSelect={() => setSelectedId(sc.id)}
                    />
                  ))}
                </div>
              </SortableContext>
              <BodyPortal>
                <DragOverlay adjustScale={false} dropAnimation={{ duration: 180, easing: "cubic-bezier(0.25,1,0.5,1)" }}>
                  {activeDragScene && activeDragIndex >= 0 ? (
                    <ArrangeDragPreview
                      scene={activeDragScene}
                      index={activeDragIndex}
                      startTimeSec={startTimes[activeDragIndex] ?? 0}
                    />
                  ) : null}
                </DragOverlay>
              </BodyPortal>
            </DndContext>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/30 bg-card/80 p-3 lg:col-span-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground/90">
              Scene Editor
              {selectedScene && (
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  Scene {selectedIndex + 1}
                </span>
              )}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Edit narration, prompts, transitions, and timing.
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <AnimatePresence mode="popLayout">
              {selectedScene && (
                <motion.div
                  key={selectedScene.id}
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <SceneInspector
                    scene={selectedScene}
                    draft={sceneDrafts[selectedScene.id]}
                    onDraftChange={updateSceneDraft}
                    onSaveScene={saveSceneDraft}
                    showSafeZone={showSafeZone}
                    safeZonePlatform={safeZonePlatform}
                    safeZoneConfig={safeZoneConfig}
                    onSafeZoneChange={setSafeZoneConfig}
                    onSafeZoneCommit={commitSafeZoneConfig}
                    onSafeZoneReset={resetSafeZoneConfig}
                    onSaveSafeZoneAsDefaults={(config) => void saveSafeZoneAsDefaults(config)}
                    safeZoneSaving={safeZoneSaving}
                    safeZoneDefaultsSaving={safeZoneDefaultsSaving}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 lg:col-span-3">
          <Card className="shrink-0 rounded-xl border-border/30 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tools & pacing</CardTitle>
              <CardDescription className="text-[11px]">
                Scene controls, batch actions, and compile pacing in one panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Scene tools</h4>
                {selectedScene ? (
                  <SceneQuickTools
                    project={project}
                    scene={selectedScene}
                    draft={sceneDrafts[selectedScene.id]}
                    onDraftChange={updateSceneDraft}
                    onSaveScene={saveSceneDraft}
                    onRefresh={onRefresh}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Select a scene to edit.</p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Batch tools</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={matchingAll || !hasAnyAudio}
                  onClick={() => void matchAllScenesToAudio()}
                  title={
                    hasAnyAudio
                      ? "Set each scene duration to match its voiceover"
                      : "Add voiceover in Assets first"
                  }
                >
                  {matchingAll ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  Match all to audio
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Project pacing</h4>
                  <p className="text-[11px] text-muted-foreground">Controls compile timing for this project.</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Inter-scene pause (ms)
                  </label>
                  <Input
                    type="number"
                    min={INTER_SCENE_PAUSE_MIN}
                    max={INTER_SCENE_PAUSE_MAX}
                    step={50}
                    value={interScenePauseMs}
                    onChange={(e) => setInterScenePauseMs(toBoundedInt(e.target.value, 600, INTER_SCENE_PAUSE_MIN, INTER_SCENE_PAUSE_MAX))}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Transition overlap (ms)
                  </label>
                  <Input
                    type="number"
                    min={TRANSITION_OVERLAP_MIN}
                    max={TRANSITION_OVERLAP_MAX}
                    step={50}
                    value={transitionOverlapMs}
                    onChange={(e) => setTransitionOverlapMs(toBoundedInt(e.target.value, 250, TRANSITION_OVERLAP_MIN, TRANSITION_OVERLAP_MAX))}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void savePacingSettings()}
                  loading={savingPacing}
                  loadingLabel="Saving…"
                >
                  Save pacing
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Selected scene</h4>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Has image</span>
                    <span className={cn("font-semibold", selectedHasImage ? "text-foreground" : "text-muted-foreground")}>
                      {selectedHasImage ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Has audio</span>
                    <span className={cn("font-semibold", selectedHasAudio ? "text-foreground" : "text-muted-foreground")}>
                      {selectedHasAudio ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Transition</span>
                    <span className="font-semibold text-foreground">
                      {selectedScene?.transition_type?.replace(/_/g, " ") || "fade"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
