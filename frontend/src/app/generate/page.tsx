"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LinearProgress } from "@/components/ui/progress-linear";
import { Sparkles, Layers, Volume2 } from "lucide-react";
import { api, getMediaUrl } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  generateVideoFormSchema,
  buildGenerateDefaultValues,
  type GenerateFormValues,
} from "@/app/generate/schema";
import { useGenerateDraft } from "@/app/generate/useGenerateDraft";
import { ContentSourceTabs, type ContentSource } from "@/components/generate/ContentSourceTabs";
import { ConceptFields } from "@/components/generate/ConceptFields";
import { ScriptFields } from "@/components/generate/ScriptFields";
import { StorySettingsCard } from "@/components/generate/StorySettingsCard";
import { CollapsibleCard } from "@/components/generate/CollapsibleCard";
import { VisualsCard } from "@/components/generate/VisualsCard";
import { AudioCard } from "@/components/generate/AudioCard";
import { GeneratePresetsBar } from "@/components/generate/GeneratePresetsBar";
import { GenerateSummaryPanel } from "@/components/generate/GenerateSummaryPanel";
import { GenerateStickyActions } from "@/components/generate/GenerateStickyActions";
import { useStoryTypesQuery, useVoicesQuery, useMusicQuery, useUploadMusicMutation } from "@/lib/queries/generateCatalog";

const TEMPLATE_FIELDS = [
  "story_type",
  "story_template",
  "scene_count",
  "word_count",
  "scene_duration",
  "image_style",
  "tts_provider",
  "tts_voice",
  "subtitle_enabled",
  "subtitle_source",
  "generate_subtitles",
  "transcription_provider",
  "transcription_language",
  "subtitle_font",
  "subtitle_size",
  "subtitle_color",
  "subtitle_position",
  "transition",
  "resolution",
] as const;

export default function GeneratePage() {
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const jobDetails = useProjectStore((s) => s.jobDetails);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);

  const skipDraftRestore = useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.location.search.length > 1;
  }, []);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateVideoFormSchema) as Resolver<GenerateFormValues>,
    defaultValues: buildGenerateDefaultValues(defaults),
    mode: "onChange",
  });

  const hasSyncedDefaults = useRef(false);
  useEffect(() => {
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      form.reset({
        ...form.getValues(),
        ...buildGenerateDefaultValues(defaults),
      });
    }
  }, [defaults, form]);

  const [contentSource, setContentSource] = useState<ContentSource>("concept");
  const [generating, setGenerating] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(false);

  const setContentSourceCb = useCallback((s: ContentSource) => {
    setContentSource(s);
  }, []);

  const searchParamsApplied = useRef(false);
  useEffect(() => {
    if (searchParamsApplied.current || typeof window === "undefined") return;
    searchParamsApplied.current = true;
    const searchParams = new URLSearchParams(window.location.search);
    const scriptFromUrl = searchParams.get("script");
    const titleFromUrl = searchParams.get("title");
    const initialUpdates: Partial<GenerateFormValues> = {};
    if (scriptFromUrl) {
      setContentSource("script");
      initialUpdates.custom_script = scriptFromUrl;
    }
    if (titleFromUrl) {
      initialUpdates.title = titleFromUrl;
    } else if (scriptFromUrl) {
      initialUpdates.title = "AI Video";
    }
    const updates: Record<string, unknown> = { ...initialUpdates };
    for (const field of TEMPLATE_FIELDS) {
      const v = searchParams.get(field);
      if (v !== null) {
        if (field === "scene_count" || field === "word_count") updates[field] = parseInt(v, 10);
        else if (field === "scene_duration") updates[field] = parseFloat(v);
        else if (field === "subtitle_size") updates[field] = parseInt(v, 10);
        else if (field === "subtitle_enabled" || field === "generate_subtitles") updates[field] = v === "true";
        else updates[field] = v;
      }
    }
    if (Object.keys(updates).length > 0) {
      form.reset({ ...form.getValues(), ...updates } as GenerateFormValues);
    }
  }, [form]);

  useGenerateDraft(form, {
    skipRestore: skipDraftRestore,
    contentSource,
    setContentSource: setContentSourceCb,
  });

  const { data: storyTypes = [] } = useStoryTypesQuery();
  const ttsProvider = useWatch({ control: form.control, name: "tts_provider" });
  const { data: voices = [] } = useVoicesQuery(ttsProvider);
  const { data: musicList = [] } = useMusicQuery();
  const uploadMusicMut = useUploadMusicMutation();

  const handleVoicePreview = useCallback(async () => {
    const v = form.getValues();
    setPreviewingVoice(true);
    try {
      const result = await api.previewVoice(v.tts_provider, v.tts_voice);
      const url = getMediaUrl(result.path || result.url);
      const audio = new Audio(url);
      audio.play();
    } catch {
      toast.error("Voice preview failed");
    } finally {
      setPreviewingVoice(false);
    }
  }, [form]);

  const handleMusicUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const track = await uploadMusicMut.mutateAsync(file);
        form.setValue("background_music", track.path, { shouldDirty: true });
        toast.success("Music uploaded");
      } catch {
        toast.error("Upload failed");
      } finally {
        e.target.value = "";
      }
    },
    [form, uploadMusicMut]
  );

  const onSubmitValid = useCallback(
    async (values: GenerateFormValues) => {
      const ok =
        contentSource === "concept" ? !!values.title?.trim() : !!values.custom_script?.trim();
      if (!ok) {
        toast.error("Fill required fields");
        return;
      }
      setGenerating(true);
      try {
        const storyboard_only = values.control_mode === "co_pilot" || values.control_mode === "manual";
        const prepare_only = values.control_mode === "autopilot";
        const job = await api.generateVideo({
          ...values,
          custom_script: contentSource === "script" ? values.custom_script : undefined,
          prepare_only,
          storyboard_only,
        });
        addJob(job);
        if (job.project_id) {
          const path =
            values.control_mode === "co_pilot" || values.control_mode === "manual"
              ? `/projects/${job.project_id}/editor`
              : `/projects/${job.project_id}`;
          router.push(path);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [contentSource, addJob, router]
  );

  const activeJobs = jobs.filter((j) => (j.status === "queued" || j.status === "in_progress") && j.type === "video_render");
  const resolutionIds = resolutions.map((r) => r.id);

  return (
    <FormProvider {...form}>
      <div className="space-y-6 w-full text-slate-900 dark:text-slate-100 pb-24 lg:pb-6">
        <div>
          <h1 className="text-3xl font-bold">Create</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Create AI-powered faceless short videos</p>
        </div>

        <GeneratePresetsBar resolutionIds={resolutionIds} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ContentSourceTabs value={contentSource} onChange={setContentSourceCb} />

                {contentSource === "concept" && <ConceptFields />}
                {contentSource === "script" && <ScriptFields />}

                <StorySettingsCard storyTypes={storyTypes} llmProviders={providers.llm} />
              </CardContent>
            </Card>

            <CollapsibleCard title="Visuals" icon={<Layers className="h-5 w-5" />} defaultOpen>
              <VisualsCard
                imageProviders={providers.image}
                resolutions={resolutions}
                transitions={transitions}
              />
            </CollapsibleCard>

            <CollapsibleCard title="Audio & Subtitles" icon={<Volume2 className="h-5 w-5" />} defaultOpen>
              <AudioCard
                ttsProviders={providers.tts}
                voices={voices}
                musicList={musicList}
                previewingVoice={previewingVoice}
                uploadingMusic={uploadMusicMut.isPending}
                onVoicePreview={handleVoicePreview}
                onMusicUpload={handleMusicUpload}
              />
            </CollapsibleCard>
          </div>

          <div className="space-y-6 lg:space-y-6">
            <GenerateStickyActions
              contentSource={contentSource}
              generating={generating}
              onSubmitValid={onSubmitValid}
            />

            {activeJobs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Active Jobs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{job.type.replace(/_/g, " ")}</span>
                        <span className="font-medium">{job.progress}%</span>
                      </div>
                      <LinearProgress value={job.progress} />
                      {jobDetails[job.id] && (
                        <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                          {jobDetails[job.id]}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <GenerateSummaryPanel control={form.control} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
