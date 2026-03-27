"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard,
  Download,
  FolderOpen,
  LibraryBig,
  CheckCircle2,
  Film,
  Subtitles,
  AudioLines,
  ArrowLeftRight,
  ArrowLeft,
  Layers,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import ReactPlayer from "react-player";

import type { Project, Scene } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CelebrationOverlay from "./CelebrationOverlay";

interface CompileStepProps {
  project: Project;
  scenes: Scene[];
  isCompiling: boolean;
  jobProgress: number;
  progressDetail?: string;
  completedVideoUrl: string | null;
  videoIsStale?: boolean;
  lastCompiledAt?: string | null;
  compileFailed?: boolean;
  failureMessage?: string;
  onRetryCompile?: () => void | Promise<void>;
  pipelineBusy?: boolean;
  onStartCompile: () => void;
  onBack: () => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 90; // ≈ 565.49

const TIPS = [
  "Tip: You can tweak individual scenes before compiling.",
  "Did you know? Transitions are applied between every scene.",
  "Fun fact: Subtitles are auto-generated from your narration.",
  "Tip: Try different story types for unique pacing.",
  "Fun fact: Audio is mixed to match scene duration automatically.",
  "Tip: Re-compile anytime — your scenes are never lost.",
];

export default function CompileStep({
  project,
  scenes,
  isCompiling,
  jobProgress,
  progressDetail,
  completedVideoUrl,
  videoIsStale = false,
  lastCompiledAt,
  compileFailed = false,
  failureMessage,
  onRetryCompile,
  pipelineBusy = false,
  onStartCompile,
  onBack,
}: CompileStepProps) {
  const router = useRouter();
  const sceneCount = scenes.length;

  /* ── celebration state ─────────────────────────────────────── */
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationDone, setCelebrationDone] = useState(false);

  useEffect(() => {
    if (completedVideoUrl && !isCompiling) {
      setShowCelebration(true);
      setCelebrationDone(false);
    }
  }, [completedVideoUrl, isCompiling]);

  const handleCelebrationDone = useCallback(() => {
    setShowCelebration(false);
    setCelebrationDone(true);
  }, []);

  /* ── rotating tips ─────────────────────────────────────────── */
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    if (!isCompiling) return;
    const iv = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, [isCompiling]);

  /* ── checklist items ───────────────────────────────────────── */
  const checklist = useMemo(
    () => [
      { icon: Film, label: `Render ${sceneCount} scene${sceneCount !== 1 ? "s" : ""}` },
      { icon: ArrowLeftRight, label: "Add transitions" },
      { icon: Subtitles, label: "Generate subtitles" },
      { icon: AudioLines, label: "Mix audio" },
      { icon: Layers, label: "Optional frame overlay" },
    ],
    [sceneCount],
  );

  /* ── progress ring values ──────────────────────────────────── */
  const clampedProgress = Math.min(Math.max(jobProgress, 0), 100);
  const dashOffset = CIRCUMFERENCE - (clampedProgress / 100) * CIRCUMFERENCE;

  /* ═══════════════ MODE 3 — Complete ═══════════════════════════ */
  if (completedVideoUrl && !isCompiling) {
    return (
      <>
        <CelebrationOverlay show={showCelebration} onDone={handleCelebrationDone} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6"
        >
          {/* header card */}
          <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 px-6 py-5 shadow-lg">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_55%)]" />
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.15 }}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400"
                >
                  <CheckCircle2 className="h-6 w-6" />
                </motion.div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
                    <Badge variant={videoIsStale ? "warning" : "success"}>
                      {videoIsStale ? "Needs recompile" : "Up to date"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {videoIsStale
                      ? "Preview shown is from a previous compile."
                      : "Your video is compiled and ready to share."}
                  </p>
                </div>
              </div>
              {lastCompiledAt && (
                <div className="text-xs text-muted-foreground md:text-right">
                  Last compiled
                  <div className="text-sm text-foreground">
                    {new Date(lastCompiledAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* player */}
          <div className="relative w-full overflow-hidden rounded-2xl border border-border/40 bg-black shadow-2xl">
            <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.45),rgba(0,0,0,0)_35%,rgba(0,0,0,0)_70%,rgba(0,0,0,0.4))]" />
            <ReactPlayer
              src={completedVideoUrl}
              controls
              width="100%"
              height="auto"
              style={{ maxHeight: "70vh" }}
            />
          </div>

          {/* actions */}
          <div className="grid w-full gap-3 md:grid-cols-2">
            <Button
              variant={videoIsStale ? "primary" : "outline"}
              size="lg"
              onClick={onStartCompile}
              className="justify-center"
            >
              <Clapperboard className="h-4 w-4" />
              {videoIsStale ? "Recompile Video" : "Recompile"}
            </Button>
            <Button variant="primary" size="lg" asChild>
              <a href={completedVideoUrl} download>
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
            <Button variant="outline" size="lg" onClick={() => router.push(`/projects/${project.id}`)}>
              <FolderOpen className="h-4 w-4" />
              Open Project
            </Button>
            <Button variant="ghost" size="lg" onClick={() => router.push("/projects")}>
              <LibraryBig className="h-4 w-4" />
              Back to Library
            </Button>
          </div>
        </motion.div>
      </>
    );
  }

  /* ═══════════════ MODE 2 — Compiling ══════════════════════════ */
  if (isCompiling) {
    return (
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/30 py-12 md:py-16">
        {/* animated gradient mesh background */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-40"
          style={{
            background: [
              "radial-gradient(ellipse 60% 50% at 20% 30%, hsl(var(--primary) / 0.35), transparent 70%)",
              "radial-gradient(ellipse 50% 60% at 80% 70%, hsl(260 80% 60% / 0.25), transparent 70%)",
              "radial-gradient(ellipse 70% 40% at 50% 90%, hsl(180 70% 50% / 0.2), transparent 60%)",
            ].join(", "),
            animation: "compileGradientShift 8s ease-in-out infinite alternate",
          }}
        />
        <style>{`
          @keyframes compileGradientShift {
            0%   { filter: hue-rotate(0deg)   translate3d(0,0,0); }
            50%  { filter: hue-rotate(25deg); }
            100% { filter: hue-rotate(-15deg); }
          }
        `}</style>

        {/* progress ring */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="relative flex items-center justify-center"
        >
          {/* ambient glow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              width: 220,
              height: 220,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 60px 10px hsl(var(--primary) / 0.35), 0 0 120px 30px hsl(var(--primary) / 0.15)",
              animation: "pulseGlow 2.5s ease-in-out infinite alternate",
            }}
          />
          <style>{`
            @keyframes pulseGlow {
              0%   { opacity: 0.6; }
              100% { opacity: 1; }
            }
          `}</style>

          <svg width={200} height={200} className="-rotate-90">
            {/* background track */}
            <circle
              cx={100}
              cy={100}
              r={90}
              fill="none"
              stroke="hsl(var(--muted) / 0.3)"
              strokeWidth={8}
            />
            {/* progress arc */}
            <motion.circle
              cx={100}
              cy={100}
              r={90}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </svg>

          {/* center percentage */}
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums tracking-tight">
            {Math.round(clampedProgress)}
            <span className="text-lg font-medium text-muted-foreground">%</span>
          </span>
        </motion.div>

        {/* progress detail */}
        <AnimatePresence mode="wait">
          <motion.p
            key={progressDetail}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-6 text-sm font-medium text-muted-foreground"
          >
            {progressDetail || "Preparing…"}
          </motion.p>
        </AnimatePresence>

        {/* rotating tips */}
        <div className="mt-auto pt-12">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              {TIPS[tipIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /* ═══════════════ MODE 1 — Pre-compile ════════════════════════ */
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-xl flex-col gap-8 py-6"
    >
      {compileFailed && onRetryCompile && (
        <div className="w-full rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Compilation failed</p>
          <p className="mt-1 text-muted-foreground wrap-break-word leading-relaxed">
            {failureMessage?.trim() || "The render did not complete."}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-3"
            loading={pipelineBusy}
            loadingLabel="Retrying…"
            onClick={() => void onRetryCompile()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry compile
          </Button>
        </div>
      )}

      <div className="flex w-full flex-wrap items-center justify-center gap-3 border-b border-border/40 pb-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="animated" size="lg" onClick={onStartCompile}>
          <Clapperboard className="h-4 w-4" />
          Compile Video
        </Button>
      </div>

      {/* icon + title */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Clapperboard className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{project.title}</h2>
        <p className="text-sm text-muted-foreground">
          {sceneCount} scene{sceneCount !== 1 ? "s" : ""} ready to compile
        </p>
      </div>

      {/* checklist */}
      <ul className="w-full max-w-xs space-y-3 self-center">
        {checklist.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
