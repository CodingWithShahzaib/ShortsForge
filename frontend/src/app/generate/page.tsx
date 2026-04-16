"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { notify } from "@/lib/notify";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinearProgress } from "@/components/ui/progress-linear";
import { ArrowLeft, Bookmark, CheckCircle2, Clapperboard, Layers, Sparkles, Volume2 } from "lucide-react";
import { api, ApiError, resolveMediaPlaybackUrl } from "@/lib/api";
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
import { StoryBriefCard } from "@/components/generate/StoryBriefCard";
import { VisualsCard } from "@/components/generate/VisualsCard";
import { AudioCard } from "@/components/generate/AudioCard";
import { DialogueControlsCard } from "@/components/generate/DialogueControlsCard";
import { GenerateSummaryPanel } from "@/components/generate/GenerateSummaryPanel";
import { GenerateTemplatesCard } from "@/components/generate/GenerateTemplatesCard";
import { RefineScriptCharactersDialog } from "@/components/generate/RefineScriptCharactersDialog";
import { SubtitleSettingsCard } from "@/components/generate/SubtitleSettingsCard";
import { ViralIdeasSection, type ViralIdeasTemplateState } from "@/components/generate/ViralIdeasSection";
import { CollapsibleCard } from "@/components/generate/CollapsibleCard";
import { CharacterManager } from "@/components/character-manager/CharacterManager";
import { useStoryTypesQuery, useVoicesQuery, useMusicQuery, useUploadMusicMutation } from "@/lib/queries/generateCatalog";
import { engineStageLabel, inferCurrentStage, summarizeEngineOutcome } from "@/lib/engine-pipeline";
import { CreationActionBar } from "@/components/creation/CreationActionBar";
import { CreationPageShell } from "@/components/creation/CreationPageShell";
import type { TemplatePreset } from "@/lib/types";

const GenerationPipeline = dynamic(
  () => import("@/components/generate/GenerationPipeline").then((m) => m.GenerationPipeline),
  { ssr: false, loading: () => <p className="text-xs text-muted-foreground px-1 py-2">Loading pipeline…</p> },
);

const TEMPLATE_FIELDS = [
  "story_type",
  "story_template",
  "scene_count",
  "dynamic_scenes",
  "word_count",
  "scene_narration_style",
  "scene_duration",
  "inter_scene_pause_ms",
  "transition_overlap_ms",
  "image_style",
  "tts_provider",
  "tts_voice",
  "transition",
  "resolution",
  "use_production_storyboard",
  "match_scenes_to_audio",
  "visual_continuity",
] as const;

type ServerValidationIssue = {
  loc?: unknown[];
  msg?: string;
  type?: string;
};
type PipelineMode = "manual" | "auto";
type WizardStep = "mode" | "input" | "tune" | "review";

export default function GeneratePage() {
  const router = useRouter();
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const jobDetails = useProjectStore((s) => s.jobDetails);
  const jobPipelines = useProjectStore((s) => s.jobPipelines);
  const transitions = useSettingsStore((s) => s.transitions);
  const resolutions = useSettingsStore((s) => s.resolutions);
  const providers = useSettingsStore((s) => s.providers);
  const defaults = useSettingsStore((s) => s.defaults);
  const defaultsHydrated = useSettingsStore((s) => s.hydrated);

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
    if (!defaultsHydrated) return;
    if (!hasSyncedDefaults.current) {
      hasSyncedDefaults.current = true;
      form.reset({
        ...form.getValues(),
        ...buildGenerateDefaultValues(defaults),
      });
    }
  }, [defaults, defaultsHydrated, form]);

  const [contentSource, setContentSource] = useState<ContentSource>("concept");
  const [generating, setGenerating] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("manual");
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [scriptAutoFixing, setScriptAutoFixing] = useState(false);
  const [generatingCharacterId, setGeneratingCharacterId] = useState<string | null>(null);
  const [refineDialogOpen, setRefineDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("mode");
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplatePreset[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [ideaFeedState, setIdeaFeedState] = useState<ViralIdeasTemplateState | null>(null);
  const [appliedIdeaFeedState, setAppliedIdeaFeedState] = useState<ViralIdeasTemplateState | null>(null);
  const [ideaFeedRefreshToken, setIdeaFeedRefreshToken] = useState(0);

  const setContentSourceCb = useCallback((s: ContentSource) => {
    setContentSource(s);
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const nextTemplates = await api.listTemplates();
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => (
        current && nextTemplates.some((template) => template.id === current)
          ? current
          : (nextTemplates[0]?.id || "")
      ));
    } catch {
      notify.error("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

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
        else if (field === "inter_scene_pause_ms" || field === "transition_overlap_ms") updates[field] = parseInt(v, 10);
        else if (
          field === "dynamic_scenes" ||
          field === "use_production_storyboard" ||
          field === "match_scenes_to_audio"
        )
          updates[field] = v === "true";
        else updates[field] = v;
      }
    }
    if (typeof updates.visual_continuity === "string") {
      updates.visual_continuity = updates.visual_continuity.trim();
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
  const generationModeWatch = useWatch({ control: form.control, name: "generation_mode" });
  const titleWatch = useWatch({ control: form.control, name: "title" });
  const customScriptWatch = useWatch({ control: form.control, name: "custom_script" });
  const storyTypeWatch = useWatch({ control: form.control, name: "story_type" });
  const llmProviderWatch = useWatch({ control: form.control, name: "llm_provider" });
  const llmModelWatch = useWatch({ control: form.control, name: "llm_model" });
  const imageProviderWatch = useWatch({ control: form.control, name: "image_provider" });
  const ttsVoiceWatch = useWatch({ control: form.control, name: "tts_voice" });
  const dialogueCharactersWatch = useWatch({ control: form.control, name: "dialogue_characters" });
  const { data: voices = [] } = useVoicesQuery(ttsProvider || "kokoro");
  const { data: musicList = [] } = useMusicQuery();
  const uploadMusicMut = useUploadMusicMutation();

  useEffect(() => {
    if (generationModeWatch !== "dialogue") return;
    if (contentSource === "script") return;
    setContentSource("script");
  }, [contentSource, generationModeWatch]);

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
      const result = await api.generateAudio({
        text: "Hello! This is a preview of my Kokoro voice settings.",
        provider: "kokoro",
        voice: v.tts_voice,
        speed: v.tts_speed,
        response_format: v.tts_response_format,
        normalize: v.tts_normalize,
      });
      const raw = result.url || result.path;
      if (!raw) {
        throw new Error("Missing audio preview URL");
      }
      const url = await resolveMediaPlaybackUrl(raw);
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

  const handleGenerateCharacterReference = useCallback(
    async (character: GenerateFormValues["dialogue_characters"][number]) => {
      setGeneratingCharacterId(character.id);
      try {
        const existingCharacters = await api.characters.list();
        const existing = existingCharacters.find((item) => item.id === character.id);
        const saved = existing
          ? await api.characters.update(character.id, {
              ...character,
              voice_profile: character.voice_profile ?? null,
              reference_image_url: character.reference_image_url ?? null,
              color_palette: character.color_palette ?? null,
            })
          : await api.characters.create({
              ...character,
              voice_profile: character.voice_profile ?? null,
              reference_image_url: character.reference_image_url ?? null,
              color_palette: character.color_palette ?? null,
            });
        const updated = await api.characters.generateReference(saved.id, {
          style: form.getValues("dialogue_style_preset"),
        });
        const nextCharacters = form
          .getValues("dialogue_characters")
          .map((entry) => (entry.id === updated.id ? updated : entry));
        form.setValue("dialogue_characters", nextCharacters, { shouldDirty: true });
        notify.success(`Reference updated for ${updated.name}`);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Reference generation failed");
      } finally {
        setGeneratingCharacterId(null);
      }
    },
    [form]
  );

  const handleApplyRefinedScriptCharacters = useCallback(
    ({ text, characters }: { text: string; characters: GenerateFormValues["dialogue_characters"] }) => {
      form.setValue("custom_script", text, { shouldDirty: true, shouldValidate: true });
      form.setValue("dialogue_characters", characters, { shouldDirty: true, shouldValidate: true });
      form.setValue("generation_mode", "dialogue", { shouldDirty: true, shouldValidate: true });
      setContentSource("script");
      setWizardStep("input");
      notify.success("Dialogue script and characters applied.");
    },
    [form]
  );

  const handleApplyTemplate = useCallback(async () => {
    if (!selectedTemplateId) {
      notify.error("Choose a template first.");
      return;
    }
    try {
      const template = await api.getTemplate(selectedTemplateId);
      const rawSettings: Record<string, unknown> =
        template.settings && typeof template.settings === "object" ? template.settings : {};
      const contentSourceFromTemplate =
        rawSettings.content_source === "script" ? "script" : "concept";
      const pipelineModeFromTemplate =
        rawSettings.pipeline_mode === "auto" ? "auto" : "manual";
      const ideaFeedFromTemplate =
        rawSettings.idea_feed && typeof rawSettings.idea_feed === "object"
          ? rawSettings.idea_feed as ViralIdeasTemplateState
          : null;
      const nextValues = {
        ...buildGenerateDefaultValues(defaults),
        ...rawSettings,
      } as GenerateFormValues;
      setContentSource(contentSourceFromTemplate);
      setPipelineMode(pipelineModeFromTemplate);
      setAppliedIdeaFeedState(ideaFeedFromTemplate);
      if (ideaFeedFromTemplate) {
        setIdeaFeedRefreshToken((current) => current + 1);
      }
      form.reset(nextValues);
      notify.success(`Applied template: ${template.name}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to apply template");
    }
  }, [defaults, form, selectedTemplateId]);

  const handleSaveTemplate = useCallback(async () => {
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      notify.error("Template name is required.");
      return;
    }
    setSavingTemplate(true);
    try {
      const values = form.getValues();
      const saved = await api.createTemplate({
        name: trimmedName,
        description: templateDescription.trim() || null,
        category: "generate_page",
        story_type: values.story_type,
        scene_count: values.scene_count,
        settings: {
          ...values,
          content_source: contentSource,
          pipeline_mode: pipelineMode,
          idea_feed: ideaFeedState,
        },
      });
      await loadTemplates();
      setSelectedTemplateId(saved.id);
      setTemplateName("");
      setTemplateDescription("");
      notify.success(`Saved template: ${saved.name}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }, [contentSource, form, ideaFeedState, loadTemplates, pipelineMode, templateDescription, templateName]);

  const handleDeleteTemplate = useCallback(async () => {
    const selected = templates.find((template) => template.id === selectedTemplateId);
    if (!selected) {
      notify.error("Choose a template first.");
      return;
    }
    if (selected.builtin) {
      notify.error("Built-in templates cannot be deleted.");
      return;
    }
    setDeletingTemplate(true);
    try {
      await api.deleteTemplate(selected.id);
      await loadTemplates();
      notify.success(`Deleted template: ${selected.name}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete template");
    } finally {
      setDeletingTemplate(false);
    }
  }, [loadTemplates, selectedTemplateId, templates]);

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
        notify.error("Set up the selected script AI first.");
        return;
      }
      if (!providers.image.some((p) => p.name === values.image_provider && p.configured)) {
        form.setError("image_provider", {
          type: "manual",
          message: `Provider '${values.image_provider}' is not configured.`,
        });
        notify.error("Set up the selected image engine first.");
        return;
      }
      if (!providers.tts.some((p) => p.name === values.tts_provider && p.configured)) {
        form.setError("tts_provider", {
          type: "manual",
          message: `Provider '${values.tts_provider}' is not configured.`,
        });
        notify.error("Set up the selected voice engine first.");
        return;
      }
      if (!voices.some((v) => v.id === values.tts_voice)) {
        form.setError("tts_voice", {
          type: "manual",
          message: "Please select a voice that works with the current voice engine.",
        });
        notify.error("That voice is not available for the selected voice engine.");
        return;
      }
      if (values.generation_mode === "dialogue") {
        if (contentSource !== "script") {
          setContentSource("script");
          requestAnimationFrame(() => {
            document.getElementById("custom-script")?.scrollIntoView({ behavior: "smooth", block: "center" });
            form.setFocus("custom_script");
          });
          notify.message("Dialogue mode uses Custom Script. I switched you there.");
          return;
        }
        if (!values.custom_script.trim()) {
          form.setError("custom_script", {
            type: "manual",
            message: "Add a speaker-tagged script like `Alex: ...` before generating dialogue scenes.",
          });
          requestAnimationFrame(() => {
            document.getElementById("custom-script")?.scrollIntoView({ behavior: "smooth", block: "center" });
            form.setFocus("custom_script");
          });
          notify.error("Add a speaker-tagged dialogue script to continue.");
          return;
        }
        if (values.dialogue_characters.length < 2) {
          notify.error("Add at least two characters for dialogue mode.");
          return;
        }
        if (values.dialogue_characters.some((character) => !character.name.trim() || !character.description.trim())) {
          notify.error("Each character needs a name and description.");
          return;
        }
        // Soft warning: characters with no voice_profile will use narrator fallback — non-blocking
        const unvoicedOnSubmit = values.dialogue_characters.filter((c) => !c.voice_profile);
        if (unvoicedOnSubmit.length > 0) {
          const unvoicedNames = unvoicedOnSubmit.map((c) => c.name.trim() || "Unnamed").join(", ");
          notify.message(
            `${unvoicedNames} ${unvoicedOnSubmit.length === 1 ? "has" : "have"} no voice assigned — narrator voice will be used as fallback.`
          );
        }
      }
      setGenerating(true);
      try {
        const target_stage: "storyboard" | "compile" = pipelineMode === "manual" ? "storyboard" : "compile";
        const payload = {
          ...values,
          custom_script: contentSource === "script" ? values.custom_script : undefined,
          control_mode: "co_pilot" as const,
          pipeline_mode: pipelineMode,
          target_stage,
        };
        const job = values.generation_mode === "dialogue"
          ? await api.generateDialogueVideo({
              ...payload,
              generation_mode: "dialogue",
              characters: values.dialogue_characters,
            })
          : await api.generateVideo(payload);
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
    [contentSource, pipelineMode, addJob, applyBackendFieldErrors, form, providers.image, providers.llm, providers.tts, router, voices]
  );

  const generationChecks = useMemo(() => {
    const contentOk =
      generationModeWatch === "dialogue"
        ? !!customScriptWatch?.trim()
        : (contentSource === "concept" ? !!titleWatch?.trim() : !!customScriptWatch?.trim());
    const llmOk = providers.llm.some((p) => p.name === llmProviderWatch && p.configured);
    const imgOk = providers.image.some((p) => p.name === imageProviderWatch && p.configured);
    const ttsOk = providers.tts.some((p) => p.name === ttsProvider && p.configured);
    const voiceOk = voices.some((v) => v.id === ttsVoiceWatch);
    const dialogueCharacters = Array.isArray(dialogueCharactersWatch) ? dialogueCharactersWatch : [];
    const dialogueOk =
      generationModeWatch !== "dialogue" ||
      (dialogueCharacters.length >= 2 &&
        dialogueCharacters.every((character) => character.name.trim() && character.description.trim()));
    return { contentOk, llmOk, imgOk, ttsOk, voiceOk, dialogueOk };
  }, [
    contentSource,
    generationModeWatch,
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
    dialogueCharactersWatch,
  ]);
  const canGenerate =
    generationChecks.contentOk &&
    generationChecks.llmOk &&
    generationChecks.imgOk &&
    generationChecks.ttsOk &&
    generationChecks.voiceOk &&
    generationChecks.dialogueOk;

  const scriptFixWarning = useMemo(() => {
    const text = (customScriptWatch || "").trim();
    if (!text) return [] as string[];
    const warnings: string[] = [];
    const spacedInitialism = /\b(?:[A-Za-z]\.\s+){1,}[A-Za-z]\./.test(text);
    if (spacedInitialism) {
      warnings.push("Detected spaced initialisms like 'U. S.' that can cause awkward scene splits.");
    }
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedCounts = new Map<string, number>();
    for (const sentence of sentences) {
      const key = sentence.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
      if (!key) continue;
      normalizedCounts.set(key, (normalizedCounts.get(key) ?? 0) + 1);
    }
    const repeatedSentenceCount = Array.from(normalizedCounts.values()).filter((count) => count > 1).length;
    if (repeatedSentenceCount > 0) {
      warnings.push("Detected repeated sentence blocks that can cause duplicated narration across scenes.");
    }
    const tinyFragmentCount = sentences.filter((sentence) => {
      const words = sentence.match(/\b[\w'-]+\b/g) ?? [];
      return words.length <= 1 && sentence.length <= 4;
    }).length;
    if (tinyFragmentCount > 0) {
      warnings.push("Detected tiny fragments that may become broken one-word scene narration.");
    }
    return warnings;
  }, [customScriptWatch]);

  const handleAutoFixScript = useCallback(async () => {
    const currentText = (form.getValues("custom_script") || "").trim();
    if (!currentText) return;
    setScriptAutoFixing(true);
    try {
      const result = await api.normalizeScript(currentText);
      if (result.report.changed) {
        form.setValue("custom_script", result.text, { shouldDirty: true, shouldValidate: true });
        const detail = result.report.issues.length > 0 ? ` ${result.report.issues.join(" ")}` : "";
        notify.success(`Script auto-fix applied.${detail}`);
      } else {
        notify.message("No cleanup changes were needed for this script.");
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to auto-fix script.");
    } finally {
      setScriptAutoFixing(false);
    }
  }, [form]);
  
  // NOTE: We no longer force Kokoro here so other providers (like ElevenLabs) can function natively.

  useEffect(() => {
    if (!voices.length) return;
    if (voices.some((voice) => voice.id === ttsVoiceWatch)) return;
    form.setValue("tts_voice", voices[0].id, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [form, ttsVoiceWatch, voices]);

  const triggerGenerate = useCallback(() => {
    void form.handleSubmit(onSubmitValid)();
  }, [form, onSubmitValid]);
  const generateCtaLabel = generationModeWatch === "dialogue"
    ? (pipelineMode === "manual" ? "Create dialogue scenes" : "Create dialogue video")
    : (pipelineMode === "manual" ? "Create scenes" : "Create full video");

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
  const pipelineTrackable = useMemo(
    () =>
      jobs.some(
        (j) =>
          j.type === "video_render" &&
          (j.status === "queued" || j.status === "in_progress") &&
          Boolean(j.project_id),
      ),
    [jobs],
  );
  const dialogueModeActive = generationModeWatch === "dialogue";
  const wizardSteps = useMemo<{ id: WizardStep; label: string; description: string }[]>(
    () =>
      dialogueModeActive
        ? [
            { id: "mode", label: "Choose mode", description: "Pick your core generation path." },
            {
              id: "input",
              label: "Dialogue setup",
              description: "Add your script, cast, production settings, and captions in one place.",
            },
            { id: "review", label: "Review", description: "Confirm the setup before generating." },
          ]
        : [
            { id: "mode", label: "Choose mode", description: "Pick your core generation path." },
            {
              id: "input",
              label: "Create input",
              description: "Start from a concept or a script.",
            },
            { id: "tune", label: "Tune generation", description: "Set workflow, story, visual, audio, and captions behavior." },
            { id: "review", label: "Review", description: "Confirm the setup before generating." },
          ],
    [dialogueModeActive],
  );
  const wizardStepIndex = wizardSteps.findIndex((step) => step.id === wizardStep);
  const wizardProgress = ((wizardStepIndex + 1) / wizardSteps.length) * 100;
  const currentStepMeta = wizardSteps[wizardStepIndex] ?? wizardSteps[0];

  useEffect(() => {
    if (wizardSteps.some((step) => step.id === wizardStep)) return;
    setWizardStep(dialogueModeActive ? "input" : "mode");
  }, [dialogueModeActive, wizardStep, wizardSteps]);

  const focusTitleField = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById("gen-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
      form.setFocus("title");
    });
  }, [form]);

  const focusCustomScriptField = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById("custom-script")?.scrollIntoView({ behavior: "smooth", block: "center" });
      form.setFocus("custom_script");
    });
  }, [form]);

  const validateDialogueCharacters = useCallback(() => {
    const characters = form.getValues("dialogue_characters");
    if (characters.length < 2) {
      notify.error("Add at least two characters for dialogue mode.");
      return false;
    }
    if (characters.some((character) => !character.name.trim() || !character.description.trim())) {
      notify.error("Each character needs a name and description.");
      return false;
    }
    // Soft warning: characters with no voice assigned will use narrator fallback
    const unvoiced = characters.filter((c) => !c.voice_profile);
    if (unvoiced.length > 0) {
      const names = unvoiced.map((c) => c.name.trim() || "Unnamed").join(", ");
      notify.message(
        `${names} ${unvoiced.length === 1 ? "has" : "have"} no voice assigned — the narrator voice will be used as fallback for those lines.`
      );
    }
    return true;
  }, [form]);

  const validateTuneStep = useCallback(() => {
    if (!generationChecks.llmOk) {
      form.setError("llm_provider", {
        type: "manual",
        message: `Provider '${llmProviderWatch}' is not configured.`,
      });
      notify.error("Set up the selected script AI first.");
      return false;
    }
    if (!generationChecks.imgOk) {
      form.setError("image_provider", {
        type: "manual",
        message: `Provider '${imageProviderWatch}' is not configured.`,
      });
      notify.error("Set up the selected image engine first.");
      return false;
    }
    if (!generationChecks.ttsOk) {
      form.setError("tts_provider", {
        type: "manual",
        message: `Provider '${ttsProvider}' is not configured.`,
      });
      notify.error("Set up the selected voice engine first.");
      return false;
    }
    if (!generationChecks.voiceOk) {
      form.setError("tts_voice", {
        type: "manual",
        message: "Please select a voice that works with the current voice engine.",
      });
      notify.error("That voice is not available for the selected voice engine.");
      return false;
    }
    return true;
  }, [form, generationChecks.imgOk, generationChecks.llmOk, generationChecks.ttsOk, generationChecks.voiceOk, imageProviderWatch, llmProviderWatch, ttsProvider]);

  const goToPreviousStep = useCallback(() => {
    if (wizardStepIndex <= 0) return;
    setWizardStep(wizardSteps[wizardStepIndex - 1]?.id ?? "mode");
  }, [wizardStepIndex, wizardSteps]);

  const goToNextStep = useCallback(async () => {
    switch (wizardStep) {
      case "mode":
        setWizardStep("input");
        return;
      case "input":
        if (dialogueModeActive) {
          const scriptReady = await form.trigger("custom_script");
          if (!scriptReady) {
            notify.error("Add a speaker-tagged dialogue script to continue.");
            focusCustomScriptField();
            return;
          }
          if (!validateDialogueCharacters()) return;
          if (!validateTuneStep()) return;
          setWizardStep("review");
          return;
        } else if (contentSource === "concept") {
          const conceptReady = await form.trigger("title");
          if (!conceptReady) {
            notify.error("Please provide a concept before continuing.");
            focusTitleField();
            return;
          }
        } else {
          const scriptReady = await form.trigger("custom_script");
          if (!scriptReady) {
            notify.error("Please provide a script before continuing.");
            focusCustomScriptField();
            return;
          }
        }
        setWizardStep("tune");
        return;
      case "tune":
        if (!validateTuneStep()) return;
        setWizardStep("review");
        return;
      case "review":
        triggerGenerate();
        return;
      default: {
        const unreachable: never = wizardStep;
        return unreachable;
      }
    }
  }, [contentSource, dialogueModeActive, focusCustomScriptField, focusTitleField, form, triggerGenerate, validateDialogueCharacters, validateTuneStep, wizardStep]);

  const primaryActionLabel = (() => {
    switch (wizardStep) {
      case "mode":
        return dialogueModeActive ? "Continue to script setup" : "Continue to story input";
      case "input":
        return dialogueModeActive ? "Review dialogue setup" : "Continue to tuning";
      case "tune":
        return "Review generate setup";
      case "review":
        return generateCtaLabel;
      default: {
        const unreachable: never = wizardStep;
        return unreachable;
      }
    }
  })();

  const actionHelperText = (() => {
    switch (wizardStep) {
      case "mode":
        return "Start by choosing whether this short should follow the standard faceless flow or a dialogue-first cast flow.";
      case "input":
        return dialogueModeActive
          ? "Dialogue mode keeps script, cast, workflow, visuals, audio, and captions together so you can review the whole setup before generating."
          : "Choose the fastest starting point for the story: a compact concept or a full script.";
      case "tune":
        return "Pipeline mode, story controls, visuals, audio, and captions live here after the core input is locked in.";
      case "review":
        return pipelineMode === "manual"
          ? "Starts in Studio after building the storyboard so you can tune scenes manually before final output."
          : "Runs the full pipeline automatically using the narrative and production controls configured above.";
      default: {
        const unreachable: never = wizardStep;
        return unreachable;
      }
    }
  })();

  const wizardSecondaryActions = (
    <>
      {wizardStep !== "mode" ? (
        <Button type="button" size="sm" variant="outline" onClick={goToPreviousStep}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => setSupportPanelOpen((open) => !open)}>
        {supportPanelOpen ? "Hide assist tools" : "Show assist tools"}
      </Button>
      <Button type="button" size="sm" variant="outline" asChild>
        <Link href="/scripts">Open Script Studio</Link>
      </Button>
    </>
  );

  const renderWizardBody = () => {
    switch (wizardStep) {
      case "mode":
        return (
          <Card className="section-neon section-neon--content overflow-hidden border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
            <CardHeader className="space-y-1 p-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Clapperboard className="h-4 w-4" />
                Choose your generation flow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
              <div className="grid gap-4 xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => form.setValue("generation_mode", "standard", { shouldDirty: true })}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    !dialogueModeActive ? "border-cyan-500/40 bg-cyan-500/10" : "border-border/60 bg-background/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Standard generation</p>
                    {!dialogueModeActive && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best for faceless narrative shorts. You can start from a one-line concept or a finished script, then tune pacing, visuals, audio, and output style.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/60 px-2.5 py-1">Concept or script</span>
                    <span className="rounded-full border border-border/60 px-2.5 py-1">Classic story flow</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    form.setValue("generation_mode", "dialogue", { shouldDirty: true });
                    setContentSource("script");
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    dialogueModeActive ? "border-violet-500/40 bg-violet-500/10" : "border-border/60 bg-background/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Dialogue mode</p>
                    {dialogueModeActive && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best for character-driven scenes. The next step will take you straight into a speaker-tagged script and cast setup instead of a concept-first flow.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/60 px-2.5 py-1">Speaker-tagged script</span>
                    <span className="rounded-full border border-border/60 px-2.5 py-1">Recurring cast</span>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        );
      case "input":
        return (
          <div className="space-y-4">
            <Card className="section-neon section-neon--content overflow-hidden border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clapperboard className="h-4 w-4" />
                  {dialogueModeActive ? "Configure the dialogue short" : "Create the story input"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                {dialogueModeActive ? (
                  <>
                    <ScriptFields
                      generating={generating}
                      canGenerate={canGenerate}
                      onGenerate={triggerGenerate}
                      generateLabel={generateCtaLabel}
                      showInlineAction={false}
                      scriptFixWarning={scriptFixWarning}
                      scriptFixLoading={scriptAutoFixing}
                      onAutoFixScript={handleAutoFixScript}
                      footerAction={(
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-cyan-600 hover:bg-transparent hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                          onClick={() => setRefineDialogOpen(true)}
                        >
                          Refine current script and create relevant characters
                        </Button>
                      )}
                    />
                    {/* Cast manager — character voice assignment lives here, not in AudioCard */}
                    <CharacterManager
                      characters={Array.isArray(dialogueCharactersWatch) ? dialogueCharactersWatch : []}
                      voices={voices}
                      onChange={(next) => form.setValue("dialogue_characters", next, { shouldDirty: true })}
                      onGenerateReference={handleGenerateCharacterReference}
                      generatingCharacterId={generatingCharacterId}
                    />
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl bg-background/35 p-3 ring-1 ring-border/30">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Input mode
                      </p>
                      <div className="mt-2">
                        <ContentSourceTabs
                          value={contentSource}
                          onChange={setContentSourceCb}
                        />
                      </div>
                    </div>
                    {contentSource === "concept" ? (
                      <ConceptFields
                        generating={generating}
                        canGenerate={canGenerate}
                        onGenerate={triggerGenerate}
                        generateLabel={generateCtaLabel}
                        showInlineAction={false}
                      />
                    ) : (
                      <ScriptFields
                        generating={generating}
                        canGenerate={canGenerate}
                        onGenerate={triggerGenerate}
                        generateLabel={generateCtaLabel}
                        showInlineAction={false}
                        scriptFixWarning={scriptFixWarning}
                        scriptFixLoading={scriptAutoFixing}
                        onAutoFixScript={handleAutoFixScript}
                        footerAction={(
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-0 text-cyan-600 hover:bg-transparent hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                            onClick={() => setRefineDialogOpen(true)}
                          >
                            Refine current script and create relevant characters
                          </Button>
                        )}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {dialogueModeActive ? (
              <>
                <Card className="section-neon section-neon--content overflow-hidden border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
                  <CardHeader className="space-y-1 p-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Sparkles className="h-4 w-4" />
                      Workflow and timing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4 pt-0">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                      <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Workflow mode
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setPipelineMode("manual")}
                            className={`rounded-2xl border p-4 text-left transition-colors ${
                              pipelineMode === "manual" ? "border-cyan-500/40 bg-cyan-500/10" : "border-border/60 bg-background/35"
                            }`}
                          >
                            <p className="text-sm font-semibold text-foreground">Step-by-step</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Build dialogue scenes first, then continue refining in Studio.
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPipelineMode("auto")}
                            className={`rounded-2xl border p-4 text-left transition-colors ${
                              pipelineMode === "auto" ? "border-cyan-500/40 bg-cyan-500/10" : "border-border/60 bg-background/35"
                            }`}
                          >
                            <p className="text-sm font-semibold text-foreground">One-click</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Run the full dialogue pipeline automatically using the setup below.
                            </p>
                          </button>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Setup snapshot
                        </p>
                        <div className="mt-3">
                          <GenerateSummaryPanel control={form.control} variant="strip" />
                        </div>
                      </div>
                    </div>

                    <DialogueControlsCard />
                  </CardContent>
                </Card>

                <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
                  <CardHeader className="space-y-1 p-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Sparkles className="h-4 w-4" />
                      Story quality targets
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <StoryBriefCard />
                  </CardContent>
                </Card>

                <Card className="section-neon section-neon--visuals border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
                  <CardHeader className="space-y-1 p-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Layers className="h-4 w-4" />
                      Render basics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <VisualsCard
                      imageProviders={providers.image}
                      resolutions={resolutions}
                      transitions={transitions}
                      mode="dialogue"
                    />
                  </CardContent>
                </Card>

                <Card className="section-neon section-neon--audio border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
                  <CardHeader className="space-y-1 p-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Volume2 className="h-4 w-4" />
                      Audio
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <AudioCard
                      ttsProviders={providers.tts}
                      voices={voices}
                      musicList={musicList}
                      previewingVoice={previewingVoice}
                      uploadingMusic={uploadMusicMut.isPending}
                      onVoicePreview={handleVoicePreview}
                      onMusicUpload={handleMusicUpload}
                      isDialogueMode
                    />
                  </CardContent>
                </Card>

                <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
                  <CardHeader className="space-y-1 p-4 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Sparkles className="h-4 w-4" />
                      Captions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <SubtitleSettingsCard />
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        );
      case "tune":
        return (
          <div className="space-y-4">
            <Card className="section-neon section-neon--content overflow-hidden border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Sparkles className="h-4 w-4" />
                  Tune the generation flow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                  <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Workflow mode
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPipelineMode("manual")}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          pipelineMode === "manual" ? "border-cyan-500/40 bg-cyan-500/10" : "border-border/60 bg-background/35"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">Step-by-step</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Build the storyboard first, then continue refining scene-by-scene in Studio.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPipelineMode("auto")}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          pipelineMode === "auto" ? "border-cyan-500/40 bg-cyan-500/10" : "border-border/60 bg-background/35"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">One-click</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Run the full pipeline automatically using the setup from this wizard.
                        </p>
                      </button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Current tune summary
                    </p>
                    <div className="mt-3">
                      <GenerateSummaryPanel control={form.control} variant="strip" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Sparkles className="h-4 w-4" />
                  Story setup
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <StorySettingsCard
                  storyTypes={storyTypes}
                  llmProviders={providers.llm}
                />
              </CardContent>
            </Card>

            <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Sparkles className="h-4 w-4" />
                  Story quality targets
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <StoryBriefCard />
              </CardContent>
            </Card>

            <Card className="section-neon section-neon--visuals border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Layers className="h-4 w-4" />
                  Visual style
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <VisualsCard
                  imageProviders={providers.image}
                  resolutions={resolutions}
                  transitions={transitions}
                  mode="standard"
                />
              </CardContent>
            </Card>

            <Card className="section-neon section-neon--audio border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Volume2 className="h-4 w-4" />
                  Audio
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <AudioCard
                  ttsProviders={providers.tts}
                  voices={voices}
                  musicList={musicList}
                  previewingVoice={previewingVoice}
                  uploadingMusic={uploadMusicMut.isPending}
                  onVoicePreview={handleVoicePreview}
                  onMusicUpload={handleMusicUpload}
                  isDialogueMode={dialogueModeActive}
                />
              </CardContent>
            </Card>

            <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Sparkles className="h-4 w-4" />
                  Captions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <SubtitleSettingsCard />
              </CardContent>
            </Card>
          </div>
        );
      case "review":
        return (
          <div className="space-y-4">
            <Card className="section-neon section-neon--content overflow-hidden border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-1 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <CheckCircle2 className="h-4 w-4" />
                  Review and generate
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <GenerateSummaryPanel control={form.control} variant="banner" />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      default: {
        const unreachable: never = wizardStep;
        return unreachable;
      }
    }
  };

  return (
    <FormProvider {...form}>
      <CreationPageShell
        className="pb-24 text-slate-900 dark:text-slate-100"
        intro={(
          <section className="rounded-2xl border border-border/60 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <p className="text-sm font-semibold text-foreground">{currentStepMeta.label}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSupportPanelOpen((open) => !open)}>
                    {supportPanelOpen ? "Hide assist tools" : "Show assist tools"}
                  </Button>
                </div>
              </div>
              <LinearProgress value={wizardProgress} />
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {wizardSteps.map((step, index) => {
                  const active = step.id === wizardStep;
                  const completed = index < wizardStepIndex;
                  return (
                    <div
                      key={step.id}
                      className={`rounded-2xl border p-3 transition-colors ${
                        active
                          ? "border-primary/40 bg-primary/10"
                          : completed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border/60 bg-background/35"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current/20 text-xs font-semibold">
                          {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <p className="text-sm font-semibold text-foreground">{step.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      >
        <CreationActionBar
          className="top-3 mt-0"
          primaryLabel={primaryActionLabel}
          onPrimaryClick={() => {
            void goToNextStep();
          }}
          primaryDisabled={wizardStep === "review" ? (!canGenerate || generating) : generating}
          primaryLoading={wizardStep === "review" ? generating : false}
          primaryLoadingLabel={pipelineMode === "manual" ? "Creating scenes..." : "Creating video..."}
          secondaryActions={wizardSecondaryActions}
          helperText={actionHelperText}
        />

        {(pipelineTrackable || activeJobs.length > 0) && (
          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            {pipelineTrackable || activeJobs.length > 0 ? <GenerationPipeline /> : null}

            {activeJobs.length > 0 && (
              <Card className="section-neon section-neon--pipeline border-border/50 bg-card/80 shadow-sm backdrop-blur-sm" size="2">
                <CardHeader className="space-y-0 p-3 pb-2">
                  <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    Active tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-3 pb-3 pt-0">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{job.type.replace(/_/g, " ")}</span>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                              {engineStageLabel(
                                inferCurrentStage(job, jobPipelines[job.id], jobDetails[job.id]),
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {summarizeEngineOutcome(job, jobPipelines[job.id], jobDetails[job.id])}
                          </p>
                        </div>
                        <span className="font-medium tabular-nums">{job.progress}%</span>
                      </div>
                      <LinearProgress value={job.progress} />
                      {jobDetails[job.id] ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                          {jobDetails[job.id]}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        )}

        <section className="space-y-4">
          <div className="min-w-0">
            {renderWizardBody()}
          </div>

          {supportPanelOpen ? (
            <Card className="section-neon section-neon--content border-border/50 bg-card/75 shadow-sm backdrop-blur-sm" size="2">
              <CardHeader className="space-y-0 p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bookmark className="h-4 w-4" />
                  Assist tools
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 pt-0 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="h-full rounded-2xl border border-border/60 bg-background/35">
                  <CollapsibleCard
                    title="Preset bank"
                    icon={<Bookmark className="h-4 w-4" />}
                    collapsible={false}
                    className="flex h-full flex-col"
                    contentClassName="flex-1"
                  >
                    <GenerateTemplatesCard
                      templates={templates}
                      selectedTemplateId={selectedTemplateId}
                      onSelectedTemplateIdChange={setSelectedTemplateId}
                      saveName={templateName}
                      onSaveNameChange={setTemplateName}
                      saveDescription={templateDescription}
                      onSaveDescriptionChange={setTemplateDescription}
                      onApplySelected={handleApplyTemplate}
                      onSaveCurrent={handleSaveTemplate}
                      onDeleteSelected={handleDeleteTemplate}
                      saving={savingTemplate}
                      deleting={deletingTemplate}
                      loading={templatesLoading}
                    />
                  </CollapsibleCard>
                </div>

                <div className="h-full rounded-2xl border border-border/60 bg-background/35">
                  <CollapsibleCard
                    title="Idea feed"
                    icon={<Sparkles className="h-4 w-4" />}
                    collapsible={false}
                    className="flex h-full flex-col"
                    contentClassName="flex-1"
                  >
                    <ViralIdeasSection
                      setContentSource={setContentSourceCb}
                      validResolutionIds={resolutionIds}
                      validTransitionIds={transitionIds}
                      embedded
                      savedState={appliedIdeaFeedState}
                      refreshToken={ideaFeedRefreshToken}
                      onStateChange={setIdeaFeedState}
                    />
                  </CollapsibleCard>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <RefineScriptCharactersDialog
          open={refineDialogOpen}
          onOpenChange={setRefineDialogOpen}
          script={customScriptWatch || ""}
          storyType={storyTypeWatch}
          llmProvider={llmProviderWatch}
          llmModel={llmModelWatch}
          voices={voices}
          initialCharacters={Array.isArray(dialogueCharactersWatch) ? dialogueCharactersWatch : []}
          onApply={handleApplyRefinedScriptCharacters}
        />
      </CreationPageShell>
    </FormProvider>
  );
}
