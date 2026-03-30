"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LinearProgress } from "@/components/ui/progress-linear";
import { CheckCircle2, Circle, Sparkles, Layers, Volume2 } from "lucide-react";
import { api, ApiError, getMediaUrl } from "@/lib/api";
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

type ServerValidationIssue = {
  loc?: unknown[];
  msg?: string;
  type?: string;
};

const SECTIONS_KEY = "shortsforge-generate-sections-v1";

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
  const [sectionsOpen, setSectionsOpen] = useState({
    content: true,
    visuals: false,
    audio: true,
    review: true,
  });

  const setContentSourceCb = useCallback((s: ContentSource) => {
    setContentSource(s);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SECTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as typeof sectionsOpen;
      if (parsed && typeof parsed === "object") {
        setSectionsOpen((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sectionsOpen));
  }, [sectionsOpen]);

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

  const applyBackendFieldErrors = useCallback(
    (issues: ServerValidationIssue[]) => {
      let applied = 0;
      for (const issue of issues) {
        if (!Array.isArray(issue.loc) || issue.loc.length < 2) continue;
        if (issue.loc[0] !== "body") continue;
        const field = issue.loc[1];
        if (typeof field !== "string") continue;
        if (!(field in form.getValues())) continue;
        form.setError(field as keyof GenerateFormValues, {
          type: issue.type || "server",
          message: issue.msg || "Invalid value",
        });
        applied += 1;
      }
      return applied;
    },
    [form]
  );

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
        if (contentSource === "concept") {
          form.setError("title", { type: "manual", message: "Please provide a concept or switch to script mode." });
        } else {
          form.setError("custom_script", { type: "manual", message: "Please provide a script before generating." });
        }
        toast.error("Fill required fields");
        return;
      }
      if (!providers.llm.some((p) => p.name === values.llm_provider && p.configured)) {
        form.setError("llm_provider", {
          type: "manual",
          message: `Provider '${values.llm_provider}' is not configured.`,
        });
        toast.error("Configure the selected LLM provider first.");
        return;
      }
      if (!providers.image.some((p) => p.name === values.image_provider && p.configured)) {
        form.setError("image_provider", {
          type: "manual",
          message: `Provider '${values.image_provider}' is not configured.`,
        });
        toast.error("Configure the selected image provider first.");
        return;
      }
      if (!providers.tts.some((p) => p.name === values.tts_provider && p.configured)) {
        form.setError("tts_provider", {
          type: "manual",
          message: `Provider '${values.tts_provider}' is not configured.`,
        });
        toast.error("Configure the selected TTS provider first.");
        return;
      }
      if (!voices.some((v) => v.id === values.tts_voice)) {
        form.setError("tts_voice", {
          type: "manual",
          message: "Please select a valid voice for the current TTS provider.",
        });
        toast.error("Selected voice is unavailable for this TTS provider.");
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
        if (err instanceof ApiError) {
          const detail = err.body?.detail;
          if (Array.isArray(detail)) {
            const applied = applyBackendFieldErrors(detail as ServerValidationIssue[]);
            if (applied > 0) {
              toast.error("Fix highlighted fields and try again.");
              return;
            }
          }
        }
        toast.error(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [contentSource, addJob, applyBackendFieldErrors, form, providers.image, providers.llm, providers.tts, router, voices]
  );

  const activeJobs = jobs.filter((j) => (j.status === "queued" || j.status === "in_progress") && j.type === "video_render");
  const resolutionIds = resolutions.map((r) => r.id);
  const titleValue = useWatch({ control: form.control, name: "title" });
  const scriptValue = useWatch({ control: form.control, name: "custom_script" });
  const imageProvider = useWatch({ control: form.control, name: "image_provider" });
  const resolution = useWatch({ control: form.control, name: "resolution" });
  const ttsVoice = useWatch({ control: form.control, name: "tts_voice" });
  const subtitleEnabled = useWatch({ control: form.control, name: "subtitle_enabled" });
  const formErrors = form.formState.errors;
  const sectionProgress = [
    {
      id: "content",
      label: "Content",
      done: contentSource === "concept" ? !!titleValue?.trim() : !!scriptValue?.trim(),
    },
    { id: "visuals", label: "Visuals", done: !!imageProvider && !!resolution },
    { id: "audio", label: "Audio", done: !!ttsProvider && !!ttsVoice },
    { id: "review", label: "Review", done: subtitleEnabled !== undefined },
  ] as const;
  const problemFields = Object.keys(formErrors) as (keyof GenerateFormValues)[];
  const jumpToField = (field: keyof GenerateFormValues) => {
    form.setFocus(field);
    requestAnimationFrame(() => {
      const el = document.getElementsByName(field)[0] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <FormProvider {...form}>
      <div className="space-y-6 w-full text-slate-900 dark:text-slate-100 pb-24 lg:pb-6">
        <div>
          <h1 className="text-3xl font-bold">Generate</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Generate AI-powered faceless short videos</p>
        </div>

        <GeneratePresetsBar resolutionIds={resolutionIds} />
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {sectionProgress.map((s) => {
                const isOpen = sectionsOpen[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSectionsOpen((prev) => ({ ...prev, [s.id]: true }));
                    }}
                    className={`text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                      isOpen
                        ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                        : s.done
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border hover:bg-accent"
                    }`}
                    aria-current={isOpen ? "step" : undefined}
                  >
                    <span className="flex items-center gap-2">
                      {s.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-400" />
                      )}
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CollapsibleCard
              title="Content"
              icon={<Sparkles className="h-5 w-5" />}
              open={sectionsOpen.content}
              onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, content: open }))}
            >
              <ContentSourceTabs value={contentSource} onChange={setContentSourceCb} />

              {contentSource === "concept" && <ConceptFields />}
              {contentSource === "script" && <ScriptFields />}

              <StorySettingsCard storyTypes={storyTypes} llmProviders={providers.llm} />
            </CollapsibleCard>

            <CollapsibleCard
              title="Visuals"
              icon={<Layers className="h-5 w-5" />}
              open={sectionsOpen.visuals}
              onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, visuals: open }))}
            >
              <VisualsCard
                imageProviders={providers.image}
                resolutions={resolutions}
                transitions={transitions}
              />
            </CollapsibleCard>

            <CollapsibleCard
              title="Audio & Subtitles"
              icon={<Volume2 className="h-5 w-5" />}
              open={sectionsOpen.audio}
              onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, audio: open }))}
            >
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
            {problemFields.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader>
                  <CardTitle className="text-base">Problems to fix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {problemFields.slice(0, 8).map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => jumpToField(field)}
                      className="block w-full text-left text-sm rounded-md border border-border px-2.5 py-1.5 hover:bg-accent"
                    >
                      <span className="font-medium">{field.replace(/_/g, " ")}</span>
                      {formErrors[field]?.message ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {String(formErrors[field]?.message)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card className="border-cyan-500/30 bg-cyan-500/5">
              <CardHeader>
                <CardTitle className="text-base">Ready to generate</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Review your choices and start the run when you’re ready.
              </CardContent>
            </Card>
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
