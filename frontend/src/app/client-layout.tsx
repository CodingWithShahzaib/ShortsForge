"use client";

import { useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { api } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import IsoLevelWarp from "@/components/ui/isometric-wave-grid-background";
import type { WsMessage } from "@/lib/types";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const updateJobFromWs = useProjectStore((s) => s.updateJobFromWs);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setJobs = useProjectStore((s) => s.setJobs);
  const setProviders = useSettingsStore((s) => s.setProviders);
  const setTransitions = useSettingsStore((s) => s.setTransitions);
  const setResolutions = useSettingsStore((s) => s.setResolutions);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      updateJobFromWs(msg);
      if (msg.type === "completed") {
        toast.success(`${msg.job_type.replace(/_/g, " ")} completed!`);
        api.listProjects({ limit: 100 }).then(setProjects).catch(() => {});
        api.listJobs({ limit: 100 }).then(setJobs).catch(() => {});
      } else if (msg.type === "error") {
        toast.error(msg.error || "Job failed");
        api.listProjects({ limit: 100 }).then(setProjects).catch(() => {});
        api.listJobs({ limit: 100 }).then(setJobs).catch(() => {});
      }
    },
    [updateJobFromWs, setProjects, setJobs]
  );

  useWebSocket(handleWsMessage);

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
        video_provider: s.default_video_provider ?? "sora",
        video_model: s.default_video_model ?? "sora-2",
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
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <IsoLevelWarp
          color="6, 182, 212"
          density={40}
          speed={0.04}
          className="fixed top-14 left-64 right-0 bottom-0 opacity-100 dark:opacity-90 -z-10"
        />
        <Header />
        <main className="flex-1 overflow-y-auto p-6 min-w-0 w-full relative z-0">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
