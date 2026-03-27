import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type NotificationPrefsState = {
  /** User wants desktop notifications when tab is in background (still requires browser permission). */
  desktopNotifyEnabled: boolean;
  setDesktopNotifyEnabled: (v: boolean) => void;
};

export const useNotificationPrefsStore = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      desktopNotifyEnabled: false,
      setDesktopNotifyEnabled: (desktopNotifyEnabled) => set({ desktopNotifyEnabled }),
    }),
    {
      name: "shortsforge-notification-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function isDesktopNotifyWanted(): boolean {
  if (typeof window === "undefined") return false;
  return useNotificationPrefsStore.getState().desktopNotifyEnabled;
}
