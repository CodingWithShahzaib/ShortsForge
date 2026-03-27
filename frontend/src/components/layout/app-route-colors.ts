/** Accent washes for main app shell — tuned for light/dark; order matches Sidebar navItems. */
export const APP_SECTION_COLORS = [
  { accent: "187 82% 44%", glow: "188 100% 52%", label: "Pulse" },
  { accent: "262 78% 58%", glow: "268 88% 62%", label: "Create" },
  { accent: "32 92% 50%", glow: "38 96% 54%", label: "Library" },
  { accent: "162 50% 38%", glow: "165 58% 44%", label: "Scripts" },
  { accent: "10 86% 54%", glow: "14 90% 56%", label: "Activity" },
  { accent: "218 30% 54%", glow: "222 28% 46%", label: "Settings" },
] as const;

export type AppSectionPalette = (typeof APP_SECTION_COLORS)[number];

/** Maps URL to sidebar section index (0–5). */
export function getAppSectionIndex(pathname: string | null): number {
  if (!pathname || pathname === "/") return 0;
  const seg = pathname.split("/").filter(Boolean)[0];
  const map: Record<string, number> = {
    generate: 1,
    projects: 2,
    scripts: 3,
    history: 4,
    settings: 5,
  };
  return map[seg ?? ""] ?? 0;
}

export function appSectionPalette(index: number): AppSectionPalette {
  const i = Math.min(Math.max(index, 0), APP_SECTION_COLORS.length - 1);
  return APP_SECTION_COLORS[i];
}
