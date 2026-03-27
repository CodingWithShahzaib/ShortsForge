import type { Scene } from "@/lib/types";

const MIN_DUR = 0.25;

export function sceneDurationSec(scene: Scene): number {
  const d = Number(scene.duration);
  return Number.isFinite(d) && d > 0 ? d : MIN_DUR;
}

export function scenesTotalDuration(scenes: Scene[]): number {
  return scenes.reduce((acc, s) => acc + sceneDurationSec(s), 0);
}

/** Cumulative start time of each scene in timeline order (array index = scene order). */
export function sceneStartTimes(scenes: Scene[]): number[] {
  let acc = 0;
  return scenes.map((s) => {
    const start = acc;
    acc += sceneDurationSec(s);
    return start;
  });
}

export function sceneAtGlobalTime(
  scenes: Scene[],
  t: number,
): { scene: Scene; index: number; localT: number } | null {
  if (!scenes.length) return null;
  const total = scenesTotalDuration(scenes);
  const clamped = Math.max(0, Math.min(t, total - 1e-6));
  let cur = 0;
  for (let i = 0; i < scenes.length; i++) {
    const d = sceneDurationSec(scenes[i]);
    if (clamped < cur + d) {
      return { scene: scenes[i], index: i, localT: clamped - cur };
    }
    cur += d;
  }
  const last = scenes.length - 1;
  return { scene: scenes[last], index: last, localT: sceneDurationSec(scenes[last]) };
}

export function clipPixelWidths(scenes: Scene[], containerWidth: number, minW = 72, maxW = 220): number[] {
  if (!scenes.length) return [];
  if (containerWidth <= 0) return scenes.map(() => minW);
  const total = scenesTotalDuration(scenes);
  if (total <= 0) return scenes.map(() => minW);
  return scenes.map((sc) => {
    const d = sceneDurationSec(sc);
    const w = (d / total) * containerWidth;
    return Math.round(Math.min(maxW, Math.max(minW, w)));
  });
}

export function playheadXFromTime(scenes: Scene[], widths: number[], t: number): number {
  const totalDur = scenesTotalDuration(scenes);
  const clamped = Math.max(0, Math.min(t, totalDur));
  let timeAcc = 0;
  let xAcc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const d = sceneDurationSec(scenes[i]);
    const w = widths[i] ?? 0;
    if (clamped <= timeAcc + d) {
      const frac = d > 0 ? (clamped - timeAcc) / d : 0;
      return xAcc + frac * w;
    }
    timeAcc += d;
    xAcc += w;
  }
  return xAcc;
}

export function globalTimeFromContentX(scenes: Scene[], widths: number[], x: number): number {
  if (!scenes.length) return 0;
  const totalDur = scenesTotalDuration(scenes);
  const totalW = widths.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return 0;
  const clampedX = Math.max(0, Math.min(x, totalW));
  let accW = 0;
  for (let i = 0; i < scenes.length; i++) {
    const w = widths[i] ?? 0;
    if (clampedX <= accW + w) {
      const frac = w > 0 ? (clampedX - accW) / w : 0;
      let start = 0;
      for (let j = 0; j < i; j++) start += sceneDurationSec(scenes[j]);
      return start + frac * sceneDurationSec(scenes[i]);
    }
    accW += w;
  }
  return totalDur;
}
