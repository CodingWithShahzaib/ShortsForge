"use client";

import { memo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2, Type, Music, Upload, Headphones } from "lucide-react";
import type { GenerateFormValues } from "@/app/generate/schema";
import type { Voice } from "@/lib/types";

type Provider = { name: string; configured: boolean };

type MusicTrack = { id: string; name: string; path: string; url?: string };

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
  const { control, register } = useFormContext<GenerateFormValues>();
  const backgroundMusic = useWatch({ control, name: "background_music" });
  const subtitleEnabled = useWatch({ control, name: "subtitle_enabled" });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">TTS Provider</label>
          <Controller
            control={control}
            name="tts_provider"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {ttsProviders
                    .filter((p) => p.configured)
                    .map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Voice</label>
          <div className="flex gap-2">
            <Controller
              control={control}
              name="tts_voice"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
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
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 flex items-center gap-1">
          <Music className="h-4 w-4" /> Background Music
        </label>
        <div className="flex gap-2">
          <Controller
            control={control}
            name="background_music"
            render={({ field }) => (
              <Select
                value={field.value ? field.value : "none"}
                onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select music" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {musicList.map((m) => (
                    <SelectItem key={m.path || m.id} value={m.path || m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
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
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" className="rounded" {...register("subtitle_enabled")} />
        <label className="text-sm font-medium flex items-center gap-1">
          <Type className="h-4 w-4" /> Enable Subtitles
        </label>
      </div>

      {subtitleEnabled ? (
        <div className="contents">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Subtitle Source</label>
                  <Controller
                    control={control}
                    name="subtitle_source"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="llm">LLM-generated (per scene)</SelectItem>
                          <SelectItem value="transcription">Audio transcription</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    LLM generates captions per scene; transcription uses speech-to-text.
                  </p>
                </div>
                <Controller
                  control={control}
                  name="subtitle_source"
                  render={({ field: src }) => (
                    <>
                      {src.value === "llm" && (
                        <div className="flex items-center gap-2 pt-2">
                          <input type="checkbox" id="gen-sub" className="rounded" {...register("generate_subtitles")} />
                          <label htmlFor="gen-sub" className="text-sm font-medium cursor-pointer">
                            Generate subtitles with LLM
                          </label>
                        </div>
                      )}
                      {src.value === "transcription" && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Transcription provider
                            </label>
                            <Controller
                              control={control}
                              name="transcription_provider"
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Provider" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="openai">OpenAI (Whisper)</SelectItem>
                                    <SelectItem value="groq">Groq</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Language
                            </label>
                            <Input
                              placeholder="en"
                              className="mt-1"
                              {...register("transcription_language")}
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ISO 639-1 (e.g. en, es, fr)</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Font</label>
                  <Controller
                    control={control}
                    name="subtitle_font"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select font" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Arial", "Montserrat", "Roboto", "Impact", "Open Sans", "Georgia"].map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Size</label>
                  <Input type="number" min={24} max={96} {...register("subtitle_size", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Color</label>
                  <Controller
                    control={control}
                    name="subtitle_color"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="h-10 w-14 p-1 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="flex-1 font-mono text-sm"
                        />
                      </div>
                    )}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Position</label>
                  <Controller
                    control={control}
                    name="subtitle_position"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom">Bottom</SelectItem>
                          <SelectItem value="top">Top</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </div>
      ) : null}
    </>
  );
});
