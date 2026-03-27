import { create } from "zustand";
import type { ProviderStatus, Transition, Resolution, Voice } from "@/lib/types";

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
