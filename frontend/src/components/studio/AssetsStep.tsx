"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Volume2,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Project, Scene } from "@/lib/types";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  pickLatestAsset,
  assetMediaSrc,
} from "@/components/projects/scene-assets";
import { allScenesHaveAudio, allScenesHaveImages } from "@/components/studio/studio-recovery";

interface AssetsStepProps {
  project: Project;
  scenes: Scene[];
  isGenerating: boolean;
  jobProgress: number;
  projectFailed?: boolean;
  failureMessage?: string;
  pipelineBusy?: boolean;
  onRefresh: () => void;
  onStartGeneration: () => void;
  onNext: () => void;
  onBack: () => void;
}

const VISUAL_TIPS = [
  "AI image models respond best to descriptive adjectives -- try 'cinematic', 'ethereal', or 'dramatic'.",
  "Consistent lighting across scenes creates a more cohesive viewing experience.",
  "High-contrast images hold viewer attention better on mobile devices.",
  "Voiceover pace is automatically matched to each scene's duration.",
  "You can regenerate any individual scene's image later.",
  "Portrait scenes work best for Shorts & TikTok, landscape for YouTube.",
  "Images with a clear focal subject score higher engagement.",
  "Audio narration uses neural TTS for natural delivery.",
];

function countAssets(scenes: Scene[]) {
  let withImage = 0;
  let withAudio = 0;
  for (const s of scenes) {
    if (pickLatestAsset(s.assets, "image")) withImage++;
    if (pickLatestAsset(s.assets, "audio")) withAudio++;
  }
  return { withImage, withAudio };
}

type Mode = "pre" | "generating" | "partial" | "review";

const ASSET_GRID_CLASSNAME =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

function detectMode(scenes: Scene[], isGenerating: boolean): Mode {
  if (isGenerating) return "generating";
  const { withImage, withAudio } = countAssets(scenes);
  if (scenes.length === 0 || (withImage === 0 && withAudio === 0)) return "pre";
  if (!allScenesHaveImages(scenes) || !allScenesHaveAudio(scenes)) return "partial";
  return "review";
}

/* ── Compact shimmer placeholder ─────────────────────────────── */

function ShimmerCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className="relative flex flex-col overflow-hidden rounded-md border border-border/30 bg-muted/20"
    >
      <div
        className="aspect-5/4 w-full"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.06) 50%, hsl(var(--muted)) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.8s ease-in-out infinite",
        }}
      />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded bg-muted text-[9px] font-bold text-muted-foreground/40">
          {index + 1}
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-muted/60" />
      </div>
    </motion.div>
  );
}

/* ── Compact generated card ──────────────────────────────────── */

function GeneratedCard({
  scene,
  index,
  isReview,
  projectId,
  onRefresh,
}: {
  scene: Scene;
  index: number;
  isReview: boolean;
  projectId: string;
  onRefresh: () => void;
}) {
  const imgAsset = pickLatestAsset(scene.assets, "image");
  const audioAsset = pickLatestAsset(scene.assets, "audio");
  const imgSrc = assetMediaSrc(imgAsset);
  const audioSrc = assetMediaSrc(audioAsset);
  const cardLabel = (scene.image_prompt || "").trim() || `Scene ${index + 1}`;

  const [regenerating, setRegenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      await api.regenerateSceneImage(projectId, scene.id);
      notify.success("Image regeneration started");
      onRefresh();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }, [projectId, scene.id, onRefresh]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await api.uploadSceneImage(projectId, scene.id, file);
        notify.success("Image uploaded");
        onRefresh();
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : "Upload failed");
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [projectId, scene.id, onRefresh],
  );

  const toggleAudio = useCallback(() => {
    if (!audioSrc) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioSrc);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }, [audioSrc, playing]);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(8px)", scale: 0.95 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: "easeOut" }}
      className="relative flex flex-col overflow-hidden rounded-md border border-border/30 bg-card shadow-sm"
    >
      {/* Image thumbnail */}
      <div className="relative aspect-5/4 w-full overflow-hidden bg-black/10">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`Scene ${index + 1}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/30">
            <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
          </div>
        )}

        {/* Scene badge */}
        <span className="absolute left-1.5 top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded bg-black/65 px-1.5 text-[9px] font-bold text-white backdrop-blur-sm">
          {index + 1}
        </span>

        {/* Audio indicator */}
        {audioAsset && (
          <span className="absolute right-1.5 top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500/85 backdrop-blur-sm">
            <Volume2 className="h-2.5 w-2.5 text-white" />
          </span>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Bottom info */}
      <div className="space-y-1.5 px-2 py-1.5">
        <p className="truncate text-[10px] font-medium text-foreground/80">
          {cardLabel}
        </p>
        {(isReview || !imgSrc || !audioSrc) ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px]"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
            >
              {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Regenerate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px]"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Upload
            </Button>
            {audioSrc ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={toggleAudio}
              >
                {playing ? <Volume2 className="h-3 w-3 text-emerald-500" /> : <Play className="h-3 w-3" />}
                {playing ? "Stop audio" : "Play audio"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ── Rotating tips ───────────────────────────────────────────── */

function RotatingTips() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % VISUAL_TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative h-10 overflow-hidden rounded-xl border border-border/50 bg-card/55 px-3 text-left">
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-xs leading-relaxed text-muted-foreground"
        >
          <Zap className="mr-1 inline h-3 w-3 text-amber-500/70" />
          {VISUAL_TIPS[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/* ── Progress header ─────────────────────────────────────────── */

function ProgressHeader({
  progress,
  total,
  withImage,
  withAudio,
}: {
  progress: number;
  total: number;
  withImage: number;
  withAudio: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const totalAssets = total * 2;
  const readyAssets = withImage + withAudio;
  const imagesRemaining = Math.max(total - withImage, 0);
  const audioRemaining = Math.max(total - withAudio, 0);
  const imageComplete = total > 0 && withImage >= total;
  const audioComplete = total > 0 && withAudio >= total;

  let helperText = "Building images and voiceover for every scene.";
  if (total === 0) {
    helperText = "Waiting for scenes before generation can begin.";
  } else if (imageComplete && audioComplete) {
    helperText = "All assets are ready. Finalizing the last background tasks.";
  } else if (imageComplete) {
    helperText = "Images are ready. Finishing the remaining voiceover clips.";
  } else if (audioComplete) {
    helperText = "Voiceover is ready. Finishing the remaining images.";
  }

  return (
    <div
      className="supports-backdrop-filter:bg-card/75 rounded-xl border border-border/50 bg-card/85 p-3.5 shadow-sm backdrop-blur"
      aria-live="polite"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/90">
            <motion.span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12"
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.08, 1] }}
              transition={shouldReduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </motion.span>
            Generating assets
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                Preparing visuals and voiceover
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {readyAssets}/{totalAssets} ready
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{helperText}</p>
          </div>
        </div>

        <div className="min-w-[88px] rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-right shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Overall
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {roundedProgress}%
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 transition-colors",
            imageComplete
              ? "border-emerald-500/25 bg-emerald-500/10"
              : "border-border/60 bg-background/60",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  imageComplete ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary",
                )}
              >
                <ImageIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Images
                </p>
                <p className="text-sm font-medium text-foreground">
                  {imageComplete ? "Complete" : `${imagesRemaining} remaining`}
                </p>
              </div>
            </div>
            {imageComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <p className="mt-3 font-mono text-lg font-semibold tabular-nums text-foreground">
            {withImage}/{total}
          </p>
        </div>

        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 transition-colors",
            audioComplete
              ? "border-emerald-500/25 bg-emerald-500/10"
              : "border-border/60 bg-background/60",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  audioComplete ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary",
                )}
              >
                <Volume2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Audio
                </p>
                <p className="text-sm font-medium text-foreground">
                  {audioComplete ? "Complete" : `${audioRemaining} remaining`}
                </p>
              </div>
            </div>
            {audioComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <p className="mt-3 font-mono text-lg font-semibold tabular-nums text-foreground">
            {withAudio}/{total}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Pipeline progress</span>
          <span>{helperText}</span>
        </div>
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={roundedProgress}
          aria-label="Asset generation progress"
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)] opacity-40" />
          <motion.div
            className="relative h-full rounded-full bg-[linear-gradient(90deg,hsl(38_100%_55%),hsl(var(--primary)))] shadow-[0_0_24px_hsl(var(--primary)/0.2)]"
            initial={false}
            animate={{ width: `${roundedProgress}%` }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
          >
            {!shouldReduceMotion && roundedProgress > 8 && (
              <motion.div
                className="absolute inset-y-0 right-0 w-16 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)]"
                animate={{ x: ["-140%", "140%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ── Pre-generation view ─────────────────────────────────────── */

function PreGenerationView({
  scenes,
}: {
  scenes: Scene[];
}) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
          <Sparkles className="h-6 w-6 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold">Ready to create visuals</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate images & voiceover for{" "}
          <span className="font-medium text-foreground">{scenes.length}</span> scenes
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {scenes.map((scene, i) => (
          <motion.div
            key={scene.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-lg border border-border/40 bg-card p-2 space-y-1"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="truncate text-[10px] font-medium text-foreground/70">Scene {i + 1}</span>
            </div>
            {scene.image_prompt && (
              <p className="line-clamp-2 text-[9px] italic text-primary/50">{scene.image_prompt}</p>
            )}
          </motion.div>
        ))}
      </div>

    </div>
  );
}

/* ── Main component ──────────────────────────────────────────── */

export default function AssetsStep({
  project,
  scenes,
  isGenerating,
  jobProgress,
  projectFailed = false,
  failureMessage,
  pipelineBusy = false,
  onRefresh,
  onStartGeneration,
  onNext,
  onBack,
}: AssetsStepProps) {
  const mode = detectMode(scenes, isGenerating);
  const { withImage, withAudio } = countAssets(scenes);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>

      {/* Studio actions — fixed at top */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Script
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === "pre" && (
            <Button variant="animated" size="lg" className="gap-2 px-6" onClick={onStartGeneration}>
              <Sparkles className="h-4 w-4" />
              Prepare All Assets
            </Button>
          )}
          {mode === "generating" && (
            <span className="text-xs text-muted-foreground">Generating…</span>
          )}
          {mode === "partial" && (
            <Button
              variant="animated"
              size="lg"
              className="gap-2 px-6"
              loading={pipelineBusy}
              loadingLabel="Resuming…"
              onClick={onStartGeneration}
            >
              <RefreshCw className="h-4 w-4" />
              Resume asset prep
            </Button>
          )}
          {mode === "review" && (
            <Button variant="animated" className="gap-1.5" onClick={onNext}>
              Continue to Arrange
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable content: only this region scrolls */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-3 pr-1">
        <div className="mb-3 rounded-xl border border-border/50 bg-card/80 px-3.5 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Assets
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Prepare visuals and voice for every scene</h2>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                Generate, upload, or review image and audio assets here before moving into timing and final compile.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 lg:min-w-[320px]">
              <div className="rounded-lg border border-border/50 bg-background/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenes</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{scenes.length}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Images ready</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{withImage}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/70 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Audio ready</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{withAudio}</p>
              </div>
            </div>
          </div>
        </div>

        {mode === "pre" && <PreGenerationView scenes={scenes} />}

        {mode === "generating" && (
          <div className="grid gap-3 xl:grid-cols-[320px,minmax(0,1fr)] xl:items-start">
            <div className="space-y-3">
              <ProgressHeader
                progress={jobProgress}
                total={scenes.length}
                withImage={withImage}
                withAudio={withAudio}
              />
              <RotatingTips />
            </div>

            <div className={ASSET_GRID_CLASSNAME}>
              {scenes.map((scene, i) => {
                const hasImg = !!pickLatestAsset(scene.assets, "image");
                return hasImg ? (
                  <GeneratedCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    isReview={false}
                    projectId={project.id}
                    onRefresh={onRefresh}
                  />
                ) : (
                  <ShimmerCard key={scene.id} index={i} />
                );
              })}
            </div>
          </div>
        )}

        {mode === "partial" && !isGenerating && (
          <div className="grid gap-3 xl:grid-cols-[280px,minmax(0,1fr)] xl:items-start">
            <div className="space-y-3">
              <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-sm">
                <p className="font-medium text-foreground">Incomplete generation</p>
                <p className="text-xs text-muted-foreground">
                  {withImage}/{scenes.length} images and {withAudio}/{scenes.length} audio clips are ready
                  {projectFailed && failureMessage?.trim() ? ` — ${failureMessage.trim()}` : ""}.
                  Resume to generate the rest; finished scenes are kept.
                </p>
              </div>
              <RotatingTips />
            </div>

            <div className={ASSET_GRID_CLASSNAME}>
              {scenes.map((scene, i) => {
                const hasImg = !!pickLatestAsset(scene.assets, "image");
                return hasImg ? (
                  <GeneratedCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    isReview={false}
                    projectId={project.id}
                    onRefresh={onRefresh}
                  />
                ) : (
                  <ShimmerCard key={scene.id} index={i} />
                );
              })}
            </div>
          </div>
        )}

        {mode === "review" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div>
                <h3 className="text-sm font-semibold">Assets ready</h3>
                <p className="text-xs text-muted-foreground">
                  {withImage} image{withImage !== 1 && "s"}, {withAudio} audio clip{withAudio !== 1 && "s"}. Use the
                  action buttons on each card to regenerate, upload, or preview audio.
                </p>
              </div>
            </div>

            <div className={ASSET_GRID_CLASSNAME}>
              {scenes.map((scene, i) => (
                <GeneratedCard
                  key={scene.id}
                  scene={scene}
                  index={i}
                  isReview
                  projectId={project.id}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
