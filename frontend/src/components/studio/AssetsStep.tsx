"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import type { Project, Scene, Job } from "@/lib/types";
import { api, getMediaUrl } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  pickLatestAsset,
  assetMediaSrc,
} from "@/components/projects/scene-assets";
import { allScenesHaveImages } from "@/components/studio/studio-recovery";

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

function detectMode(scenes: Scene[], isGenerating: boolean): Mode {
  if (isGenerating) return "generating";
  const { withImage } = countAssets(scenes);
  if (scenes.length === 0 || withImage === 0) return "pre";
  if (!allScenesHaveImages(scenes)) return "partial";
  return "review";
}

/* ── Compact shimmer placeholder ─────────────────────────────── */

function ShimmerCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className="relative flex flex-col rounded-lg overflow-hidden border border-border/30 bg-muted/20"
    >
      <div
        className="aspect-4/3 w-full"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.06) 50%, hsl(var(--muted)) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.8s ease-in-out infinite",
        }}
      />
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground/40">
          {index + 1}
        </span>
        <div className="h-2 flex-1 rounded-full bg-muted/60" />
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

  const [hovered, setHovered] = useState(false);
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
    } catch (e: any) {
      notify.error(e?.message || "Regeneration failed");
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
      } catch (err: any) {
        notify.error(err?.message || "Upload failed");
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
      className="group relative flex flex-col rounded-lg overflow-hidden border border-border/30 bg-card shadow-sm hover:shadow-md transition-shadow"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image thumbnail -- compact 4:3 ratio */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-black/10">
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
        <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded bg-black/60 px-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {index + 1}
        </span>

        {/* Audio indicator */}
        {audioAsset && (
          <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/80 backdrop-blur-sm">
            <Volume2 className="h-2.5 w-2.5 text-white" />
          </span>
        )}

        {/* Hover overlay for review mode */}
        {isReview && (
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 backdrop-blur-[2px]"
              >
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
                  title="Regenerate"
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
                  title="Upload"
                >
                  <Upload className="h-3 w-3" />
                </button>
                {audioSrc && (
                  <button
                    onClick={toggleAudio}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
                    title={playing ? "Stop" : "Play Audio"}
                  >
                    {playing ? <Volume2 className="h-3 w-3 text-emerald-400" /> : <Play className="h-3 w-3" />}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Bottom info */}
      <div className="px-2.5 py-2">
        <p className="truncate text-[11px] font-medium text-foreground/80">
          {scene.narration?.split("\n")[0]?.slice(0, 50) || `Scene ${index + 1}`}
        </p>
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
    <div className="relative mx-auto mt-4 h-10 max-w-lg overflow-hidden text-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-x-0 text-xs text-muted-foreground leading-relaxed"
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
}: {
  progress: number;
  total: number;
  withImage: number;
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>
          <span className="text-sm text-muted-foreground">
            Generating assets...{" "}
            <span className="font-semibold text-foreground">{withImage}</span>
            <span className="text-muted-foreground/60">/{total}</span>
          </span>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, hsl(38 100% 55%), hsl(var(--primary)))" }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
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

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
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
              Generate All Assets
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
              Resume generation
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
      <div className="min-h-0 flex-1 overflow-hidden pt-4">
        {mode === "pre" && <PreGenerationView scenes={scenes} />}

        {mode === "partial" && !isGenerating && (
          <div className="mb-4 space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Incomplete generation</p>
            <p className="text-xs text-muted-foreground">
              {withImage} of {scenes.length} scene{scenes.length !== 1 ? "s have" : " has"} an image
              {projectFailed && failureMessage?.trim() ? ` — ${failureMessage.trim()}` : ""}.
              Resume to generate the rest; finished scenes are kept.
            </p>
          </div>
        )}

        {mode === "generating" && (
          <div className="space-y-4">
            <ProgressHeader progress={jobProgress} total={scenes.length} withImage={withImage} />

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
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

            <RotatingTips />
          </div>
        )}

        {mode === "partial" && !isGenerating && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
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
            <RotatingTips />
          </div>
        )}

        {mode === "review" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div>
                <h3 className="text-sm font-semibold">Assets ready</h3>
                <p className="text-xs text-muted-foreground">
                  {withImage} image{withImage !== 1 && "s"}, {withAudio} audio clip{withAudio !== 1 && "s"}. Hover to
                  regenerate or upload.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
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
