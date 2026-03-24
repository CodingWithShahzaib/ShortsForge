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

export const CONTROL_MODES = ["autopilot", "co_pilot", "manual"] as const;

export const generateVideoFormSchema = z.object({
  title: z.string(),
  custom_script: z.string(),
  control_mode: z.enum(CONTROL_MODES).default("autopilot"),
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
  subtitle_source: z.string(),
  generate_subtitles: z.boolean(),
  transcription_provider: z.string(),
  transcription_language: z.string(),
  subtitle_font: z.string(),
  subtitle_size: z.coerce.number().min(24).max(96),
  subtitle_color: z.string(),
  subtitle_position: z.string(),
  background_music: z.string(),
  background_music_volume: z.coerce.number().min(0).max(1),
  scene_count: z.coerce.number().int().min(2).max(15),
  word_count: z.coerce.number().int().min(150).max(800),
  scene_duration: z.coerce.number().min(0.5).max(60),
});

export type GenerateFormValues = z.infer<typeof generateVideoFormSchema>;

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
};

export function buildGenerateDefaultValues(defaults: SettingsDefaultsSlice): GenerateFormValues {
  return {
    title: "",
    custom_script: "",
    control_mode: "autopilot" as const,
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
    background_music: "",
    background_music_volume: 0.15,
    scene_count: defaults.scene_count ?? 5,
    word_count: defaults.word_count ?? 400,
    scene_duration: 5,
  };
}
