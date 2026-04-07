import { z } from "zod";
import type { AudioSettings, SubtitleSettings, VideoStyleSettings } from "@/lib/types";

/** Must match backend `STORY_TEMPLATE_IDS` in script_service.py */
export const STORY_TEMPLATE_IDS = [
  "default",
  "political_commentary",
  "corporate_expose",
  "historical_parallel",
  "satirical_irony",
  "urgent_warning",
  "myth_vs_reality",
  "countdown_reveal",
  "before_after_shift",
  "domino_effect",
  "investigative_breakdown",
  "rise_fall_rebound",
] as const;

export const SUBTITLE_SOURCES = ["llm", "transcription"] as const;
export const TRANSCRIPTION_PROVIDERS = ["openai", "groq"] as const;
export const SCENE_NARRATION_STYLE_IDS = ["short", "balanced", "long"] as const;
export const PIPELINE_MODES = ["manual", "auto"] as const;
export const TARGET_STAGES = ["storyboard", "assets", "compile"] as const;
export const GENERATION_MODE_IDS = ["standard", "dialogue"] as const;
export const DIALOGUE_STYLE_PRESET_IDS = [
  "comic_book",
  "political_cartoon",
  "graphic_novel",
  "anime",
  "photorealistic",
  "documentary",
  "cinematic",
  "cinematic_noir",
  "epic_blockbuster",
  "watercolor",
] as const;
export const DIALOGUE_SHOT_TYPE_IDS = ["medium", "closeup", "two-shot", "reaction"] as const;

const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  voice_profile: z.string().nullable().optional(),
  reference_image_url: z.string().nullable().optional(),
  style_prompt: z.string().min(1),
  color_palette: z.array(z.string()).nullable().optional(),
});

export const generateVideoFormSchema = z.object({
  title: z.string(),
  custom_script: z.string(),
  generation_mode: z.enum(GENERATION_MODE_IDS).default("standard"),
  story_type: z.string(),
  story_template: z.enum(STORY_TEMPLATE_IDS).default("default"),
  llm_provider: z.string(),
  llm_model: z.union([z.string(), z.null()]).optional(),
  image_provider: z.string(),
  image_style: z.string(),
  tts_provider: z.string(),
  tts_voice: z.string(),
  tts_speed: z.coerce.number().min(0.5).max(2),
  tts_response_format: z.enum(["mp3", "wav", "opus", "flac", "m4a"]).default("mp3"),
  tts_normalize: z.boolean(),
  resolution: z.string(),
  transition: z.string(),
  subtitle_enabled: z.boolean(),
  subtitle_source: z.enum(SUBTITLE_SOURCES).default("transcription"),
  generate_subtitles: z.boolean(),
  transcription_provider: z.enum(TRANSCRIPTION_PROVIDERS).default("openai"),
  transcription_language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a language code like en or en-US"),
  background_music: z.string(),
  background_music_volume: z.coerce.number().min(0).max(1),
  scene_count: z.coerce.number().int().min(2).max(100),
  dynamic_scenes: z.boolean().default(false),
  word_count: z.coerce.number().int().min(150).max(800),
  scene_narration_style: z.enum(SCENE_NARRATION_STYLE_IDS).default("balanced"),
  scene_duration: z.coerce.number().min(1).max(60),
  inter_scene_pause_ms: z.coerce.number().int().min(0).max(1200),
  transition_overlap_ms: z.coerce.number().int().min(0).max(800),
  use_production_storyboard: z.boolean(),
  match_scenes_to_audio: z.boolean(),
  visual_continuity: z.string(),
  dialogue_style_preset: z.enum(DIALOGUE_STYLE_PRESET_IDS).default("comic_book"),
  character_consistency_enabled: z.boolean().default(true),
  speaker_labels_in_subtitles: z.boolean().default(true),
  default_shot_type: z.enum(DIALOGUE_SHOT_TYPE_IDS).default("medium"),
  pause_between_speakers_ms: z.coerce.number().int().min(0).max(1500),
  reaction_shot_duration: z.coerce.number().min(1).max(8),
  dialogue_characters: z.array(characterSchema).default([]),
});

export type GenerateFormValues = z.infer<typeof generateVideoFormSchema>;
export const generatePipelineStageSchema = z.object({
  pipeline_mode: z.enum(PIPELINE_MODES).default("manual"),
  target_stage: z.enum(TARGET_STAGES),
});

export type SettingsDefaultsSlice = {
  llm_provider: string;
  llm_model: string;
  image_provider: string;
  image_style: string;
  tts_provider: string;
  tts_voice: string;
  tts_speed: number;
  tts_response_format: "mp3" | "wav" | "opus" | "flac" | "m4a";
  tts_normalize: boolean;
  resolution: string;
  transition: string;
  word_count?: number;
  scene_count?: number;
  scene_narration_style?: "short" | "balanced" | "long";
  subtitle_enabled?: boolean;
  subtitle_source?: "llm" | "transcription";
  generate_subtitles?: boolean;
  transcription_provider?: "openai" | "groq";
  transcription_language?: string;
  inter_scene_pause_ms?: number;
  transition_overlap_ms?: number;
  use_production_storyboard?: boolean;
  match_scenes_to_audio?: boolean;
  visual_continuity?: string;
  video_style: VideoStyleSettings;
  subtitles: SubtitleSettings;
  audio: AudioSettings;
};

export function buildGenerateDefaultValues(defaults: SettingsDefaultsSlice): GenerateFormValues {
  const audioDefaults = defaults.audio;
  const videoStyleDefaults = defaults.video_style;
  return {
    title: "",
    custom_script: "",
    generation_mode: "standard",
    story_type: "general",
    story_template: "default",
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model ?? null,
    image_provider: defaults.image_provider,
    image_style: defaults.image_style,
    tts_provider: defaults.tts_provider,
    tts_voice: defaults.tts_voice,
    tts_speed: defaults.tts_speed ?? 1,
    tts_response_format: defaults.tts_response_format ?? "mp3",
    tts_normalize: defaults.tts_normalize ?? true,
    resolution: defaults.resolution,
    transition: defaults.transition,
    subtitle_enabled: defaults.subtitle_enabled ?? true,
    subtitle_source: defaults.subtitle_source ?? "transcription",
    generate_subtitles: defaults.generate_subtitles ?? true,
    transcription_provider: defaults.transcription_provider ?? "openai",
    transcription_language: defaults.transcription_language ?? "en",
    background_music: "",
    background_music_volume: audioDefaults.music_volume,
    scene_count: defaults.scene_count ?? 5,
    dynamic_scenes: false,
    word_count: defaults.word_count ?? 400,
    scene_narration_style: defaults.scene_narration_style ?? "balanced",
    scene_duration: videoStyleDefaults.scene_duration_max,
    inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
    transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
    use_production_storyboard: defaults.use_production_storyboard ?? true,
    match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
    visual_continuity: defaults.visual_continuity ?? "",
    dialogue_style_preset: "comic_book",
    character_consistency_enabled: true,
    speaker_labels_in_subtitles: true,
    default_shot_type: "medium",
    pause_between_speakers_ms: 300,
    reaction_shot_duration: 2.5,
    dialogue_characters: [],
  };
}
