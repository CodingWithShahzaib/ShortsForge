"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { notify } from "@/lib/notify";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LinearProgress } from "@/components/ui/progress-linear";
import { Sparkles, Layers, Volume2 } from "lucide-react";
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
import { ViralIdeasSection } from "@/components/generate/ViralIdeasSection";
import { GenerateSummaryPanel } from "@/components/generate/GenerateSummaryPanel";
import { useStoryTypesQuery, useVoicesQuery, useMusicQuery, useUploadMusicMutation } from "@/lib/queries/generateCatalog";
import { SECTIONS_STORAGE_KEY } from "@/app/generate/constants";
import { cn } from "@/lib/utils";

const GenerationPipeline = dynamic(
  () => import("@/components/generate/GenerationPipeline").then((m) => m.GenerationPipeline),
  { ssr: false, loading: () => <p className="text-xs text-muted-foreground px-1 py-2">Loading pipeline…</p> },
);

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

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<typeof sectionsOpen>) : null;
      if (parsed && typeof parsed === "object") {
        setSectionsOpen((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(sectionsOpen));
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
  const titleWatch = useWatch({ control: form.control, name: "title" });
  const customScriptWatch = useWatch({ control: form.control, name: "custom_script" });
  const llmProviderWatch = useWatch({ control: form.control, name: "llm_provider" });
  const imageProviderWatch = useWatch({ control: form.control, name: "image_provider" });
  const ttsVoiceWatch = useWatch({ control: form.control, name: "tts_voice" });
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
      notify.error("Voice preview failed");
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
        notify.success("Music uploaded");
      } catch {
        notify.error("Upload failed");
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
        notify.error("Fill required fields");
        return;
      }
      if (!providers.llm.some((p) => p.name === values.llm_provider && p.configured)) {
        form.setError("llm_provider", {
          type: "manual",
          message: `Provider '${values.llm_provider}' is not configured.`,
        });
        notify.error("Configure the selected LLM provider first.");
        return;
      }
      if (!providers.image.some((p) => p.name === values.image_provider && p.configured)) {
        form.setError("image_provider", {
          type: "manual",
          message: `Provider '${values.image_provider}' is not configured.`,
        });
        notify.error("Configure the selected image provider first.");
        return;
      }
      if (!providers.tts.some((p) => p.name === values.tts_provider && p.configured)) {
        form.setError("tts_provider", {
          type: "manual",
          message: `Provider '${values.tts_provider}' is not configured.`,
        });
        notify.error("Configure the selected TTS provider first.");
        return;
      }
      if (!voices.some((v) => v.id === values.tts_voice)) {
        form.setError("tts_voice", {
          type: "manual",
          message: "Please select a valid voice for the current TTS provider.",
        });
        notify.error("Selected voice is unavailable for this TTS provider.");
        return;
      }
      setGenerating(true);
      try {
        const storyboard_only = true;
        const prepare_only = false;
        const job = await api.generateVideo({
          ...values,
          custom_script: contentSource === "script" ? values.custom_script : undefined,
          control_mode: "co_pilot",
          prepare_only,
          storyboard_only,
        });
        addJob(job);
        if (job.project_id) {
          router.push(`/projects/${job.project_id}/studio`);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          const detail = err.body?.detail;
          if (Array.isArray(detail)) {
            const applied = applyBackendFieldErrors(detail as ServerValidationIssue[]);
            if (applied > 0) {
              notify.error("Fix highlighted fields and try again.");
              return;
            }
          }
        }
        notify.error(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [contentSource, addJob, applyBackendFieldErrors, form, providers.image, providers.llm, providers.tts, router, voices]
  );

  const canGenerate = useMemo(() => {
    const contentOk =
      contentSource === "concept" ? !!titleWatch?.trim() : !!customScriptWatch?.trim();
    const llmOk = providers.llm.some((p) => p.name === llmProviderWatch && p.configured);
    const imgOk = providers.image.some((p) => p.name === imageProviderWatch && p.configured);
    const ttsOk = providers.tts.some((p) => p.name === ttsProvider && p.configured);
    const voiceOk = voices.some((v) => v.id === ttsVoiceWatch);
    return contentOk && llmOk && imgOk && ttsOk && voiceOk;
  }, [
    contentSource,
    titleWatch,
    customScriptWatch,
    llmProviderWatch,
    imageProviderWatch,
    ttsProvider,
    ttsVoiceWatch,
    providers.llm,
    providers.image,
    providers.tts,
    voices,
  ]);

  const triggerGenerate = useCallback(() => {
    void form.handleSubmit(onSubmitValid)();
  }, [form, onSubmitValid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (!canGenerate || generating) return;
        e.preventDefault();
        void form.handleSubmit(onSubmitValid)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canGenerate, generating, form, onSubmitValid]);

  const activeJobs = jobs.filter((j) => (j.status === "queued" || j.status === "in_progress") && j.type === "video_render");
  const resolutionIds = resolutions.map((r) => r.id);
  const transitionIds = transitions.map((t) => t.id);
  const formErrors = form.formState.errors;
  const problemFields = Object.keys(formErrors) as (keyof GenerateFormValues)[];
  const showAsideColumn = useMemo(() => {
    const pipelineTrackable = jobs.some(
      (j) =>
        j.type === "video_render" &&
        (j.status === "queued" || j.status === "in_progress") &&
        Boolean(j.project_id)
    );
    return problemFields.length > 0 || activeJobs.length > 0 || pipelineTrackable;
  }, [jobs, problemFields.length, activeJobs.length]);
  const jumpToField = (field: keyof GenerateFormValues) => {
    form.setFocus(field);
    requestAnimationFrame(() => {
      const el = document.getElementsByName(field)[0] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <FormProvider {...form}>
      <div className="w-full min-w-0 max-w-none pb-8 text-slate-900 dark:text-slate-100">
        <header className="mb-4 border-b border-border/50 pb-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Generate</p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Create a short</h1>
            <p className="max-w-2xl text-pretty text-sm leading-snug text-muted-foreground">
              Set your story, adjust visuals and audio, then open the studio with a storyboard job.
            </p>
          </div>
        </header>

        <div
          className={cn(
            "grid w-full min-w-0 grid-cols-1 gap-5 lg:items-start lg:gap-6",
            showAsideColumn && "lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_18.5rem]"
          )}
        >
          <div className="min-w-0 w-full space-y-4">
            <section
              aria-label="Live estimate"
              className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm"
            >
              <GenerateSummaryPanel control={form.control} variant="strip" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-sans text-[10px]">Ctrl</kbd>
                <span className="mx-1">+</span>
                <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-sans text-[10px]">Enter</kbd>
                <span className="ml-1.5">to generate when ready</span>
              </p>
            </section>

            <ViralIdeasSection
              setContentSource={setContentSourceCb}
              setSectionsOpen={setSectionsOpen}
              validResolutionIds={resolutionIds}
              validTransitionIds={transitionIds}
            />

            <div id="gen-content" className="scroll-mt-20 w-full min-w-0">
              <div className="section-neon section-neon--content w-full min-w-0 rounded-xl border border-border/60 bg-card/40 shadow-sm">
                <CollapsibleCard
                  title="Content"
                  icon={<Sparkles className="h-4 w-4 opacity-90" />}
                  open={sectionsOpen.content}
                  onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, content: open }))}
                >
                  <ContentSourceTabs value={contentSource} onChange={setContentSourceCb} />

                  {contentSource === "concept" && (
                    <ConceptFields
                      generating={generating}
                      canGenerate={canGenerate}
                      onGenerate={triggerGenerate}
                    />
                  )}
                  {contentSource === "script" && (
                    <ScriptFields
                      generating={generating}
                      canGenerate={canGenerate}
                      onGenerate={triggerGenerate}
                    />
                  )}

                  <StorySettingsCard
                    storyTypes={storyTypes}
                    llmProviders={providers.llm}
                  />
                </CollapsibleCard>
              </div>
            </div>

            <div id="gen-visuals" className="scroll-mt-20 w-full min-w-0">
              <div className="section-neon section-neon--visuals w-full min-w-0 rounded-xl border border-border/60 bg-card/40 shadow-sm">
                <CollapsibleCard
                  title="Visuals"
                  icon={<Layers className="h-4 w-4 opacity-90" />}
                  open={sectionsOpen.visuals}
                  onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, visuals: open }))}
                >
                  <VisualsCard
                    imageProviders={providers.image}
                    resolutions={resolutions}
                    transitions={transitions}
                  />
                </CollapsibleCard>
              </div>
            </div>

            <div id="gen-audio" className="scroll-mt-20 w-full min-w-0">
              <div className="section-neon section-neon--audio w-full min-w-0 rounded-xl border border-border/60 bg-card/40 shadow-sm">
                <CollapsibleCard
                  title="Audio & Subtitles"
                  icon={<Volume2 className="h-4 w-4 opacity-90" />}
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
            </div>
          </div>

          {showAsideColumn && (
            <aside className="min-w-0 w-full max-w-full space-y-3 lg:sticky lg:top-6 lg:self-start">
              {problemFields.length > 0 && (
                <Card className="section-neon section-neon--amber border-amber-500/35 shadow-sm" size="2">
                  <CardHeader className="space-y-0 p-3 pb-2">
                    <CardTitle className="text-xs font-semibold tracking-wide uppercase text-amber-800 dark:text-amber-200/90">
                      Fix first
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 px-3 pb-3 pt-0">
                    {problemFields.slice(0, 8).map((field) => (
                      <button
                        key={field}
                        type="button"
                        onClick={() => jumpToField(field)}
                        className="block w-full rounded-lg border border-border/80 bg-background/50 px-2.5 py-2 text-left text-sm transition hover:bg-accent/80"
                      >
                        <span className="font-medium">{field.replace(/_/g, " ")}</span>
                        {formErrors[field]?.message ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {String(formErrors[field]?.message)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}

              <GenerationPipeline />

              {activeJobs.length > 0 && (
                <Card className="section-neon section-neon--pipeline border-border/70 shadow-sm" size="2">
                  <CardHeader className="space-y-0 p-3 pb-2">
                    <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                      Active jobs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 pb-3 pt-0">
                    {activeJobs.map((job) => (
                      <div key={job.id} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{job.type.replace(/_/g, " ")}</span>
                          <span className="font-medium tabular-nums">{job.progress}%</span>
                        </div>
                        <LinearProgress value={job.progress} />
                        {jobDetails[job.id] && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                            {jobDetails[job.id]}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </aside>
          )}
        </div>
      </div>
    </FormProvider>
  );
}
