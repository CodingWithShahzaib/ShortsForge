"use client";

import { useState, useEffect } from "react";
import { Settings, Key, Save, CheckCircle, AlertCircle, Database, Activity, Sparkles, Video, Youtube, ExternalLink, Unlink, Bell } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, getYoutubeAvatarUrl, type YouTubeChannelsStatus, type YouTubeChannelSummary } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { appConfirm } from "@/stores/confirmDialogStore";
import { notify } from "@/lib/notify";
import { useNotificationPrefsStore } from "@/stores/notificationPrefsStore";
import {
  SCENE_NARRATION_STYLE_IDS,
  SUBTITLE_SOURCES,
  TRANSCRIPTION_PROVIDERS,
} from "@/app/generate/schema";

type SceneNarrationStyle = (typeof SCENE_NARRATION_STYLE_IDS)[number];
type SubtitleSource = (typeof SUBTITLE_SOURCES)[number];
type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];

const TRANSCRIPTION_LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

function toSceneNarrationStyle(value: string): SceneNarrationStyle {
  return (SCENE_NARRATION_STYLE_IDS as readonly string[]).includes(value)
    ? (value as SceneNarrationStyle)
    : "balanced";
}

function toSubtitleSource(value: string): SubtitleSource {
  return (SUBTITLE_SOURCES as readonly string[]).includes(value)
    ? (value as SubtitleSource)
    : "llm";
}

function toTranscriptionProvider(value: string): TranscriptionProvider {
  return (TRANSCRIPTION_PROVIDERS as readonly string[]).includes(value)
    ? (value as TranscriptionProvider)
    : "openai";
}

function toTranscriptionLanguage(value: string): string {
  const trimmed = value.trim();
  return TRANSCRIPTION_LANGUAGE_PATTERN.test(trimmed) ? trimmed : "en";
}

export default function SettingsPage() {
  const desktopNotifyEnabled = useNotificationPrefsStore((s) => s.desktopNotifyEnabled);
  const setDesktopNotifyEnabled = useNotificationPrefsStore((s) => s.setDesktopNotifyEnabled);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission | "unsupported">("default");

  const providers = useSettingsStore((s) => s.providers);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const setProviders = useSettingsStore((s) => s.setProviders);
  const setDefaults = useSettingsStore((s) => s.setDefaults);
  const [form, setForm] = useState({
    openai_api_key: "",
    groq_api_key: "",
    openrouter_api_key: "",
    replicate_api_key: "",
    fal_api_key: "",
    together_api_key: "",
    runware_api_key: "",
    default_llm_provider: "openai",
    default_llm_model: "gpt-4o-mini",
    default_image_provider: "replicate",
    default_tts_provider: "kokoro",
    default_tts_voice: "af_bella",
    default_tts_speed: 1,
    default_tts_response_format: "mp3",
    default_tts_normalize: true,
    default_resolution: "1080x1920",
    default_transition: "fade",
    default_image_style: "realistic",
    default_word_count: 400,
    default_scene_count: 5,
    default_scene_narration_style: "balanced",
    default_subtitle_enabled: true,
    default_subtitle_source: "transcription",
    default_generate_subtitles: true,
    default_transcription_provider: "openai",
    default_transcription_language: "en",
    default_inter_scene_pause_ms: 600,
    default_transition_overlap_ms: 250,
    default_use_production_storyboard: true,
    default_match_scenes_to_audio: true,
    default_visual_continuity: "",
    default_ken_burns_enabled: true,
    default_ken_burns_zoom_percent: 2.5,
    default_ken_burns_motion: "auto",
    default_breathing_enabled: false,
    default_breathing_amplitude: 1.5,
    default_breathing_speed: 0.25,
    default_film_grain_enabled: false,
    default_film_grain_intensity: 0.05,
    default_vignette_enabled: true,
    default_vignette_intensity: 0.15,
    default_transition_duration_sec: 0.3,
    default_scene_duration_min: 2,
    default_scene_duration_max: 4,
    default_subtitle_font: "Arial",
    default_subtitle_size: 48,
    default_subtitle_color: "#FFFFFF",
    default_subtitle_position: "bottom",
    default_subtitle_words_per_group: 4,
    default_subtitle_background_opacity: 0.65,
    default_subtitle_shadow_enabled: true,
    default_subtitle_shadow_strength: 0.85,
    default_subtitle_safe_zone_enabled: true,
    default_subtitle_safe_zone_platform: "tiktok",
    default_word_pop_enabled: false,
    default_music_volume: 0.3,
    default_ducking_enabled: true,
    default_ducking_amount: -12,
    ffmpeg_path: "ffmpeg",
    redis_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [redisStatus, setRedisStatus] = useState<any>(null);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModelsLoading, setLlmModelsLoading] = useState(false);
  const [ytStatus, setYtStatus] = useState<YouTubeChannelsStatus | null>(null);
  const [ytConnecting, setYtConnecting] = useState(false);
  const [ytDisconnecting, setYtDisconnecting] = useState<string | null>(null);
  const [ytDefaulting, setYtDefaulting] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"account" | "providers" | "generation" | "infrastructure">("account");

  useEffect(() => {
    if (typeof Notification === "undefined") setNotifyPerm("unsupported");
    else setNotifyPerm(Notification.permission);

    api.getSettings().then((s) => setForm((f) => ({
      ...f,
      ...s,
      default_tts_provider: "kokoro",
      default_tts_voice: s.default_tts_voice || "af_bella",
      default_tts_speed: s.default_tts_speed ?? 1,
      default_tts_response_format: s.default_tts_response_format || "mp3",
      default_tts_normalize: s.default_tts_normalize ?? true,
      default_subtitle_enabled: s.default_subtitle_enabled ?? true,
      default_subtitle_source: s.default_subtitle_source || "transcription",
      default_generate_subtitles: s.default_generate_subtitles ?? true,
      default_transcription_provider: s.default_transcription_provider || "openai",
      default_transcription_language: s.default_transcription_language || "en",
    }))).catch(() => {});
    api.redisStatus().then(setRedisStatus).catch(() => {});
    api.youtubeChannels().then(setYtStatus).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube") === "connected") {
      api.youtubeChannels().then(setYtStatus).catch(() => {});
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      if (typeof Notification !== "undefined") setNotifyPerm(Notification.permission);
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "denied" && desktopNotifyEnabled) {
      setDesktopNotifyEnabled(false);
    }
  }, [desktopNotifyEnabled, setDesktopNotifyEnabled]);

  const handleDesktopNotifyToggle = async () => {
    if (desktopNotifyEnabled) {
      setDesktopNotifyEnabled(false);
      return;
    }
    if (typeof Notification === "undefined") {
      notify.warning("This browser does not support notifications.");
      return;
    }
    if (Notification.permission === "denied") {
      setNotifyPerm("denied");
      notify.error("Notifications are blocked. Allow them in your browser’s site settings for this app.");
      return;
    }
    if (Notification.permission === "granted") {
      setDesktopNotifyEnabled(true);
      setNotifyPerm("granted");
      return;
    }
    const next = await Notification.requestPermission();
    setNotifyPerm(next);
    if (next === "granted") {
      setDesktopNotifyEnabled(true);
      notify.success("Background notifications turned on");
    } else if (next === "denied") {
      notify.error("Notifications were blocked.");
    }
  };

  useEffect(() => {
    setLlmModelsLoading(true);
    api
      .listLlmModels(form.default_llm_provider)
      .then((r) => setLlmModels(r.models || []))
      .catch(() => setLlmModels([]))
      .finally(() => setLlmModelsLoading(false));
  }, [form.default_llm_provider]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, string | null> = {};
      Object.entries(form).forEach(([key, value]) => {
        if (value == null) return;
        if (typeof value === "object") return;
        if (typeof value === "string") {
          updates[key] = value === "" ? null : value;
          return;
        }
        updates[key] = String(value);
      });
      updates.default_tts_provider = "kokoro";
      await api.updateSettings(updates);
      const p = await api.listProviders();
      setProviders(p);
      setDefaults({
        llm_provider: form.default_llm_provider,
        llm_model: form.default_llm_model || "gpt-4o-mini",
        image_provider: form.default_image_provider,
        tts_provider: "kokoro",
        tts_voice: form.default_tts_voice || "af_bella",
        tts_speed: Number(form.default_tts_speed) || 1,
        tts_response_format: (form.default_tts_response_format as any) || "mp3",
        tts_normalize: Boolean(form.default_tts_normalize),
        resolution: form.default_resolution || "1080x1920",
        transition: form.default_transition || "fade",
        image_style: form.default_image_style || "realistic",
        word_count: Number(form.default_word_count) || 400,
        scene_count: Number(form.default_scene_count) || 5,
        scene_narration_style: toSceneNarrationStyle(form.default_scene_narration_style),
        subtitle_enabled: Boolean(form.default_subtitle_enabled),
        subtitle_source: toSubtitleSource(form.default_subtitle_source),
        generate_subtitles: Boolean(form.default_generate_subtitles),
        transcription_provider: toTranscriptionProvider(form.default_transcription_provider),
        transcription_language: toTranscriptionLanguage(form.default_transcription_language),
        inter_scene_pause_ms: Number(form.default_inter_scene_pause_ms) || 600,
        transition_overlap_ms: Number(form.default_transition_overlap_ms) || 250,
        use_production_storyboard: Boolean(form.default_use_production_storyboard),
        match_scenes_to_audio: Boolean(form.default_match_scenes_to_audio),
        visual_continuity: form.default_visual_continuity || "",
        video_style: {
          ken_burns_enabled: Boolean(form.default_ken_burns_enabled),
          ken_burns_zoom_percent: Number(form.default_ken_burns_zoom_percent) || 2.5,
          ken_burns_motion: (form.default_ken_burns_motion as any) || "auto",
          breathing_enabled: Boolean(form.default_breathing_enabled),
          breathing_amplitude: Number(form.default_breathing_amplitude) || 1.5,
          breathing_speed: Number(form.default_breathing_speed) || 0.25,
          film_grain_enabled: Boolean(form.default_film_grain_enabled),
          film_grain_intensity: Number(form.default_film_grain_intensity) || 0.05,
          vignette_enabled: Boolean(form.default_vignette_enabled),
          vignette_intensity: Number(form.default_vignette_intensity) || 0.15,
          lut_enabled: false,
          lut_path: null,
          default_transition: form.default_transition || "fade",
          transition_duration_sec: Number(form.default_transition_duration_sec) || 0.3,
          scene_duration_min: Number(form.default_scene_duration_min) || 2,
          scene_duration_max: Number(form.default_scene_duration_max) || 4,
        },
        subtitles: {
          font_family: form.default_subtitle_font || "Arial",
          font_size: Number(form.default_subtitle_size) || 48,
          position: (form.default_subtitle_position as any) || "bottom",
          background_opacity: Number(form.default_subtitle_background_opacity) || 0.65,
          text_color: form.default_subtitle_color || "#FFFFFF",
          shadow_enabled: Boolean(form.default_subtitle_shadow_enabled),
          shadow_strength: Number(form.default_subtitle_shadow_strength) || 0.85,
          safe_zone_enabled: Boolean(form.default_subtitle_safe_zone_enabled),
          safe_zone_platform: (form.default_subtitle_safe_zone_platform as any) || "tiktok",
          words_per_group: Number(form.default_subtitle_words_per_group) || 4,
          word_pop_enabled: Boolean(form.default_word_pop_enabled),
        },
        audio: {
          music_volume: Number(form.default_music_volume) || 0.3,
          ducking_enabled: Boolean(form.default_ducking_enabled),
          ducking_amount: Number(form.default_ducking_amount) || -12,
          voice_provider: "kokoro",
          voice_id: form.default_tts_voice || "af_bella",
          speed: Number(form.default_tts_speed) || 1,
          response_format: (form.default_tts_response_format as any) || "mp3",
          normalize: Boolean(form.default_tts_normalize),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      api.redisStatus().then(setRedisStatus).catch(() => {});
    } catch (err: any) {
      notify.error(err?.message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const handleYoutubeConnect = async () => {
    if (!ytStatus?.oauth_ready) {
      notify.error("Connect YouTube by adding YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in server .env, then restart the backend.");
      return;
    }
    setYtConnecting(true);
    try {
      const { url } = await api.youtubeAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      notify.error(err?.message || "Failed to start YouTube connection");
      setYtConnecting(false);
    }
  };

  const handleYoutubeDisconnect = async (channel: YouTubeChannelSummary) => {
    const ok = await appConfirm({
      title: "Disconnect YouTube?",
      description: `Disconnect ${channel.channel_title || "this channel"} from ShortsForge.`,
      confirmLabel: "Disconnect",
      variant: "destructive",
    });
    if (!ok) return;
    setYtDisconnecting(channel.channel_id);
    try {
      await api.youtubeDisconnect(channel.channel_id);
      const next = await api.youtubeChannels();
      setYtStatus(next);
      notify.success("YouTube disconnected");
    } catch (err: any) {
      notify.error(err?.message || "Failed to disconnect");
    } finally {
      setYtDisconnecting(null);
    }
  };

  const handleYoutubeSetDefault = async (channelId: string) => {
    setYtDefaulting(channelId);
    try {
      await api.youtubeSetDefault(channelId);
      const next = await api.youtubeChannels();
      setYtStatus(next);
      notify.success("Default channel updated");
    } catch (err: any) {
      notify.error(err?.message || "Failed to set default channel");
    } finally {
      setYtDefaulting(null);
    }
  };

  const apiKeys = [
    { key: "openai_api_key", label: "OpenAI API Key", desc: "Script AI, speech-to-text, and images" },
    { key: "groq_api_key", label: "Groq API Key", desc: "Fast script AI models" },
    { key: "openrouter_api_key", label: "OpenRouter API Key", desc: "Access to multiple AI models" },
    { key: "replicate_api_key", label: "Replicate API Key", desc: "Image generation" },
    { key: "fal_api_key", label: "FAL AI API Key", desc: "Image generation" },
    { key: "together_api_key", label: "Together AI API Key", desc: "Image generation (free tier available)" },
    { key: "runware_api_key", label: "Runware API Key", desc: "Image generation" },
  ];

  const ytChannels = ytStatus?.channels || [];
  const ytDefaultId =
    ytStatus?.default_channel_id ||
    ytChannels.find((c) => c.is_default)?.channel_id ||
    null;
  const providerList = [...providers.llm, ...providers.image, ...providers.tts, ...providers.video];
  const providerConfiguredCount = providerList.filter((p) => p.configured).length;
  const providerTotal = providerList.length;
  const sectionOptions = [
    { id: "account" as const, label: "Account", description: "Notifications and YouTube connections", icon: <Bell className="h-4 w-4" /> },
    { id: "providers" as const, label: "Providers", description: "API keys and provider status", icon: <Key className="h-4 w-4" /> },
    { id: "generation" as const, label: "Creation", description: "Default script, image, video, and voice settings", icon: <Sparkles className="h-4 w-4" /> },
    { id: "infrastructure" as const, label: "Advanced", description: "Queue and local processing setup", icon: <Database className="h-4 w-4" /> },
  ];
  const activeSectionMeta = sectionOptions.find((section) => section.id === activeSection);

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Settings className="h-8 w-8 text-cyan-500" /> Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure account defaults, provider access, and advanced setup for new projects</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : saved ? <><CheckCircle className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save</>}
        </Button>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        <span className="font-medium text-slate-900 dark:text-slate-100">Scope:</span> these are account defaults for new projects. Once a project exists, Studio owns project overrides and scene-level edits.
      </div>

      <Card>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Providers</p>
            <p className="text-lg font-semibold">{providerConfiguredCount}/{providerTotal || 0} configured</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Keys drive availability</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Queue</p>
            <p className="text-lg font-semibold">
              {redisStatus?.status === "connected" ? "Connected" : redisStatus?.enabled ? "Error" : "Local mode"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{redisStatus?.enabled ? "Persistent queue" : "Temporary queue"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">YouTube</p>
            <p className="text-lg font-semibold">{ytChannels.length ? `${ytChannels.length} connected` : "Not connected"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Upload-ready channels</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Notifications</p>
            <p className="text-lg font-semibold">{desktopNotifyEnabled ? "Enabled" : "Off"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {notifyPerm === "granted" ? "Permission granted" : notifyPerm === "denied" ? "Permission blocked" : "Permission pending"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {sectionOptions.map((section) => {
            const selected = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selected
                    ? "border-cyan-500 bg-cyan-500 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            );
          })}
        </div>
        {activeSectionMeta && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{activeSectionMeta.description}</p>
        )}
      </div>

      {activeSection === "account" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-cyan-500" /> Background notifications
              </CardTitle>
              <CardDescription>
                When ShortsForge is open in a background tab, show system notifications for job completions and errors (after you allow permission).
                While this tab is focused, you will only see in-app toasts and the bell inbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notifyPerm === "unsupported" ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Desktop notifications are not supported in this environment.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4">
                    <div>
                      <p className="text-sm font-medium">Notify when the tab is in the background</p>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Browser permission:{" "}
                        <Badge variant={notifyPerm === "granted" ? "default" : notifyPerm === "denied" ? "destructive" : "secondary"}>
                          {notifyPerm}
                        </Badge>
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant={desktopNotifyEnabled ? "default" : "outline"}
                      onClick={handleDesktopNotifyToggle}
                    >
                      {desktopNotifyEnabled ? "Turn off" : "Turn on"}
                    </Button>
                  </div>
                  {notifyPerm === "denied" && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Unblock notifications for this site in your browser settings, then try again.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Youtube className="h-5 w-5 text-red-500" /> YouTube Channels</CardTitle>
              <CardDescription>
                {ytStatus?.connected
                  ? `${ytChannels.length} channel${ytChannels.length === 1 ? "" : "s"} connected`
                  : "Connect one or more YouTube channels to upload videos directly from ShortsForge"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ytStatus && !ytStatus.oauth_ready && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                  <p className="font-medium">OAuth client not configured</p>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                    Add <code className="rounded bg-amber-100 dark:bg-amber-950/50 px-1">YOUTUBE_CLIENT_ID</code>,{" "}
                    <code className="rounded bg-amber-100 dark:bg-amber-950/50 px-1">YOUTUBE_CLIENT_SECRET</code>, and{" "}
                    <code className="rounded bg-amber-100 dark:bg-amber-950/50 px-1">YOUTUBE_TOKEN_KEY</code> to your server{" "}
                    <code className="rounded bg-amber-100 dark:bg-amber-950/50 px-1">.env</code>, then restart the backend.
                  </p>
                </div>
              )}

              {ytStatus?.connected ? (
                <div className="space-y-3">
                  {ytChannels.map((channel) => (
                    <div key={channel.channel_id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/70 dark:border-zinc-700/80 bg-slate-50/60 dark:bg-zinc-900/40">
                      <div className="flex items-center gap-3 min-w-0">
                        {channel.channel_thumbnail ? (
                          <img src={getYoutubeAvatarUrl(channel.channel_thumbnail)} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                            <Youtube className="h-5 w-5 text-red-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{channel.channel_title || "YouTube Channel"}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Channel ID: {channel.channel_id}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {channel.channel_id === ytDefaultId ? (
                          <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" /> Default</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleYoutubeSetDefault(channel.channel_id)}
                            disabled={ytDefaulting === channel.channel_id}
                          >
                            {ytDefaulting === channel.channel_id ? "Setting..." : "Set default"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleYoutubeDisconnect(channel)}
                          disabled={ytDisconnecting === channel.channel_id}
                        >
                          <Unlink className="h-3.5 w-3.5 mr-1" /> {ytDisconnecting === channel.channel_id ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  No channels connected yet.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleYoutubeConnect} disabled={ytConnecting || !ytStatus?.oauth_ready}>
                  {ytConnecting ? (
                    <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
                  ) : (
                    <><Youtube className="h-4 w-4 mr-1" /> {ytStatus?.connected ? "Connect another channel" : "Connect YouTube Channel"}</>
                  )}
                </Button>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Google Cloud credentials
                </a>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create an OAuth 2.0 Client ID (Web application). Add{" "}
                <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">http://localhost:8000/api/youtube/callback</code> as an authorized redirect URI.
                Enable the YouTube Data API v3. Put the client ID, secret, and token key in <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">.env</code> on the server (see <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">.env.example</code>).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "providers" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> API keys</CardTitle>
              <CardDescription>Your keys are saved in the server .env file</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {apiKeys.map((item) => (
                <div key={item.key}>
                  <label className="text-sm font-medium mb-1 block">{item.label}</label>
                  <Input type="password" placeholder={item.desc} value={(form as any)[item.key] || ""} onChange={(e) => update(item.key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Provider status</CardTitle>
              <CardDescription>See which services are set up and ready</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {providerList.map((p) => (
                  <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/70 border border-slate-200/80 dark:border-zinc-700">
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant={p.configured ? "default" : "destructive"}>
                      {p.configured ? <><CheckCircle className="h-3 w-3 mr-1" /> Active</> : <><AlertCircle className="h-3 w-3 mr-1" /> Not Set</>}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "generation" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Creation defaults</CardTitle>
              <CardDescription>Default script, image, video, and voice settings for your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Default Script Length (words)</label>
                  <Input
                    type="number"
                    min={150}
                    max={800}
                    value={form.default_word_count ?? 400}
                    onChange={(e) => update("default_word_count", e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Used when generating from concept</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Default Scene Count</label>
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={form.default_scene_count ?? 5}
                    onChange={(e) => update("default_scene_count", e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scenes per video when generating from concept</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Default narration per scene</label>
                  <Select
                    value={form.default_scene_narration_style}
                    onValueChange={(value) => update("default_scene_narration_style", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Narration density" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="long">Long</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Controls how much spoken copy each generated scene should carry.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 space-y-3">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.default_subtitle_enabled)}
                    onChange={(e) => update("default_subtitle_enabled", e.target.checked)}
                  />
                  <span>
                    Enable subtitles by default
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Applied automatically for new projects created from Generate.
                    </span>
                  </span>
                </label>

                {Boolean(form.default_subtitle_enabled) ? (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Default caption source</label>
                      <Select
                        value={String(form.default_subtitle_source || "llm")}
                        onValueChange={(value) => update("default_subtitle_source", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Caption source" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBTITLE_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source === "llm"
                                ? "AI-generated (per scene)"
                                : "Speech-to-text from narration audio"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {form.default_subtitle_source === "llm" ? (
                      <label className="flex items-start gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={Boolean(form.default_generate_subtitles)}
                          onChange={(e) => update("default_generate_subtitles", e.target.checked)}
                        />
                        <span>
                          Generate subtitle text with AI
                          <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                            Disable this if your scripts already include exact subtitle copy.
                          </span>
                        </span>
                      </label>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium mb-1 block">Speech-to-text engine</label>
                          <Select
                            value={String(form.default_transcription_provider || "openai")}
                            onValueChange={(value) => update("default_transcription_provider", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Transcription provider" />
                            </SelectTrigger>
                            <SelectContent>
                              {TRANSCRIPTION_PROVIDERS.map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  {provider === "openai" ? "OpenAI (Whisper)" : "Groq"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">Language code</label>
                          <Input
                            value={String(form.default_transcription_language || "en")}
                            onChange={(e) => update("default_transcription_language", e.target.value)}
                            placeholder="en or en-US"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Use a code like <code>en</code> or <code>en-US</code>.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Default pause between scenes (ms)</label>
                  <Input
                    type="number"
                    min={0}
                    max={1200}
                    step={50}
                    value={form.default_inter_scene_pause_ms ?? 600}
                    onChange={(e) => update("default_inter_scene_pause_ms", e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Adds a short pause between scenes</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Default transition overlap (ms)</label>
                  <Input
                    type="number"
                    min={0}
                    max={800}
                    step={50}
                    value={form.default_transition_overlap_ms ?? 250}
                    onChange={(e) => update("default_transition_overlap_ms", e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">How long scene transitions blend</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.default_use_production_storyboard)}
                    onChange={(e) => update("default_use_production_storyboard", e.target.checked)}
                  />
                  <span>
                    Default director-style scenes
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Adds camera and lighting guidance by default.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.default_match_scenes_to_audio)}
                    onChange={(e) => update("default_match_scenes_to_audio", e.target.checked)}
                  />
                  <span>
                    Default sync scenes to narration
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Keeps scene durations aligned to voiceover.
                    </span>
                  </span>
                </label>
              </div>
              <div>
                    <label className="text-sm font-medium mb-1 block">Default visual consistency</label>
                <Input
                  value={form.default_visual_continuity ?? ""}
                  onChange={(e) => update("default_visual_continuity", e.target.value)}
                  placeholder="e.g. teal-orange palette, rain, solitary figure"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Keeps a shared look and mood across scenes.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Default script AI</label>
                  <Select value={form.default_llm_provider} onValueChange={(value) => update("default_llm_provider", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">AI model</label>
                  <Select value={form.default_llm_model} onValueChange={(value) => update("default_llm_model", value)} disabled={llmModelsLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={llmModelsLoading ? "Loading models…" : "Model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const fallback = providers.llm.find((p) => p.name === form.default_llm_provider)?.models || ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"];
                        const list = llmModels.length ? llmModels : fallback;
                        const options = list.includes(form.default_llm_model) ? list : [form.default_llm_model, ...list];
                        return options.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>);
                      })()}
                    </SelectContent>
                  </Select>
                  {llmModelsLoading && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Loading available models…</p>}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Default image engine</label>
                <Select value={form.default_image_provider} onValueChange={(value) => update("default_image_provider", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replicate">Replicate</SelectItem>
                    <SelectItem value="fal">FAL AI</SelectItem>
                    <SelectItem value="together">Together AI</SelectItem>
                    <SelectItem value="pollinations">Pollinations (Free)</SelectItem>
                    <SelectItem value="openai_image">OpenAI</SelectItem>
                    <SelectItem value="runware">Runware</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Voice engine</label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
                    Kokoro TTS (Docker)
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Default voice expression</label>
                  <Input placeholder="af_bella or af_bella+af_sky(2)" value={form.default_tts_voice} onChange={(e) => update("default_tts_voice", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Default speech speed</label>
                  <Input
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={form.default_tts_speed ?? 1}
                    onChange={(e) => update("default_tts_speed", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Default audio format</label>
                  <Select
                    value={String(form.default_tts_response_format || "mp3")}
                    onValueChange={(value) => update("default_tts_response_format", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp3">MP3</SelectItem>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="opus">Opus</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                      <SelectItem value="m4a">M4A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-2 pt-7 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(form.default_tts_normalize)}
                    onChange={(e) => update("default_tts_normalize", e.target.checked)}
                  />
                  <span>
                    Normalize text
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Disable this if Kokoro over-corrects names, slang, or punctuation.
                    </span>
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5" /> Video Defaults</CardTitle>
              <CardDescription>Default resolution, transition, and image style for new videos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Resolution</label>
                  <Select value={form.default_resolution} onValueChange={(value) => update("default_resolution", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Resolution" />
                    </SelectTrigger>
                    <SelectContent>
                      {(resolutions.length ? resolutions : [{ id: "1080x1920", name: "1080x1920 (9:16 Portrait)" }, { id: "1920x1080", name: "1920x1080 (16:9 Landscape)" }, { id: "1024x1024", name: "1024x1024 (1:1 Square)" }]).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Transition</label>
                  <Select value={form.default_transition} onValueChange={(value) => update("default_transition", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Transition" />
                    </SelectTrigger>
                    <SelectContent>
                      {(transitions.length ? transitions : [{ id: "fade", name: "Fade" }, { id: "fade_in_fade_out", name: "Fade In / Fade Out" }, { id: "zoom_in_zoom_out", name: "Zoom In / Zoom Out" }, { id: "dissolve", name: "Dissolve" }, { id: "wipeleft", name: "Wipe Left" }]).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Image Style</label>
                <Select value={form.default_image_style} onValueChange={(value) => update("default_image_style", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realistic">Realistic</SelectItem>
                    <SelectItem value="anime">Anime</SelectItem>
                    <SelectItem value="cinematic">Cinematic</SelectItem>
                    <SelectItem value="illustration">Illustration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Video Style</CardTitle>
              <CardDescription>Motion and visual treatment defaults for new projects.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.default_ken_burns_enabled)}
                  onChange={(e) => update("default_ken_burns_enabled", e.target.checked)}
                />
                <span>Enable Ken Burns motion</span>
              </label>
              <div>
                <label className="text-sm font-medium mb-1 block">Ken Burns zoom %</label>
                <Input type="number" min={0} max={8} step={0.1} value={form.default_ken_burns_zoom_percent ?? 2.5} onChange={(e) => update("default_ken_burns_zoom_percent", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Motion style</label>
                <Select value={String(form.default_ken_burns_motion || "auto")} onValueChange={(value) => update("default_ken_burns_motion", value)}>
                  <SelectTrigger><SelectValue placeholder="Motion style" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="zoom_in">Zoom In</SelectItem>
                    <SelectItem value="zoom_out">Zoom Out</SelectItem>
                    <SelectItem value="pan_left">Pan Left</SelectItem>
                    <SelectItem value="pan_right">Pan Right</SelectItem>
                    <SelectItem value="pan_up">Pan Up</SelectItem>
                    <SelectItem value="pan_down">Pan Down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.default_breathing_enabled)}
                  onChange={(e) => update("default_breathing_enabled", e.target.checked)}
                />
                <span>Enable breathing effect</span>
              </label>
              <div>
                <label className="text-sm font-medium mb-1 block">Breathing amplitude %</label>
                <Input type="number" min={0} max={5} step={0.1} value={form.default_breathing_amplitude ?? 1.5} onChange={(e) => update("default_breathing_amplitude", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Breathing speed (Hz)</label>
                <Input type="number" min={0.05} max={1} step={0.05} value={form.default_breathing_speed ?? 0.25} onChange={(e) => update("default_breathing_speed", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Transition duration (sec)</label>
                <Input type="number" min={0} max={2} step={0.1} value={form.default_transition_duration_sec ?? 0.3} onChange={(e) => update("default_transition_duration_sec", e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.default_film_grain_enabled)}
                  onChange={(e) => update("default_film_grain_enabled", e.target.checked)}
                />
                <span>Enable film grain</span>
              </label>
              <div>
                <label className="text-sm font-medium mb-1 block">Film grain intensity</label>
                <Input type="number" min={0} max={0.25} step={0.01} value={form.default_film_grain_intensity ?? 0.05} onChange={(e) => update("default_film_grain_intensity", e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(form.default_vignette_enabled)}
                  onChange={(e) => update("default_vignette_enabled", e.target.checked)}
                />
                <span>Enable vignette</span>
              </label>
              <div>
                <label className="text-sm font-medium mb-1 block">Vignette intensity</label>
                <Input type="number" min={0} max={0.5} step={0.01} value={form.default_vignette_intensity ?? 0.15} onChange={(e) => update("default_vignette_intensity", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audio Defaults</CardTitle>
              <CardDescription>Background music and narration ducking defaults.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Background music volume</label>
                <Input type="number" min={0} max={1} step={0.05} value={form.default_music_volume ?? 0.3} onChange={(e) => update("default_music_volume", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Ducking amount (dB)</label>
                <Input type="number" min={-30} max={-1} step={1} value={form.default_ducking_amount ?? -12} onChange={(e) => update("default_ducking_amount", e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" checked={Boolean(form.default_ducking_enabled)} onChange={(e) => update("default_ducking_enabled", e.target.checked)} />
                <span>Enable ducking during narration</span>
              </label>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "infrastructure" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Queue (advanced)</CardTitle>
              <CardDescription>
                {redisStatus?.status === "connected"
                  ? "Queue service is connected and running reliably"
                  : "Optional: enables persistent queue, crash recovery, and multi-worker support"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Queue URL</label>
                <Input
                  placeholder="redis://localhost:6379/0 (leave blank for local mode)"
                  value={form.redis_url}
                  onChange={(e) => update("redis_url", e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Restart backend after changing this</p>
              </div>
              {redisStatus && (
                <div className="rounded-xl border border-slate-200/80 dark:border-zinc-700 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant={redisStatus.status === "connected" ? "default" : redisStatus.enabled ? "destructive" : "secondary"}>
                      {redisStatus.status === "connected" ? (
                        <><Activity className="h-3 w-3 mr-1" />Connected</>
                      ) : redisStatus.enabled ? (
                        <><AlertCircle className="h-3 w-3 mr-1" />Error</>
                      ) : (
                        "Local mode"
                      )}
                    </Badge>
                  </div>
                  {redisStatus.status === "connected" && (
                    <>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                          <span className="text-slate-500 dark:text-slate-400">Version</span>
                          <span className="font-mono">{redisStatus.version}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                          <span className="text-slate-500 dark:text-slate-400">Memory</span>
                          <span className="font-mono">{redisStatus.used_memory_human}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                          <span className="text-slate-500 dark:text-slate-400">Clients</span>
                          <span className="font-mono">{redisStatus.connected_clients}</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-slate-50/80 dark:bg-zinc-800/70">
                          <span className="text-slate-500 dark:text-slate-400">Uptime</span>
                          <span className="font-mono">{Math.floor((redisStatus.uptime_seconds || 0) / 3600)}h</span>
                        </div>
                      </div>
                      {redisStatus.queue && (
                        <div className="grid gap-3 text-sm sm:grid-cols-3">
                          <div className="text-center p-2 rounded bg-cyan-50 dark:bg-cyan-950/30">
                            <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{redisStatus.queue.pending || 0}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Queued</p>
                          </div>
                          <div className="text-center p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{redisStatus.queue.processing || 0}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Processing</p>
                          </div>
                          <div className="text-center p-2 rounded bg-rose-50 dark:bg-rose-950/30">
                            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{redisStatus.queue.dead_letter || 0}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Failed queue</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {redisStatus.status === "disconnected" && !redisStatus.enabled && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Running in local mode. Tasks will be lost after backend restart.
                      Add a Queue URL above and restart backend for a persistent queue.
                    </p>
                  )}
                  {redisStatus.error && (
                    <p className="text-sm text-red-500">{redisStatus.error}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Advanced tools</CardTitle>
              <CardDescription>FFmpeg path for video processing</CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <label className="text-sm font-medium mb-1 block">FFmpeg Path</label>
                <Input placeholder="ffmpeg" value={form.ffmpeg_path} onChange={(e) => update("ffmpeg_path", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
