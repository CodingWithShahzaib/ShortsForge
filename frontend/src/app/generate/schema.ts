import { z } from "zod";

/** Must match backend `STORY_TEMPLATE_IDS` in script_service.py */
export const STORY_TEMPLATE_IDS = [
  "default",
  "political_commentary",
  "corporate_expose",
  "historical_parallel",
  "satirical_irony",
  "urgent_warning",
] as const;

export const SUBTITLE_SOURCES = ["llm", "transcription"] as const;
export const TRANSCRIPTION_PROVIDERS = ["openai", "groq"] as const;
export const SUBTITLE_POSITIONS = ["bottom", "top", "center"] as const;
export const SCENE_NARRATION_STYLE_IDS = ["short", "balanced", "long"] as const;
export const PIPELINE_MODES = ["manual", "auto"] as const;
export const TARGET_STAGES = ["storyboard", "assets", "compile"] as const;

export const generateVideoFormSchema = z.object({
  title: z.string(),
  custom_script: z.string(),
  story_type: z.string(),
  story_template: z.enum(STORY_TEMPLATE_IDS).default("default"),
  llm_provider: z.string(),
  llm_model: z.union([z.string(), z.null()]).optional(),
  image_provider: z.string(),
  image_style: z.string(),
  tts_provider: z.string(),
  tts_voice: z.string(),
  resolution: z.string(),
  transition: z.string(),
  subtitle_enabled: z.boolean(),
  subtitle_source: z.enum(SUBTITLE_SOURCES).default("llm"),
  generate_subtitles: z.boolean(),
  transcription_provider: z.enum(TRANSCRIPTION_PROVIDERS).default("openai"),
  transcription_language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a language code like en or en-US"),
  subtitle_font: z.string(),
  subtitle_size: z.coerce.number().min(24).max(96),
  subtitle_color: z.string(),
  subtitle_position: z.enum(SUBTITLE_POSITIONS).default("bottom"),
  subtitle_words_per_group: z.coerce.number().int().min(2).max(12).default(4),
  background_music: z.string(),
  background_music_volume: z.coerce.number().min(0).max(1),
  scene_count: z.coerce.number().int().min(2).max(100),
  word_count: z.coerce.number().int().min(150).max(800),
  scene_narration_style: z.enum(SCENE_NARRATION_STYLE_IDS).default("balanced"),
  scene_duration: z.coerce.number().min(1).max(60),
  inter_scene_pause_ms: z.coerce.number().int().min(0).max(1200),
  transition_overlap_ms: z.coerce.number().int().min(0).max(800),
  use_production_storyboard: z.boolean(),
  match_scenes_to_audio: z.boolean(),
  visual_continuity: z.string(),
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
  resolution: string;
  transition: string;
  word_count?: number;
  scene_count?: number;
  scene_narration_style?: "short" | "balanced" | "long";
  inter_scene_pause_ms?: number;
  transition_overlap_ms?: number;
  use_production_storyboard?: boolean;
  match_scenes_to_audio?: boolean;
  visual_continuity?: string;
};

export function buildGenerateDefaultValues(defaults: SettingsDefaultsSlice): GenerateFormValues {
  return {
    title: "",
    custom_script: "",
    story_type: "general",
    story_template: "default",
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model ?? null,
    image_provider: defaults.image_provider,
    image_style: defaults.image_style,
    tts_provider: defaults.tts_provider,
    tts_voice: defaults.tts_voice,
    resolution: defaults.resolution,
    transition: defaults.transition,
    subtitle_enabled: true,
    subtitle_source: "llm",
    generate_subtitles: true,
    transcription_provider: "openai",
    transcription_language: "en",
    subtitle_font: "Arial",
    subtitle_size: 48,
    subtitle_color: "#FFFFFF",
    subtitle_position: "bottom",
    subtitle_words_per_group: 4,
    background_music: "",
    background_music_volume: 0.15,
    scene_count: defaults.scene_count ?? 5,
    word_count: defaults.word_count ?? 400,
    scene_narration_style: defaults.scene_narration_style ?? "balanced",
    scene_duration: 5,
    inter_scene_pause_ms: defaults.inter_scene_pause_ms ?? 600,
    transition_overlap_ms: defaults.transition_overlap_ms ?? 250,
    use_production_storyboard: defaults.use_production_storyboard ?? true,
    match_scenes_to_audio: defaults.match_scenes_to_audio ?? true,
    visual_continuity: defaults.visual_continuity ?? "",
  };
}
