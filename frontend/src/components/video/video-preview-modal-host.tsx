"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useVideoPreviewStore } from "@/stores/videoPreviewStore";
import { VideoPlayer } from "@/components/video/video-player";
import { Button } from "@/components/ui/button";

export function VideoPreviewModalHost() {
  const open = useVideoPreviewStore((s) => s.open);
  const url = useVideoPreviewStore((s) => s.url);
  const title = useVideoPreviewStore((s) => s.title);
  const closePreview = useVideoPreviewStore((s) => s.closePreview);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closePreview]);

  if (!mounted || !open || !url) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Video preview: ${title}` : "Video preview"}
      onClick={() => closePreview()}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-white/10 bg-zinc-950 p-3 shadow-2xl sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200 sm:text-base">
            {title || "Video preview"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => closePreview()}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <VideoPlayer key={url} url={url} variant="responsive" />
      </div>
    </div>,
    document.body
  );
}
