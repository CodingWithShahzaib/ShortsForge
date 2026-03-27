/** Canonical palette for studio pipeline steps (stepper + ambient background). */
export const STUDIO_STEP_COLORS = [
  { accent: "210 100% 60%", glow: "210 100% 50%", bg: "210 100% 94%", bgDark: "210 40% 16%" },
  { accent: "38 92% 55%", glow: "38 92% 50%", bg: "38 100% 93%", bgDark: "38 40% 16%" },
  { accent: "270 75% 62%", glow: "270 75% 55%", bg: "270 60% 94%", bgDark: "270 30% 16%" },
  { accent: "152 69% 46%", glow: "152 69% 40%", bg: "152 50% 93%", bgDark: "152 30% 16%" },
] as const;

export type StudioStepPalette = (typeof STUDIO_STEP_COLORS)[number];

export function studioStepPalette(index: number): StudioStepPalette {
  const i = Math.min(Math.max(Math.floor(index), 0), STUDIO_STEP_COLORS.length - 1);
  return STUDIO_STEP_COLORS[i];
}
