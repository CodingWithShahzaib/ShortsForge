"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { APP_SECTION_COLORS, appSectionPalette, getAppSectionIndex } from "@/components/layout/app-route-colors";
import { RoundBokehLayer } from "@/components/layout/RoundBokehLayer";

/**
 * Route-aware ambient wash for the main content column (same idea as studio:
 * slow crossfade + soft neon pulse when the sidebar section changes).
 */
export function AppAmbientBackground() {
  const pathname = usePathname();
  const section = getAppSectionIndex(pathname);
  const active = appSectionPalette(section);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {APP_SECTION_COLORS.map((c, i) => (
        <motion.div
          key={c.label}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: section === i ? 1 : 0 }}
          transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: `
              radial-gradient(ellipse 120% 72% at 14% 4%, hsl(${c.accent} / 0.14), transparent 58%),
              radial-gradient(ellipse 95% 60% at 88% 96%, hsl(${c.glow} / 0.11), transparent 58%),
              radial-gradient(ellipse 70% 50% at 52% 108%, hsl(${c.glow} / 0.06), transparent 52%)
            `,
          }}
        />
      ))}

      <motion.div
        key={section}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.32, 0.68, 0.32] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background: `
              radial-gradient(ellipse 90% 58% at 20% 10%, hsl(${active.glow} / 0.16), transparent 54%),
              radial-gradient(ellipse 70% 45% at 82% 90%, hsl(${active.accent} / 0.09), transparent 58%),
              radial-gradient(circle at 50% 115%, hsl(${active.glow} / 0.07), transparent 48%)
            `,
          }}
        />
      </motion.div>

      <RoundBokehLayer accent={active.accent} glow={active.glow} />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 40%, transparent 0%, hsl(var(--background) / 0.32) 62%, hsl(var(--background) / 0.82) 100%)",
        }}
      />
    </div>
  );
}
