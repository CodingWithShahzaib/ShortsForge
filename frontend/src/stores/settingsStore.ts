import { create } from "zustand";
import type {
  AudioSettings,
  ProviderStatus,
  Resolution,
  SubtitleSettings,
  Transition,
  VideoStyleSettings,
  Voice,
} from "@/lib/types";

export interface AppDefaults {
  llm_provider: string;
  llm_model: string;
  image_provider: string;
  tts_provider: string;
  tts_voice: string;
  tts_speed: number;
  tts_response_format: "mp3" | "wav" | "opus" | "flac" | "m4a";
  tts_normalize: boolean;
  resolution: string;
  transition: string;
  image_style: string;
  word_count: number;
  scene_count: number;
  scene_narration_style: "short" | "balanced" | "long";
  subtitle_enabled: boolean;
  subtitle_source: "llm" | "transcription";
  generate_subtitles: boolean;
  transcription_provider: "openai" | "groq";
  transcription_language: string;
  inter_scene_pause_ms: number;
  transition_overlap_ms: number;
  use_production_storyboard: boolean;
  match_scenes_to_audio: boolean;
  visual_continuity: string;
  video_style: VideoStyleSettings;
  subtitles: SubtitleSettings;
  audio: AudioSettings;
}

const DEFAULT_APP_DEFAULTS: AppDefaults = {
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  image_provider: "replicate",
  tts_provider: "kokoro",
  tts_voice: "af_bella",
  tts_speed: 1,
  tts_response_format: "mp3",
  tts_normalize: true,
  resolution: "1080x1920",
  transition: "fade",
  image_style: "realistic",
  word_count: 400,
  scene_count: 5,
  scene_narration_style: "balanced",
  subtitle_enabled: true,
  subtitle_source: "transcription",
  generate_subtitles: true,
  transcription_provider: "openai",
  transcription_language: "en",
  inter_scene_pause_ms: 600,
  transition_overlap_ms: 250,
  use_production_storyboard: true,
  match_scenes_to_audio: true,
  visual_continuity: "",
  video_style: {
    ken_burns_enabled: true,
    ken_burns_zoom_percent: 2.5,
    ken_burns_motion: "auto",
    breathing_enabled: false,
    breathing_amplitude: 1.5,
    breathing_speed: 0.25,
    film_grain_enabled: false,
    film_grain_intensity: 0.05,
    vignette_enabled: true,
    vignette_intensity: 0.15,
    lut_enabled: false,
    lut_path: null,
    default_transition: "fade",
    transition_duration_sec: 0.3,
    scene_duration_min: 2,
    scene_duration_max: 4,
  },
  subtitles: {
    font_family: "Arial",
    font_size: 48,
    position: "bottom",
    background_opacity: 0.65,
    text_color: "#FFFFFF",
    shadow_enabled: true,
    shadow_strength: 0.85,
    safe_zone_enabled: true,
    safe_zone_platform: "tiktok",
    safe_zone_config: null,
    words_per_group: 4,
    word_pop_enabled: false,
  },
  audio: {
    music_volume: 0.3,
    ducking_enabled: true,
    ducking_amount: -12,
    voice_provider: "kokoro",
    voice_id: "af_bella",
    speed: 1,
    response_format: "mp3",
    normalize: true,
  },
};

interface SettingsStore {
  providers: {
    llm: ProviderStatus[];
    image: ProviderStatus[];
    tts: ProviderStatus[];
    video: ProviderStatus[];
  };
  transitions: Transition[];
  resolutions: Resolution[];
  voices: Voice[];
  defaults: AppDefaults;
  hydrated: boolean;
  setProviders: (p: any) => void;
  setTransitions: (t: Transition[]) => void;
  setResolutions: (r: Resolution[]) => void;
  setVoices: (v: Voice[]) => void;
  setHydrated: (hydrated: boolean) => void;
  setDefaults: (d: Partial<AppDefaults>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  providers: { llm: [], image: [], tts: [], video: [] },
  transitions: [],
  resolutions: [],
  voices: [],
  defaults: DEFAULT_APP_DEFAULTS,
  hydrated: false,
  setProviders: (providers) => set({ providers }),
  setTransitions: (transitions) => set({ transitions }),
  setResolutions: (resolutions) => set({ resolutions }),
  setVoices: (voices) => set({ voices }),
  setHydrated: (hydrated) => set({ hydrated }),
  setDefaults: (d) =>
    set((s) => ({
      hydrated: true,
      defaults: { ...s.defaults, ...d },
    })),
}));
