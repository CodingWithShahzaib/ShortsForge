import { create } from "zustand";

type VideoPreviewState = {
  open: boolean;
  url: string | null;
  title: string | null;
  openPreview: (url: string, title?: string | null) => void;
  closePreview: () => void;
};

export const useVideoPreviewStore = create<VideoPreviewState>((set) => ({
  open: false,
  url: null,
  title: null,
  openPreview: (url, title) => set({ open: true, url, title: title ?? null }),
  closePreview: () => set({ open: false, url: null, title: null }),
}));
