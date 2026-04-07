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
import { wsErrorMessage } from "@/lib/job-ws";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const updateJobFromWs = useProjectStore((s) => s.updateJobFromWs);
  const setProviders = useSettingsStore((s) => s.setProviders);
  const setTransitions = useSettingsStore((s) => s.setTransitions);
  const setResolutions = useSettingsStore((s) => s.setResolutions);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const setHydrated = useSettingsStore((s) => s.setHydrated);
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
        notify.success(`${msg.job_type.replace(/_/g, " ")} is done.`);
        scheduleCoalescedRefresh();
      } else if (msg.type === "error") {
        notify.error(wsErrorMessage(msg));
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
        tts_provider: s.default_tts_provider ?? "kokoro",
        tts_voice: s.default_tts_voice ?? "af_bella",
        tts_speed: s.default_tts_speed ?? 1,
        tts_response_format: s.default_tts_response_format ?? "mp3",
        tts_normalize: s.default_tts_normalize ?? true,
        resolution: s.default_resolution ?? "1080x1920",
        transition: s.default_transition ?? "fade",
        image_style: s.default_image_style ?? "realistic",
        word_count: s.default_word_count ?? 400,
        scene_count: s.default_scene_count ?? 5,
        scene_narration_style: s.default_scene_narration_style ?? "balanced",
        subtitle_enabled: s.default_subtitle_enabled ?? true,
        subtitle_source: s.default_subtitle_source ?? "transcription",
        generate_subtitles: s.default_generate_subtitles ?? true,
        transcription_provider: s.default_transcription_provider ?? "openai",
        transcription_language: s.default_transcription_language ?? "en",
        inter_scene_pause_ms: s.default_inter_scene_pause_ms ?? 600,
        transition_overlap_ms: s.default_transition_overlap_ms ?? 250,
        use_production_storyboard: s.default_use_production_storyboard ?? true,
        match_scenes_to_audio: s.default_match_scenes_to_audio ?? true,
        visual_continuity: s.default_visual_continuity ?? "",
        ...(s.video_style ? { video_style: s.video_style } : {}),
        ...(s.subtitles ? { subtitles: s.subtitles } : {}),
        ...(s.audio ? { audio: s.audio } : {}),
      });
    }).catch(() => {
      setHydrated(true);
    });
  }, [setProviders, setTransitions, setResolutions, setDefaults, setHydrated]);

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
