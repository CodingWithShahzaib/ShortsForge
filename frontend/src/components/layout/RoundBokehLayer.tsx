"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Soft circular lens-style bokeh: many round blurs (not elliptical corner washes).
 * `accent` / `glow` are HSL triples ("210 100% 60%") or CSS vars ("var(--primary)").
 */
const ORBS: ReadonlyArray<{
  left: string;
  top: string;
  size: number;
  blur: number;
  alpha: number;
  duration: number;
  delay: number;
  useGlow: boolean;
}> = [
  { left: "8%", top: "12%", size: 132, blur: 44, alpha: 0.32, duration: 14, delay: 0, useGlow: false },
  { left: "88%", top: "16%", size: 96, blur: 36, alpha: 0.26, duration: 17, delay: 0.6, useGlow: true },
  { left: "18%", top: "72%", size: 118, blur: 40, alpha: 0.24, duration: 15, delay: 1.1, useGlow: true },
  { left: "78%", top: "68%", size: 104, blur: 38, alpha: 0.28, duration: 16, delay: 0.2, useGlow: false },
  { left: "42%", top: "8%", size: 72, blur: 28, alpha: 0.2, duration: 12, delay: 2, useGlow: true },
  { left: "62%", top: "82%", size: 88, blur: 32, alpha: 0.22, duration: 13, delay: 0.9, useGlow: false },
  { left: "5%", top: "48%", size: 64, blur: 26, alpha: 0.18, duration: 18, delay: 0.4, useGlow: true },
  { left: "92%", top: "44%", size: 76, blur: 30, alpha: 0.2, duration: 14.5, delay: 1.4, useGlow: false },
  { left: "28%", top: "28%", size: 56, blur: 22, alpha: 0.16, duration: 11, delay: 0.7, useGlow: false },
  { left: "70%", top: "32%", size: 48, blur: 20, alpha: 0.14, duration: 10, delay: 1.8, useGlow: true },
  { left: "50%", top: "52%", size: 200, blur: 56, alpha: 0.12, duration: 20, delay: 0, useGlow: false },
  { left: "14%", top: "88%", size: 52, blur: 24, alpha: 0.15, duration: 12, delay: 2.2, useGlow: true },
];

export function RoundBokehLayer({
  accent,
  glow,
  className = "",
}: {
  accent: string;
  glow: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {ORBS.map((o, i) => {
        const hue = o.useGlow ? glow : accent;
        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: o.left, top: o.top }}
          >
            <motion.div
              className="rounded-full"
              style={{
                width: o.size,
                height: o.size,
                background: `radial-gradient(circle at 50% 50%, hsl(${hue} / ${o.alpha}) 0%, hsl(${hue} / 0.06) 48%, transparent 68%)`,
                filter: `blur(${o.blur}px)`,
              }}
              animate={
                reduceMotion
                  ? {}
                  : {
                      opacity: [0.75, 1, 0.8, 0.75],
                      scale: [1, 1.06, 0.98, 1],
                    }
              }
              transition={{
                duration: o.duration,
                repeat: Infinity,
                ease: "easeInOut",
                delay: o.delay,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
