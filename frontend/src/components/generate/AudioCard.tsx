"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music, Upload, Headphones, Play, Square, Trash2 } from "lucide-react";
import type { GenerateFormValues } from "@/app/generate/schema";
import { useDeleteMusicMutation } from "@/lib/queries/generateCatalog";
import { resolveMediaPlaybackUrl } from "@/lib/api";
import type { Voice } from "@/lib/types";
import { prefersReducedMotion } from "@/lib/micro-interactions";
import { notify } from "@/lib/notify";
import { appConfirm } from "@/stores/confirmDialogStore";

type Provider = { name: string; configured: boolean };

type MusicTrack = { id: string; name: string; path: string; url?: string };

function voiceMetaLabel(voice: Voice) {
  return [voice.locale, voice.gender].filter(Boolean).join(" · ");
}

function extractTrackFilename(value: string) {
  const normalized = value.split("?")[0]?.split("#")[0] ?? value;
  const lastSegment = normalized.split("/").pop() ?? normalized;
  return lastSegment.trim();
}

function getMusicTrackLabel(track: MusicTrack) {
  const rawName = track.name?.trim() || extractTrackFilename(track.path || track.id);
  const decodedName = rawName.replace(/^[a-f0-9]{32}__(.+)$/i, "$1");
  if (/^[a-f0-9]{32}(?:\.[a-z0-9]+)?$/i.test(decodedName)) {
    const extension = decodedName.includes(".") ? decodedName.slice(decodedName.lastIndexOf(".")) : "";
    return `Uploaded track${extension}`;
  }
  return decodedName;
}

function getFallbackMusicLabel(value: string) {
  const filename = extractTrackFilename(value);
  const decodedName = filename.replace(/^[a-f0-9]{32}__(.+)$/i, "$1");
  if (/^[a-f0-9]{32}(?:\.[a-z0-9]+)?$/i.test(decodedName)) {
    const extension = decodedName.includes(".") ? decodedName.slice(decodedName.lastIndexOf(".")) : "";
    return `Uploaded track${extension}`;
  }
  return decodedName || "Selected track";
}

type Props = {
  ttsProviders: Provider[];
  voices: Voice[];
  musicList: MusicTrack[];
  previewingVoice: boolean;
  uploadingMusic: boolean;
  onVoicePreview: () => void;
  onMusicUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export const AudioCard = memo(function AudioCard({
  ttsProviders,
  voices,
  musicList,
  previewingVoice,
  uploadingMusic,
  onVoicePreview,
  onMusicUpload,
}: Props) {
  const {
    control,
    register,
    setValue,
    formState: { errors, touchedFields, submitCount },
  } = useFormContext<GenerateFormValues>();
  const backgroundMusic = useWatch({ control, name: "background_music" });
  const backgroundMusicVolume = useWatch({ control, name: "background_music_volume" });
  const ttsVoice = useWatch({ control, name: "tts_voice" });
  const showError = (name: keyof GenerateFormValues) => !!(submitCount > 0 || touchedFields[name]) && !!errors[name];
  const deleteMusicMut = useDeleteMusicMutation();
  const [musicSelectOpen, setMusicSelectOpen] = useState(false);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [previewingMusic, setPreviewingMusic] = useState(false);
  const [playingMusicSource, setPlayingMusicSource] = useState<string | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);
  const selectedMusicTrack = musicList.find((track) => track.path === backgroundMusic || track.id === backgroundMusic);
  const selectedMusicValue = !backgroundMusic
    ? "none"
    : selectedMusicTrack
      ? selectedMusicTrack.path || selectedMusicTrack.id
      : backgroundMusic;
  const selectedMusicSource = selectedMusicTrack?.path || selectedMusicTrack?.id || backgroundMusic || "";
  const isSelectedMusicPlaying = !!selectedMusicSource && playingMusicSource === selectedMusicSource;
  const missingSelectedMusicLabel = backgroundMusic && !selectedMusicTrack
    ? getFallbackMusicLabel(backgroundMusic)
    : null;
  const activeTtsProvider = ttsProviders.find((provider) => provider.configured)?.name ?? "kokoro";
  const selectedPresetVoice = voices.some((voice) => voice.id === ttsVoice) ? ttsVoice : undefined;

  useEffect(() => {
    if (uploadingMusic) {
      setMusicSelectOpen(false);
    }
  }, [uploadingMusic]);

  useEffect(() => {
    const audio = musicPreviewRef.current;
    if (!audio) return;
    const safeVolume = Number.isFinite(backgroundMusicVolume)
      ? Math.max(0, Math.min(1, backgroundMusicVolume))
      : 0.25;
    audio.volume = safeVolume;
  }, [backgroundMusicVolume]);

  useEffect(() => {
    return () => {
      const audio = musicPreviewRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
      musicPreviewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playingMusicSource) return;
    if (selectedMusicSource && playingMusicSource === selectedMusicSource) return;
    const audio = musicPreviewRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlayingMusicSource(null);
  }, [playingMusicSource, selectedMusicSource]);

  const handleDeleteTrack = async (track: MusicTrack) => {
    const confirmed = await appConfirm({
      title: "Delete audio track?",
      description: `Remove "${getMusicTrackLabel(track)}" from your uploaded audio library? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!confirmed) return;

    const deleteId = track.id || extractTrackFilename(track.path);
    if (!deleteId) {
      notify.error("Could not delete this audio track.");
      return;
    }

    setDeletingTrackId(deleteId);
    try {
      await deleteMusicMut.mutateAsync(deleteId);
      if (backgroundMusic === track.path || backgroundMusic === track.id) {
        setValue("background_music", "", { shouldDirty: true, shouldValidate: true });
      }
      notify.success("Audio deleted");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete audio");
    } finally {
      setDeletingTrackId(null);
    }
  };

  const handleMusicPreview = async () => {
    if (!selectedMusicSource) {
      notify.error("Select a background track to preview.");
      return;
    }

    const existingAudio = musicPreviewRef.current;
    if (existingAudio && isSelectedMusicPlaying) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
      setPlayingMusicSource(null);
      return;
    }

    if (existingAudio) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
      musicPreviewRef.current = null;
      setPlayingMusicSource(null);
    }

    setPreviewingMusic(true);
    try {
      const sourceForResolution = selectedMusicTrack?.path || selectedMusicTrack?.url || selectedMusicSource;
      const resolvedUrl = await resolveMediaPlaybackUrl(sourceForResolution);
      if (!resolvedUrl) {
        throw new Error("Missing music preview URL");
      }
      const audio = new Audio(resolvedUrl);
      const safeVolume = Number.isFinite(backgroundMusicVolume)
        ? Math.max(0, Math.min(1, backgroundMusicVolume))
        : 0.25;
      audio.volume = safeVolume;
      audio.addEventListener("ended", () => {
        setPlayingMusicSource(null);
      });
      musicPreviewRef.current = audio;
      await audio.play();
      setPlayingMusicSource(selectedMusicSource);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Music preview failed");
      setPlayingMusicSource(null);
    } finally {
      setPreviewingMusic(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Voice engine</label>
          <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
            Kokoro TTS (Docker)
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Provider is fixed to `{activeTtsProvider}` for now.
          </p>
          <Controller
            control={control}
            name="tts_provider"
            render={({ field }) => <input type="hidden" value={field.value} onChange={field.onChange} />}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 flex items-center gap-2">
            Kokoro voice expression
            {ttsVoice && !prefersReducedMotion() ? (
              <span className="inline-flex h-3.5 items-end gap-0.5" aria-hidden title="Voice selected">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-sm bg-primary/80 animate-pulse"
                    style={{ animationDelay: `${i * 0.15}s`, height: `${40 + i * 15}%` }}
                  />
                ))}
              </span>
            ) : null}
          </label>
          <div className="flex min-w-0 gap-2">
            <div className="min-w-0 flex-1">
              <Controller
                control={control}
                name="tts_voice"
                render={({ field }) => (
                  <Select value={selectedPresetVoice} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Browse Kokoro voices" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate">{v.name}</div>
                              <div className="truncate text-xs text-muted-foreground">{v.id}</div>
                            </div>
                            {voiceMetaLabel(v) ? (
                              <div className="shrink-0 text-xs text-muted-foreground">{voiceMetaLabel(v)}</div>
                            ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              type="button"
              onClick={onVoicePreview}
              disabled={previewingVoice}
              title="Preview voice"
            >
              {previewingVoice ? (
                <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Headphones className="h-4 w-4" />
              )}
            </Button>
          </div>
          {showError("tts_voice") ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.tts_voice?.message}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Browse all Kokoro voices in the dropdown with readable names, IDs, and inferred locale/gender.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Speech speed</label>
          <Input type="number" min={0.5} max={2} step={0.05} {...register("tts_speed", { valueAsNumber: true })} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Audio format</label>
          <Controller
            control={control}
            name="tts_response_format"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  {["mp3", "wav", "opus", "flac", "m4a"].map((format) => (
                    <SelectItem key={format} value={format}>
                      {format.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <label className="flex items-start gap-2 text-sm font-medium pt-7">
          <input type="checkbox" className="rounded" {...register("tts_normalize")} />
          <span>
            Normalize text
            <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
              Turn this off if Kokoro is over-normalizing unusual names or formatting.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 flex items-center gap-1">
          <Music className="h-4 w-4" /> Background Music
        </label>
        <div className="flex gap-2">
          <Controller
            control={control}
            name="background_music"
            render={({ field }) => (
              <Select
                open={musicSelectOpen}
                onOpenChange={setMusicSelectOpen}
                value={selectedMusicValue}
                onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select music" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {missingSelectedMusicLabel ? (
                    <SelectItem value={backgroundMusic}>
                      {missingSelectedMusicLabel}
                    </SelectItem>
                  ) : null}
                  {musicList.map((m) => (
                    <SelectItem
                      key={m.path || m.id}
                      value={m.path || m.id}
                      action={
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${getMusicTrackLabel(m)}`}
                          title={`Delete ${getMusicTrackLabel(m)}`}
                          disabled={deletingTrackId === (m.id || extractTrackFilename(m.path))}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMusicSelectOpen(false);
                            void handleDeleteTrack(m);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      }
                    >
                      {getMusicTrackLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            type="button"
            onClick={() => {
              void handleMusicPreview();
            }}
            disabled={!selectedMusicSource || previewingMusic}
            title={isSelectedMusicPlaying ? "Stop background music preview" : "Preview background music"}
          >
            {previewingMusic ? (
              <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            ) : isSelectedMusicPlaying ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <label className="shrink-0 cursor-pointer">
            <input
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,.aac,.flac"
              onChange={onMusicUpload}
              className="hidden"
              disabled={uploadingMusic}
            />
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-slate-200 dark:border-zinc-700 bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
              {uploadingMusic ? (
                <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </span>
          </label>
        </div>
        {backgroundMusic ? (
          <div className="mt-2">
            <Controller
              control={control}
              name="background_music_volume"
              render={({ field: vol }) => (
                <>
                  <Input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    aria-label="Background music volume"
                    value={vol.value}
                    onChange={(e) => vol.onChange(parseFloat(e.target.value))}
                    className="h-2"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Volume: {Math.round(vol.value * 100)}%
                  </p>
                </>
              )}
            />
            {showError("background_music_volume") ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.background_music_volume?.message}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
