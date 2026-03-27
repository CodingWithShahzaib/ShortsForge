"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RoundBokehLayer } from "@/components/layout/RoundBokehLayer";
import { STUDIO_STEP_COLORS, studioStepPalette } from "@/components/studio/studio-step-colors";

export function StudioAmbientBackground({ stepIndex }: { stepIndex: number }) {
  const reduceMotion = useReducedMotion();
  const safe = Math.min(Math.max(stepIndex, 0), STUDIO_STEP_COLORS.length - 1);
  const active = studioStepPalette(safe);
  const washDuration = reduceMotion ? 0.15 : 0.85;
  const breatheInDuration = reduceMotion ? 0.12 : 0.55;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl"
      aria-hidden
    >
      {/* Crossfade base wash per step — subtle and low-contrast */}
      {STUDIO_STEP_COLORS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: safe === i ? 1 : 0 }}
          transition={{ duration: washDuration, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: `
              radial-gradient(ellipse 115% 70% at 16% 6%, hsl(${c.accent} / 0.08), transparent 58%),
              radial-gradient(ellipse 95% 58% at 84% 94%, hsl(${c.glow} / 0.06), transparent 60%),
              radial-gradient(ellipse 75% 48% at 48% 102%, hsl(${c.glow} / 0.04), transparent 55%)
            `,
          }}
        />
      ))}

      {/* Slow neon-style breathing on the active step only */}
      <motion.div
        key={safe}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: breatheInDuration, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.22, 0.5, 0.22] }}
          transition={{
            duration: 5.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background: `
              radial-gradient(ellipse 85% 55% at 22% 12%, hsl(${active.glow} / 0.12), transparent 54%),
              radial-gradient(ellipse 65% 42% at 78% 88%, hsl(${active.accent} / 0.08), transparent 58%),
              radial-gradient(circle at 50% 120%, hsl(${active.glow} / 0.06), transparent 48%)
            `,
          }}
        />
      </motion.div>

      <RoundBokehLayer accent={active.accent} glow={active.glow} className="rounded-2xl" />

      {/* Soft vignette so edges stay calm */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 88% 78% at 50% 42%, transparent 0%, hsl(var(--background) / 0.2) 65%, hsl(var(--background) / 0.72) 100%)",
        }}
      />
    </div>
  );
}
