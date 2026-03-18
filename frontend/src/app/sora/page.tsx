"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Film, Play, Edit, ChevronsRight, User, Trash2, Download,
  ImagePlus, Copy, Check, X, Upload, Clock, Sparkles,
  Layers, Palette, Plus, Minus, Monitor, Smartphone,
  LayoutGrid, Loader2,
} from "lucide-react";
import { api, getMediaUrl } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { DirectorBoard } from "@/components/sora/DirectorBoard";

type Tab = "generate" | "image-to-video" | "edit" | "extend" | "batch" | "characters" | "gallery" | "director-board";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const MODEL_OPTIONS = [
  { value: "sora-2", label: "Sora 2 (Fast)" },
  { value: "sora-2-pro", label: "Sora 2 Pro (Quality)" },
  { value: "sora-2-pro-2025-10-06", label: "Sora 2 Pro (Snapshot)" },
];

const SECONDS_OPTIONS = [
  { value: "4", label: "4s" },
  { value: "8", label: "8s" },
  { value: "12", label: "12s" },
  { value: "16", label: "16s" },
  { value: "20", label: "20s" },
];

const SORA_SIZE_OPTIONS = [
  { value: "1280x720", label: "1280x720 (Landscape)" },
  { value: "720x1280", label: "720x1280 (Portrait)" },
  { value: "1792x1024", label: "1792x1024 (Landscape Pro)" },
  { value: "1024x1792", label: "1024x1792 (Portrait Pro)" },
];

const ASPECT_RATIOS = [
  { id: "landscape", label: "Landscape", icon: Monitor, sizes: { "720p": "1280x720", pro: "1792x1024" } },
  { id: "portrait", label: "Portrait", icon: Smartphone, sizes: { "720p": "720x1280", pro: "1024x1792" } },
];

const PLATFORM_PRESETS = [
  { name: "YouTube", aspect: "landscape", res: "pro", seconds: "16" },
  { name: "TikTok", aspect: "portrait", res: "pro", seconds: "16" },
  { name: "Instagram Reel", aspect: "portrait", res: "pro", seconds: "8" },
  { name: "Twitter/X", aspect: "landscape", res: "720p", seconds: "8" },
];

const STYLE_PRESETS = [
  { id: "cinematic", label: "Cinematic", suffix: ", cinematic lighting, shallow depth of field, anamorphic lens flare, film grain, 35mm" },
  { id: "anime", label: "Anime", suffix: ", anime style, cel-shaded, vibrant colors, Studio Ghibli inspired, dynamic lines" },
  { id: "3d_render", label: "3D Render", suffix: ", 3D rendered, Pixar style, smooth textures, global illumination, octane render" },
  { id: "watercolor", label: "Watercolor", suffix: ", watercolor painting style, soft washes, paper texture, impressionist" },
  { id: "noir", label: "Film Noir", suffix: ", film noir style, high contrast black and white, dramatic shadows, 1940s aesthetic" },
  { id: "vhs", label: "VHS Retro", suffix: ", VHS aesthetic, scan lines, chromatic aberration, tape distortion, 80s/90s nostalgia" },
  { id: "dreamy", label: "Dreamy", suffix: ", dreamy ethereal atmosphere, soft focus, pastel tones, bokeh, magical lighting" },
  { id: "documentary", label: "Documentary", suffix: ", documentary style, handheld camera, natural lighting, realistic, photojournalism" },
  { id: "scifi", label: "Sci-Fi", suffix: ", science fiction, neon cyberpunk, holographic displays, futuristic technology" },
  { id: "vintage", label: "Vintage Film", suffix: ", vintage 8mm film, faded colors, light leaks, warm tones, nostalgic" },
];

const PROMPT_LIBRARY = [
  { category: "Nature", prompts: [
    "Aerial drone shot of a coral reef in crystal-clear turquoise water, tropical fish darting between vibrant coral formations, sunlight refracting through the surface",
    "Slow-motion macro shot of morning dew forming on a spider web, golden sunrise light catching each droplet like tiny prisms",
    "Time-lapse of storm clouds rolling over a vast prairie, lightning illuminating the horizon, dramatic golden hour light",
  ]},
  { category: "Urban", prompts: [
    "Tracking shot through neon-lit streets of Tokyo at night, rain reflecting city lights on the asphalt, crowds with umbrellas",
    "Overhead drone shot descending into a bustling European market square, colorful awnings and crowds, warm afternoon light",
    "Cinematic dolly shot through an abandoned art deco theater, dust particles floating in shafts of light from broken windows",
  ]},
  { category: "Abstract", prompts: [
    "Macro shot of ink dropping into water, swirling tendrils of cobalt blue and gold expanding in slow motion, black background",
    "Fluid simulation of mercury-like liquid forming impossible geometric shapes, reflective surface, studio lighting",
    "Kaleidoscopic fractal zoom through infinite recursive patterns, shifting from warm reds to cool blues, hypnotic motion",
  ]},
  { category: "Animals", prompts: [
    "Close-up of a snow leopard walking through a winter mountain pass, snowflakes falling, breath visible in cold air, golden hour",
    "Slow-motion underwater shot of a pod of dolphins leaping through waves, sunset silhouette, sparkling ocean spray",
    "Macro shot of a chameleon's eye slowly rotating to track a passing butterfly, vivid green scales, shallow depth of field",
  ]},
  { category: "Cinematic", prompts: [
    "Wide establishing shot of a lone astronaut standing on a red Martian plain, massive dust storm approaching on the horizon",
    "Tracking shot following a steam locomotive through a snow-covered mountain pass, smoke billowing, dramatic orchestral feeling",
    "Overhead shot slowly descending toward a Viking longship cutting through fog on a fjord, torches flickering, pre-dawn light",
  ]},
];

export default function SoraPage() {
  const [tab, setTab] = useState<Tab>("generate");
  const addJob = useProjectStore((s) => s.addJob);
  const jobs = useProjectStore((s) => s.jobs);
  const jobDetails = useProjectStore((s) => s.jobDetails);
  const defaults = useSettingsStore((s) => s.defaults);

  const [genForm, setGenForm] = useState({
    prompt: "",
    model: defaults.video_model,
    size: "1280x720",
    seconds: "8",
    input_image_url: "",
    remix_id: "",
    characters: [] as string[],
  });
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedAspect, setSelectedAspect] = useState("landscape");
  const [selectedRes, setSelectedRes] = useState("720p");
  const [showPromptLib, setShowPromptLib] = useState(false);
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);

  const [i2vForm, setI2vForm] = useState({ prompt: "", model: defaults.video_model, size: "1280x720", seconds: "8", image: null as File | null });
  const [editForm, setEditForm] = useState({ video_url: "", prompt: "", model: defaults.video_model });
  const [extendForm, setExtendForm] = useState({ video_url: "", prompt: "", model: defaults.video_model, seconds: "8" });
  const [charForm, setCharForm] = useState({ name: "", video_url: "" });
  const [selectedEditVideoId, setSelectedEditVideoId] = useState<string | null>(null);
  const [selectedExtendVideoId, setSelectedExtendVideoId] = useState<string | null>(null);
  const [selectedCharVideoId, setSelectedCharVideoId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<any[]>([]);
  const [soraVideos, setSoraVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [gallerySort, setGallerySort] = useState<"newest" | "oldest">("newest");

  const [batchItems, setBatchItems] = useState<{
    prompt: string;
    model: string;
    size: string;
    seconds: string;
    input_image_url?: string;
    remix_id?: string;
  }[]>([
    { prompt: "", model: defaults.video_model, size: "1280x720", seconds: "8", input_image_url: "", remix_id: "" },
  ]);
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    api.soraListCharacters().then(setCharacters).catch(() => {});
    api.soraListVideos(50).then(setSoraVideos).catch(() => {});
  }, []);

  useEffect(() => {
    const ar = ASPECT_RATIOS.find((a) => a.id === selectedAspect);
    if (!ar) return;
    const availableRes = Object.keys(ar.sizes);
    if (!availableRes.includes(selectedRes)) {
      setSelectedRes(availableRes[0]);
    }
    const newSize = ar.sizes[selectedRes as keyof typeof ar.sizes] || Object.values(ar.sizes)[0];
    setGenForm((f) => ({ ...f, size: newSize }));
  }, [selectedAspect, selectedRes]);

  useEffect(() => {
    return () => {
      if (refImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(refImagePreview);
      }
    };
  }, [refImagePreview]);

  const refreshVideos = () => api.soraListVideos(50).then(setSoraVideos).catch(() => {});

  const applyStyle = (styleId: string) => {
    if (selectedStyle === styleId) {
      setSelectedStyle(null);
      return;
    }
    setSelectedStyle(styleId);
  };

  const getFinalPrompt = () => {
    const style = STYLE_PRESETS.find((s) => s.id === selectedStyle);
    return style ? genForm.prompt + style.suffix : genForm.prompt;
  };

  const applyPlatformPreset = (preset: typeof PLATFORM_PRESETS[0]) => {
    setSelectedAspect(preset.aspect);
    setSelectedRes(preset.res);
    setGenForm((f) => ({ ...f, seconds: preset.seconds }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const payload: any = { ...genForm, prompt: getFinalPrompt() };
      if (refImageFile) {
        const formData = new FormData();
        formData.append("file", refImageFile);
        const uploadRes = await fetch(`${API_BASE}/api/images/upload`, { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Failed to upload reference image");
        const uploaded = await uploadRes.json();
        payload.input_image_url = `${API_BASE}${uploaded.url}`;
      }
      if (payload.characters.length === 0) delete payload.characters;
      if (!payload.input_image_url) delete payload.input_image_url;
      if (!payload.remix_id) delete payload.remix_id;
      const job = await api.soraGenerate(payload);
      addJob(job);
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleImageToVideo = async () => {
    if (!i2vForm.image || !i2vForm.prompt) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", i2vForm.image);
      const uploadRes = await fetch(`${API_BASE}/api/images/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Failed to upload image");
      const uploaded = await uploadRes.json();
      const imageUrl = `${API_BASE}${uploaded.url}`;
      const job = await api.soraGenerate({
        prompt: i2vForm.prompt, model: i2vForm.model, size: i2vForm.size, seconds: i2vForm.seconds, input_image_url: imageUrl,
      });
      addJob(job);
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleEdit = async () => {
    setLoading(true);
    try {
      const payload: any = { ...editForm };
      if (selectedEditVideoId) payload.video_id = selectedEditVideoId;
      const job = await api.soraEdit(payload);
      addJob(job);
    }
    catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleExtend = async () => {
    setLoading(true);
    try {
      const payload: any = { ...extendForm };
      if (selectedExtendVideoId) payload.video_id = selectedExtendVideoId;
      const job = await api.soraExtend(payload);
      addJob(job);
    }
    catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleBatchSubmit = async () => {
    const validItems = batchItems.filter((i) => i.prompt.trim());
    if (validItems.length === 0) return;
    setBatchLoading(true);
    try {
      const payloadItems = validItems.map((item) => {
        const cleaned: any = { ...item };
        if (!cleaned.input_image_url) delete cleaned.input_image_url;
        if (!cleaned.remix_id) delete cleaned.remix_id;
        return cleaned;
      });
      const jobs = await api.soraBatch(payloadItems);
      jobs.forEach(addJob);
      setBatchItems([{ prompt: "", model: defaults.video_model, size: "1280x720", seconds: "8", input_image_url: "", remix_id: "" }]);
    } catch (err: any) { alert(err.message); }
    finally { setBatchLoading(false); }
  };

  const handleCreateCharacter = async () => {
    if (!charForm.name || (!charForm.video_url && !selectedCharVideoId)) return;
    setLoading(true);
    try {
      const payload: any = { ...charForm };
      if (selectedCharVideoId) payload.video_id = selectedCharVideoId;
      const char = await api.soraCreateCharacter(payload);
      setCharacters((prev) => [char, ...prev]);
      setCharForm({ name: "", video_url: "" });
      setSelectedCharVideoId(null);
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleDeleteVideo = async (id?: string) => {
    if (!id) return;
    if (!confirm("Delete this Sora video?")) return;
    try {
      await api.soraDeleteVideo(id);
      setSoraVideos((prev) => prev.filter((v) => v.id !== id));
      await refreshVideos();
    } catch {}
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const resolveVideoUrl = (video: any) => getMediaUrl(video.video_url || video.video_path || video.url || video.file_path || "");
  const resolveThumbnailUrl = (video: any) =>
    getMediaUrl(video.thumbnail_url || video.thumbnail_path || video.thumbnail || "");

  const getVideoTimestamp = (video: any) => {
    if (!video?.created_at) return 0;
    const raw = Number(video.created_at);
    if (Number.isNaN(raw)) return 0;
    return String(video.created_at).length > 10 ? raw : raw * 1000;
  };

  const getVideoCreatedLabel = (video: any) => {
    const ts = getVideoTimestamp(video);
    if (!ts) return "Unknown time";
    return new Date(ts).toLocaleString();
  };

  const resolveVideoLabel = (video: any) => {
    if (video?.name) return video.name;
    if (video?.title) return video.title;
    const url = video?.video_url || video?.video_path || video?.url || video?.file_path;
    if (url) return url.split("/").pop();
    if (video?.created_at) {
      try {
        const timestamp = String(video.created_at).length > 10 ? Number(video.created_at) : Number(video.created_at) * 1000;
        return `Generated ${new Date(timestamp).toLocaleString()}`;
      } catch {}
    }
    return "Generated video";
  };

  const useVideoFor = (video: any, action: "edit" | "extend" | "character") => {
    const url = resolveVideoUrl(video);
    if (action === "edit") {
      setEditForm((f) => ({ ...f, video_url: url }));
      setSelectedEditVideoId(video?.id || null);
      setTab("edit");
      return;
    }
    if (action === "extend") {
      setExtendForm((f) => ({ ...f, video_url: url }));
      setSelectedExtendVideoId(video?.id || null);
      setTab("extend");
      return;
    }
    setCharForm((f) => ({ ...f, video_url: url }));
    setSelectedCharVideoId(video?.id || null);
    setTab("characters");
  };

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: "generate", icon: Play, label: "Generate" },
    { id: "image-to-video", icon: ImagePlus, label: "Image to Video" },
    { id: "edit", icon: Edit, label: "Edit" },
    { id: "extend", icon: ChevronsRight, label: "Extend" },
    { id: "batch", icon: Layers, label: "Batch" },
    { id: "director-board", icon: LayoutGrid, label: "Director Board" },
    { id: "characters", icon: User, label: "Characters" },
    { id: "gallery", icon: Film, label: "Gallery" },
  ];

  const soraJobs = jobs.filter((j) => j.type.startsWith("sora_"));
  const ar = ASPECT_RATIOS.find((a) => a.id === selectedAspect)!;

  return (
    <div className="space-y-6 max-w-none">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Film className="h-8 w-8" /> Studio</h1>
        <p className="text-zinc-500 mt-1">Generate, edit, extend videos with OpenAI Sora 2</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 pb-0">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── GENERATE ── */}
      {tab === "generate" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generate Video</CardTitle>
              <CardDescription>Describe shot type, subject, action, setting, and lighting for best results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea placeholder="Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead..." rows={4} value={genForm.prompt} onChange={(e) => setGenForm({ ...genForm, prompt: e.target.value })} />

              {/* Style presets */}
              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Palette className="h-4 w-4" />Style Preset</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_PRESETS.map((s) => (
                    <button key={s.id} onClick={() => applyStyle(s.id)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${selectedStyle === s.id ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect ratio + platform presets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Aspect Ratio</label>
                  <div className="flex gap-2">
                    {ASPECT_RATIOS.map((a) => (
                      <button key={a.id} onClick={() => setSelectedAspect(a.id)}
                        className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${selectedAspect === a.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"}`}>
                        <a.icon className={`h-5 w-5 ${selectedAspect === a.id ? "text-blue-600" : "text-zinc-400"}`} />
                        <span className="text-xs font-medium">{a.label}</span>
                      </button>
                    ))}
                  </div>
                  {Object.keys(ar.sizes).length > 1 && (
                    <div className="flex gap-2 mt-2">
                      {Object.keys(ar.sizes).map((res) => (
                        <button key={res} onClick={() => setSelectedRes(res)}
                          className={`px-3 py-1 text-xs rounded border transition-all ${selectedRes === res ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600" : "border-zinc-200 dark:border-zinc-800 text-zinc-500"}`}>
                          {res}{res === "pro" && " (Pro)"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Platform Presets</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_PRESETS.map((p) => (
                      <button key={p.name} onClick={() => applyPlatformPreset(p)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Model</label>
                  <Select value={genForm.model} onValueChange={(value) => setGenForm({ ...genForm, model: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><label className="text-sm font-medium mb-1.5 block">Size</label><Input value={genForm.size} readOnly className="bg-zinc-50 dark:bg-zinc-900" /></div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Duration</label>
                  <Select value={genForm.seconds} onValueChange={(value) => setGenForm({ ...genForm, seconds: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECONDS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium mb-1.5 block">Reference Image (optional)</label>
                  <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-center">
                    {refImagePreview ? (
                      <div className="space-y-3">
                        <img src={refImagePreview} alt="" className="max-h-40 mx-auto rounded-lg" />
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRefImageFile(null);
                              setRefImagePreview(null);
                            }}
                          >
                            <X className="h-4 w-4 mr-1" /> Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setRefImageFile(file);
                            setRefImagePreview(file ? URL.createObjectURL(file) : null);
                          }}
                          className="hidden"
                        />
                        <Upload className="h-6 w-6 mx-auto text-zinc-400 mb-2" />
                        <p className="text-sm text-zinc-500">Upload image (PNG, JPG, WebP)</p>
                      </label>
                    )}
                  </div>
                  <Input
                    placeholder="Or paste image URL"
                    value={genForm.input_image_url}
                    onChange={(e) => setGenForm({ ...genForm, input_image_url: e.target.value })}
                  />
                  <p className="text-xs text-zinc-500">Acts as first frame. Must match selected size.</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Remix Video ID (optional)</label>
                  <Input placeholder="video_..." value={genForm.remix_id} onChange={(e) => setGenForm({ ...genForm, remix_id: e.target.value })} />
                  <p className="text-xs text-zinc-500 mt-1">Use a previous video ID to remix with a new prompt.</p>
                </div>
              </div>

              {characters.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Characters (mention name in prompt)</label>
                  <div className="flex flex-wrap gap-2">
                    {characters.map((c) => {
                      const isSelected = genForm.characters.includes(c.character_id);
                      return (
                        <button key={c.id} onClick={() => setGenForm((f) => ({
                          ...f, characters: isSelected ? f.characters.filter((id) => id !== c.character_id) : [...f.characters, c.character_id],
                        }))} className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${isSelected ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-700 dark:text-blue-300" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"}`}>
                          <User className="h-3 w-3 inline mr-1" />{c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button variant="animated" onClick={handleGenerate} disabled={loading || !genForm.prompt} className="w-full">
                {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate Video</>}
              </Button>
            </CardContent>
          </Card>

          {/* Prompt Library */}
          <Card>
            <CardHeader>
              <button onClick={() => setShowPromptLib(!showPromptLib)} className="flex items-center justify-between w-full text-left">
                <CardTitle className="text-base">Prompt Library</CardTitle>
                <Badge variant="secondary" className="text-xs">{showPromptLib ? "Hide" : "Show"}</Badge>
              </button>
              {!showPromptLib && <CardDescription>Curated prompts to get you started. Click to use.</CardDescription>}
            </CardHeader>
            {showPromptLib && (
              <CardContent className="space-y-4">
                {PROMPT_LIBRARY.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{cat.category}</p>
                    <div className="space-y-2">
                      {cat.prompts.map((p, i) => (
                        <button key={i} onClick={() => setGenForm((f) => ({ ...f, prompt: p }))}
                          className="w-full text-left p-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ── IMAGE TO VIDEO ── */}
      {tab === "image-to-video" && (
        <Card>
          <CardHeader>
            <CardTitle>Image to Video</CardTitle>
            <CardDescription>Upload an image as the first frame and describe how the scene unfolds. Image should match the target resolution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 text-center">
              {i2vForm.image ? (
                <div className="space-y-3">
                  <img src={URL.createObjectURL(i2vForm.image)} alt="" className="max-h-48 mx-auto rounded-lg" />
                  <p className="text-sm text-zinc-500">{i2vForm.image.name}</p>
                  <Button variant="outline" size="sm" onClick={() => setI2vForm({ ...i2vForm, image: null })}>
                    <X className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(e) => setI2vForm({ ...i2vForm, image: e.target.files?.[0] || null })} className="hidden" />
                  <Upload className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
                  <p className="text-sm text-zinc-500">Click to upload an image (PNG, JPG, WebP)</p>
                </label>
              )}
            </div>
            <Textarea placeholder="She turns around and smiles, then slowly walks out of the frame..." rows={3} value={i2vForm.prompt} onChange={(e) => setI2vForm({ ...i2vForm, prompt: e.target.value })} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Model</label>
                <Select value={i2vForm.model} onValueChange={(value) => setI2vForm({ ...i2vForm, model: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Size</label>
                <Select value={i2vForm.size} onValueChange={(value) => setI2vForm({ ...i2vForm, size: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORA_SIZE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Duration</label>
                <Select value={i2vForm.seconds} onValueChange={(value) => setI2vForm({ ...i2vForm, seconds: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECONDS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="animated" onClick={handleImageToVideo} disabled={loading || !i2vForm.image || !i2vForm.prompt} className="w-full">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</> : <><ImagePlus className="h-4 w-4" /> Generate from Image</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── EDIT ── */}
      {tab === "edit" && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Video</CardTitle>
            <CardDescription>Make targeted changes to an existing video. Best for single, well-defined edits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Source Video URL</label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={editForm.video_url} onChange={(e) => { setEditForm({ ...editForm, video_url: e.target.value }); setSelectedEditVideoId(null); }} />
                <Button variant="outline" size="sm" onClick={() => setTab("gallery")}>Browse</Button>
              </div>
            </div>
            <Textarea placeholder="Shift the color palette to teal, sand, and rust..." rows={3} value={editForm.prompt} onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })} />
            <Select value={editForm.model} onValueChange={(value) => setEditForm({ ...editForm, model: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} disabled={loading || (!editForm.video_url && !selectedEditVideoId) || !editForm.prompt} className="w-full">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Editing...</> : <><Edit className="h-4 w-4" /> Edit Video</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── EXTEND ── */}
      {tab === "extend" && (
        <Card>
          <CardHeader>
            <CardTitle>Extend Video</CardTitle>
            <CardDescription>Continue a completed video (up to 6x, max 120s total). Preserves motion and continuity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Source Video URL</label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={extendForm.video_url} onChange={(e) => { setExtendForm({ ...extendForm, video_url: e.target.value }); setSelectedExtendVideoId(null); }} />
                <Button variant="outline" size="sm" onClick={() => setTab("gallery")}>Browse</Button>
              </div>
            </div>
            <Textarea placeholder="Continue the scene as the camera rises over the rooftops..." rows={3} value={extendForm.prompt} onChange={(e) => setExtendForm({ ...extendForm, prompt: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Model</label>
                <Select value={extendForm.model} onValueChange={(value) => setExtendForm({ ...extendForm, model: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Duration</label>
                <Select value={extendForm.seconds} onValueChange={(value) => setExtendForm({ ...extendForm, seconds: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECONDS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleExtend} disabled={loading || (!extendForm.video_url && !selectedExtendVideoId) || !extendForm.prompt} className="w-full">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Extending...</> : <><ChevronsRight className="h-4 w-4" /> Extend Video</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── BATCH ── */}
      {tab === "batch" && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Generation</CardTitle>
            <CardDescription>Queue up to 20 video generation jobs at once. Ideal for shot lists and scheduled renders.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {batchItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Badge variant="secondary" className="mt-2 text-xs font-mono">{idx + 1}</Badge>
                <div className="flex-1 space-y-2">
                  <Textarea placeholder="Describe the video..." rows={2} value={item.prompt} onChange={(e) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, prompt: e.target.value } : it))} />
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={item.model} onValueChange={(value) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, model: value } : it))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={item.size} onValueChange={(value) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, size: value } : it))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Size" />
                      </SelectTrigger>
                      <SelectContent>
                        {SORA_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={item.seconds} onValueChange={(value) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, seconds: value } : it))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECONDS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="Reference image URL (optional)"
                      value={item.input_image_url || ""}
                      onChange={(e) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, input_image_url: e.target.value } : it))}
                    />
                    <Input
                      placeholder="Remix video ID (optional)"
                      value={item.remix_id || ""}
                      onChange={(e) => setBatchItems((items) => items.map((it, i) => i === idx ? { ...it, remix_id: e.target.value } : it))}
                    />
                  </div>
                </div>
                {batchItems.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 mt-1 text-red-500" onClick={() => setBatchItems((items) => items.filter((_, i) => i !== idx))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBatchItems((items) => [...items, { prompt: "", model: defaults.video_model, size: "1280x720", seconds: "8", input_image_url: "", remix_id: "" }])} disabled={batchItems.length >= 20}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
              <span className="text-xs text-zinc-400 self-center">{batchItems.length}/20 items</span>
            </div>
            <Button onClick={handleBatchSubmit} disabled={batchLoading || batchItems.every((i) => !i.prompt.trim())} className="w-full">
              {batchLoading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</> : <><Layers className="h-4 w-4" /> Submit Batch ({batchItems.filter((i) => i.prompt.trim()).length} jobs)</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── DIRECTOR BOARD ── */}
      {tab === "director-board" && (
        <DirectorBoard
          onSendToGenerate={(prompt) => {
            setGenForm((f) => ({ ...f, prompt }));
            setTab("generate");
          }}
        />
      )}

      {/* ── CHARACTERS ── */}
      {tab === "characters" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Character</CardTitle>
              <CardDescription>Upload a short clip (2-4s, 720p-1080p) for a reusable non-human character. Mention the character name in prompts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Character name (e.g., Mossy, BlueFox)" value={charForm.name} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} />
              <div>
                <label className="text-sm font-medium mb-1.5 block">Source Video URL</label>
                <div className="flex gap-2">
                  <Input placeholder="https://..." value={charForm.video_url} onChange={(e) => { setCharForm({ ...charForm, video_url: e.target.value }); setSelectedCharVideoId(null); }} />
                  <Button variant="outline" size="sm" onClick={() => setTab("gallery")}>Browse</Button>
                </div>
              </div>
              <Button onClick={handleCreateCharacter} disabled={loading || !charForm.name || (!charForm.video_url && !selectedCharVideoId)}>
                {loading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><User className="h-4 w-4" /> Create Character</>}
              </Button>
            </CardContent>
          </Card>
          {characters.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Characters ({characters.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {characters.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                      <div>
                        <p className="font-medium flex items-center gap-2"><User className="h-4 w-4 text-blue-500" />{c.name}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-1">{c.character_id}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyText(c.character_id)}>
                        {copied === c.character_id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── GALLERY ── */}
      {tab === "gallery" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Sora Videos ({soraVideos.length})</h2>
              <div className="w-40">
                <Select value={gallerySort} onValueChange={(value) => setGallerySort(value as "newest" | "oldest")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refreshVideos}><Sparkles className="h-4 w-4 mr-1" /> Refresh</Button>
          </div>
          {soraVideos.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-zinc-500">No Sora videos yet. Generate your first one!</CardContent></Card>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              {[...soraVideos]
                .sort((a, b) => {
                  const aTime = getVideoTimestamp(a);
                  const bTime = getVideoTimestamp(b);
                  if (aTime === bTime) return 0;
                  return gallerySort === "newest" ? bTime - aTime : aTime - bTime;
                })
                .map((video) => {
                const videoUrl = resolveVideoUrl(video);
                const thumbnailUrl = resolveThumbnailUrl(video);
                const videoKey = videoUrl || video.id || resolveVideoLabel(video);
                return (
                <Card key={videoKey} className="overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                  <div className="aspect-video bg-zinc-900 relative">
                    {previewVideo === videoKey ? (
                      videoUrl ? (
                        <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" onEnded={() => setPreviewVideo(null)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">No video URL</div>
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => video.status === "completed" && setPreviewVideo(videoKey)}>
                        {video.status === "completed" ? (
                          <>
                            {thumbnailUrl ? (
                              <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            ) : videoUrl ? (
                              <video src={videoUrl} muted preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><Film className="h-12 w-12 text-zinc-600" /></div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"><Play className="h-10 w-10 text-white" /></div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900">
                            {(video.status === "in_progress" || video.status === "queued") && (
                              <>
                                <Loader2 className="h-10 w-10 text-zinc-500 animate-spin mb-3" />
                                <span className="text-sm font-medium text-zinc-400">
                                  {video.status === "queued" ? "Queued" : "Rendering"}
                                </span>
                                <div className="w-3/4 max-w-[140px] mt-3 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                                  <div
                                    className="h-full bg-cyan-500/80 rounded-full transition-all duration-300"
                                    style={{ width: `${video.progress ?? 0}%` }}
                                  />
                                </div>
                              </>
                            )}
                            {video.status === "failed" && (
                              <Badge variant="destructive" className="text-xs">{video.status}</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant={video.status === "completed" ? "default" : video.status === "failed" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                          {video.status === "in_progress" ? "Rendering" : video.status === "queued" ? "Queued" : video.status}
                        </Badge>
                        <span className="text-[10px] text-zinc-400 truncate">{video.model || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          {video.seconds ? `${video.seconds}s` : "—"}
                        </span>
                        <span>{video.size || "—"}</span>
                      </div>
                    </div>
                    <div className="space-y-1 min-h-[2.5rem]">
                      {(video.status === "completed" || video.status === "failed") ? (
                        <>
                          <p className="text-xs text-zinc-500 truncate" title={resolveVideoLabel(video)}>{resolveVideoLabel(video)}</p>
                          {getVideoTimestamp(video) > 0 && (
                            <p className="text-[10px] text-zinc-500">Created {getVideoCreatedLabel(video)}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          {video.status === "queued" ? "Waiting in queue…" : `Rendering… ${video.progress ?? 0}%`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1 min-w-0" onClick={() => videoUrl && handleCopyText(videoUrl)} disabled={!videoUrl} title="Copy URL">
                        {copied === videoUrl ? <><Check className="h-3 w-3 mr-0.5 shrink-0" />Copied</> : <><Copy className="h-3 w-3 mr-0.5 shrink-0" />Copy URL</>}
                      </Button>
                      {video.status === "completed" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => useVideoFor(video, "edit")} title="Edit"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => useVideoFor(video, "extend")} title="Extend"><ChevronsRight className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => useVideoFor(video, "character")} title="Character"><User className="h-3 w-3" /></Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 shrink-0" onClick={() => handleDeleteVideo(video.id)} title="Delete" disabled={!video.id}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );})}
            </div>
          )}
        </div>
      )}

      {/* ── RECENT RESULTS ── */}
      {soraJobs.filter((j) => j.status === "completed" || j.status === "failed").length > 0 && tab === "generate" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Results</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {soraJobs.filter((j) => j.status === "completed" || j.status === "failed").slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{job.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                  <Badge variant={job.status === "completed" ? "default" : "destructive"}>{job.status}</Badge>
                </div>
                {job.status === "completed" && (job.result?.video_url || job.result?.video_path) && (() => {
                  const url = getMediaUrl(job.result.video_url || job.result.video_path);
                  return url ? <a href={url} download><Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button></a> : null;
                })()}
                {job.status === "failed" && job.error && (
                  <p className="text-xs text-red-500 max-w-xs truncate">{typeof job.error === "object" ? (job.error as any).message : String(job.error)}</p>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setTab("gallery"); refreshVideos(); }}>View All in Gallery</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
