import type { Job, Scene } from "@/lib/types";
import { pickLatestAsset } from "@/components/projects/scene-assets";

export type StudioStepHint = 0 | 1 | 3;

export function allScenesHaveImages(scenes: Scene[]): boolean {
  return scenes.length > 0 && scenes.every((s) => !!pickLatestAsset(s.assets, "image"));
}

export function allScenesHaveAudio(scenes: Scene[]): boolean {
  return scenes.length > 0 && scenes.every((s) => !!pickLatestAsset(s.assets, "audio"));
}

export function allScenesHaveNarration(scenes: Scene[]): boolean {
  return (
    scenes.length > 0 &&
    scenes.every((s) => !!((s.narration || s.subtitle || "").trim()))
  );
}

export function extractJobErrorMessage(job: Job | null | undefined): string {
  if (!job?.error) return "Generation failed";
  const m = job.error.message;
  return typeof m === "string" && m.trim() ? m.trim() : "Generation failed";
}

export function pickLatestFailedVideoRender(projectId: string, jobs: Job[]): Job | null {
  const failed = jobs.filter(
    (j) =>
      j.type === "video_render" &&
      j.status === "failed" &&
      j.project_id === projectId,
  );
  if (!failed.length) return null;
  return [...failed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

export interface StudioRecoveryContext {
  stepHint: StudioStepHint;
  message: string;
}

export function getStudioRecoveryStepLabel(stepHint: StudioStepHint): string {
  if (stepHint === 0) return "Storyboard";
  if (stepHint === 1) return "Assets";
  return "Compile";
}

export function getStudioRecoveryActionLabel(stepHint: StudioStepHint): string {
  if (stepHint === 0) return "Retry storyboard";
  if (stepHint === 1) return "Retry asset prep";
  return "Retry compile";
}

/**
 * Maps scene state to which studio step should surface recovery for a failed job.
 */
export function getStudioRecoveryContext(
  scenes: Scene[],
  fallbackMessage: string,
): StudioRecoveryContext {
  const message = fallbackMessage.trim() || "Generation failed";

  if (scenes.length === 0) {
    return { stepHint: 0, message };
  }
  if (!allScenesHaveImages(scenes) || !allScenesHaveAudio(scenes)) {
    return { stepHint: 1, message };
  }
  return { stepHint: 3, message };
}
