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
  resolution: string;
  transition: string;
  image_style: string;
  word_count: number;
  scene_count: number;
  scene_narration_style: "short" | "balanced" | "long";
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
  tts_provider: "edge",
  tts_voice: "en-US-ChristopherNeural",
  resolution: "1080x1920",
  transition: "fade",
  image_style: "realistic",
  word_count: 400,
  scene_count: 5,
  scene_narration_style: "balanced",
  inter_scene_pause_ms: 600,
  transition_overlap_ms: 250,
  use_production_storyboard: true,
  match_scenes_to_audio: true,
  visual_continuity: "",
  video_style: {
    ken_burns_enabled: true,
    ken_burns_zoom_percent: 2.5,
    ken_burns_motion: "auto",
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
    voice_provider: "edge",
    voice_id: "en-US-ChristopherNeural",
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
  setProviders: (p: any) => void;
  setTransitions: (t: Transition[]) => void;
  setResolutions: (r: Resolution[]) => void;
  setVoices: (v: Voice[]) => void;
  setDefaults: (d: Partial<AppDefaults>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  providers: { llm: [], image: [], tts: [], video: [] },
  transitions: [],
  resolutions: [],
  voices: [],
  defaults: DEFAULT_APP_DEFAULTS,
  setProviders: (providers) => set({ providers }),
  setTransitions: (transitions) => set({ transitions }),
  setResolutions: (resolutions) => set({ resolutions }),
  setVoices: (voices) => set({ voices }),
  setDefaults: (d) =>
    set((s) => ({
      defaults: { ...s.defaults, ...d },
    })),
}));
