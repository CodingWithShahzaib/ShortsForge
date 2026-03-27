"use client";

import { useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { api } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/components/confirm-dialog-host";
import { notify } from "@/lib/notify";
import { QueryProvider } from "@/providers/query-provider";
import { AppAmbientBackground } from "@/components/layout/AppAmbientBackground";
import { VideoPreviewModalHost } from "@/components/video/video-preview-modal-host";
import type { WsMessage } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const updateJobFromWs = useProjectStore((s) => s.updateJobFromWs);
  const setProviders = useSettingsStore((s) => s.setProviders);
  const setTransitions = useSettingsStore((s) => s.setTransitions);
  const setResolutions = useSettingsStore((s) => s.setResolutions);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const queryClient = useQueryClient();
  const refreshTimeoutRef = useRef<number | null>(null);

  const scheduleCoalescedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary }).catch(() => {});
      refreshTimeoutRef.current = null;
    }, 1000);
  }, [queryClient]);
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      updateJobFromWs(msg);
      if (msg.type === "completed") {
        notify.success(`${msg.job_type.replace(/_/g, " ")} completed!`);
        scheduleCoalescedRefresh();
      } else if (msg.type === "error") {
        notify.error(msg.error || "Job failed");
        scheduleCoalescedRefresh();
      }
    },
    [updateJobFromWs, scheduleCoalescedRefresh]
  );

  useWebSocket(handleWsMessage);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) window.clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    api.listProviders().then(setProviders).catch(() => {});
    api.listTransitions().then(setTransitions).catch(() => {});
    api.listResolutions().then(setResolutions).catch(() => {});
    api.getSettings().then((s) => {
      setDefaults({
        llm_provider: s.default_llm_provider ?? "openai",
        llm_model: s.default_llm_model ?? "gpt-4o-mini",
        image_provider: s.default_image_provider ?? "replicate",
        tts_provider: s.default_tts_provider ?? "edge",
        tts_voice: s.default_tts_voice ?? "en-US-ChristopherNeural",
        resolution: s.default_resolution ?? "1080x1920",
        transition: s.default_transition ?? "fade",
        image_style: s.default_image_style ?? "realistic",
        word_count: s.default_word_count ?? 400,
        scene_count: s.default_scene_count ?? 5,
      });
    }).catch(() => {});
  }, [setProviders, setTransitions, setResolutions, setDefaults]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppAmbientBackground />
        <main className="relative z-10 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto p-6">{children}</main>
        <VideoPreviewModalHost />
      </div>
      <Toaster />
      <ConfirmDialogHost />
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </QueryProvider>
  );
}
