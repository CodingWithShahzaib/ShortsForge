"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";
import type { SafeZoneConfig, SafeZonePlatform } from "@/lib/types";

type OverlayTarget = "content" | "caption";
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const SAFE_ZONE_PRESETS: Record<SafeZonePlatform, SafeZoneConfig> = {
  tiktok: {
    platform: "tiktok",
    top_pct: 0.08,
    bottom_pct: 0.25,
    left_pct: 0.08,
    right_pct: 0.16,
    caption_band_left_pct: 0.12,
    caption_band_right_pct: 0.12,
    caption_band_top_pct: 0.6,
    caption_band_bottom_pct: 0.75,
  },
  instagram_reel: {
    platform: "instagram_reel",
    top_pct: 0.08,
    bottom_pct: 0.23,
    left_pct: 0.08,
    right_pct: 0.15,
    caption_band_left_pct: 0.12,
    caption_band_right_pct: 0.12,
    caption_band_top_pct: 0.6,
    caption_band_bottom_pct: 0.76,
  },
  youtube_short: {
    platform: "youtube_short",
    top_pct: 0.07,
    bottom_pct: 0.22,
    left_pct: 0.08,
    right_pct: 0.13,
    caption_band_left_pct: 0.12,
    caption_band_right_pct: 0.12,
    caption_band_top_pct: 0.6,
    caption_band_bottom_pct: 0.78,
  },
};

const CONTENT_MIN_WIDTH = 0.22;
const CONTENT_MIN_HEIGHT = 0.24;
const CAPTION_MIN_WIDTH = 0.2;
const CAPTION_MIN_HEIGHT = 0.08;

type InteractionState = {
  target: OverlayTarget;
  mode: "drag" | "resize";
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  containerWidth: number;
  containerHeight: number;
  startContentRect: Rect;
  startCaptionRect: Rect;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function rectFromConfig(config: SafeZoneConfig, target: OverlayTarget): Rect {
  if (target === "content") {
    return {
      x: config.left_pct,
      y: config.top_pct,
      width: 1 - config.left_pct - config.right_pct,
      height: 1 - config.top_pct - config.bottom_pct,
    };
  }
  return {
    x: config.caption_band_left_pct,
    y: config.caption_band_top_pct,
    width: 1 - config.caption_band_left_pct - config.caption_band_right_pct,
    height: config.caption_band_bottom_pct - config.caption_band_top_pct,
  };
}

function configFromRects(
  platform: SafeZonePlatform,
  contentRect: Rect,
  captionRect: Rect,
): SafeZoneConfig {
  return {
    platform,
    top_pct: contentRect.y,
    bottom_pct: 1 - contentRect.y - contentRect.height,
    left_pct: contentRect.x,
    right_pct: 1 - contentRect.x - contentRect.width,
    caption_band_left_pct: captionRect.x,
    caption_band_right_pct: 1 - captionRect.x - captionRect.width,
    caption_band_top_pct: captionRect.y,
    caption_band_bottom_pct: captionRect.y + captionRect.height,
  };
}

function clampContentRect(rect: Rect): Rect {
  const width = clamp(rect.width, CONTENT_MIN_WIDTH, 0.92);
  const height = clamp(rect.height, CONTENT_MIN_HEIGHT, 0.92);
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  };
}

function clampCaptionRect(rect: Rect): Rect {
  const width = clamp(rect.width, CAPTION_MIN_WIDTH, 0.94);
  const height = clamp(rect.height, CAPTION_MIN_HEIGHT, 0.6);
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  };
}

function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  const next = { ...rect };
  if (handle.includes("e")) {
    next.width += dx;
  }
  if (handle.includes("s")) {
    next.height += dy;
  }
  if (handle.includes("w")) {
    next.x += dx;
    next.width -= dx;
  }
  if (handle.includes("n")) {
    next.y += dy;
    next.height -= dy;
  }
  return next;
}

function nextConfigFromInteraction(
  config: SafeZoneConfig,
  interaction: InteractionState,
  clientX: number,
  clientY: number,
): SafeZoneConfig {
  const deltaX = (clientX - interaction.startX) / interaction.containerWidth;
  const deltaY = (clientY - interaction.startY) / interaction.containerHeight;
  const contentRect = { ...interaction.startContentRect };
  const captionRect = { ...interaction.startCaptionRect };

  if (interaction.target === "content") {
    const rawContent =
      interaction.mode === "drag"
        ? {
            ...contentRect,
            x: contentRect.x + deltaX,
            y: contentRect.y + deltaY,
          }
        : resizeRect(contentRect, interaction.handle ?? "se", deltaX, deltaY);
    const nextContent = clampContentRect(rawContent);
    const nextCaption = clampCaptionRect(captionRect);
    return configFromRects(config.platform, nextContent, nextCaption);
  }

  const rawCaption =
    interaction.mode === "drag"
      ? {
          ...captionRect,
          x: captionRect.x + deltaX,
          y: captionRect.y + deltaY,
        }
      : resizeRect(captionRect, interaction.handle ?? "se", deltaX, deltaY);
  const nextCaption = clampCaptionRect(rawCaption);
  return configFromRects(config.platform, contentRect, nextCaption);
}

export function resolveSafeZoneConfig(
  platform: SafeZonePlatform,
  config?: SafeZoneConfig | null,
): SafeZoneConfig {
  const preset = SAFE_ZONE_PRESETS[platform] ?? SAFE_ZONE_PRESETS.tiktok;
  return {
    ...preset,
    ...(config ?? {}),
    platform,
  };
}

export function SafeZoneOverlay({
  platform = "tiktok",
  config,
  className,
  editable = false,
  onChange,
  onCommit,
}: {
  platform?: SafeZonePlatform;
  config?: SafeZoneConfig | null;
  className?: string;
  editable?: boolean;
  onChange?: (config: SafeZoneConfig) => void;
  onCommit?: (config: SafeZoneConfig) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [activeTarget, setActiveTarget] = useState<OverlayTarget | null>(null);

  const resolvedConfig = useMemo(
    () => resolveSafeZoneConfig(platform, config),
    [config, platform],
  );

  const contentRect = useMemo(
    () => rectFromConfig(resolvedConfig, "content"),
    [resolvedConfig],
  );
  const captionRect = useMemo(
    () => rectFromConfig(resolvedConfig, "caption"),
    [resolvedConfig],
  );
  const latestConfigRef = useRef(resolvedConfig);

  useEffect(() => {
    latestConfigRef.current = resolvedConfig;
  }, [resolvedConfig]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const next = nextConfigFromInteraction(
        latestConfigRef.current,
        interaction,
        event.clientX,
        event.clientY,
      );
      latestConfigRef.current = next;
      onChange?.(next);
    };

    const handlePointerUp = () => {
      const next = latestConfigRef.current;
      setInteraction(null);
      setActiveTarget(null);
      onCommit?.(next);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [interaction, onChange, onCommit]);

  const beginInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    target: OverlayTarget,
    mode: "drag" | "resize",
    handle?: ResizeHandle,
  ) => {
    if (!editable) return;
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveTarget(target);
    setInteraction({
      target,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      containerWidth: bounds.width,
      containerHeight: bounds.height,
      startContentRect: contentRect,
      startCaptionRect: captionRect,
    });
  };

  const renderHandle = (
    target: OverlayTarget,
    handle: ResizeHandle,
    positionClassName: string,
  ) => (
    <button
      key={`${target}-${handle}`}
      type="button"
      aria-label={`Resize ${target} overlay`}
      className={cn(
        "absolute h-5 w-5 rounded-full border border-white/80 bg-background/90 shadow-sm transition",
        "flex items-center justify-center text-[10px] text-foreground/70",
        "hover:scale-105 hover:border-primary/70",
        positionClassName,
      )}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => beginInteraction(event, target, "resize", handle)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </button>
  );

  return (
    <div
      aria-hidden="true"
      ref={containerRef}
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <div
        className={cn(
          "absolute rounded-[24px] border border-dashed transition",
          editable
            ? "pointer-events-auto border-cyan-300/65 bg-cyan-300/4"
            : "border-cyan-300/45",
          activeTarget === "content" && "border-cyan-200 shadow-[0_0_0_1px_rgba(103,232,249,0.35)]",
        )}
        style={{
          top: pct(contentRect.y),
          left: pct(contentRect.x),
          width: pct(contentRect.width),
          height: pct(contentRect.height),
          touchAction: editable ? "none" : undefined,
        }}
        onPointerDown={(event) => beginInteraction(event, "content", "drag")}
      />
      <div
        className="absolute h-4 w-4 rounded-tl-[14px] border-l-2 border-t-2 border-cyan-300/80"
        style={{
          top: pct(contentRect.y),
          left: pct(contentRect.x),
          transform: "translate(-1px, -1px)",
        }}
      />
      <div
        className="absolute h-4 w-4 rounded-tr-[14px] border-r-2 border-t-2 border-cyan-300/80"
        style={{
          top: pct(contentRect.y),
          right: pct(1 - contentRect.x - contentRect.width),
          transform: "translate(1px, -1px)",
        }}
      />
      <div
        className="absolute h-4 w-4 rounded-bl-[14px] border-b-2 border-l-2 border-cyan-300/80"
        style={{
          bottom: pct(1 - contentRect.y - contentRect.height),
          left: pct(contentRect.x),
          transform: "translate(-1px, 1px)",
        }}
      />
      <div
        className="absolute h-4 w-4 rounded-br-[14px] border-b-2 border-r-2 border-cyan-300/80"
        style={{
          bottom: pct(1 - contentRect.y - contentRect.height),
          right: pct(1 - contentRect.x - contentRect.width),
          transform: "translate(1px, 1px)",
        }}
      />
      <div
        className={cn(
          "absolute rounded-xl border border-dashed bg-amber-300/6 transition",
          editable
            ? "pointer-events-auto border-amber-300/75"
            : "border-amber-300/55",
          activeTarget === "caption" && "border-amber-200 shadow-[0_0_0_1px_rgba(253,224,71,0.3)]",
        )}
        style={{
          top: pct(captionRect.y),
          left: pct(captionRect.x),
          width: pct(captionRect.width),
          height: pct(captionRect.height),
          touchAction: editable ? "none" : undefined,
        }}
        onPointerDown={(event) => beginInteraction(event, "caption", "drag")}
      />
      <div
        className="absolute border-t border-amber-200/60"
        style={{
          top: pct(captionRect.y),
          left: pct(captionRect.x),
          width: pct(captionRect.width),
        }}
      />
      <div
        className="pointer-events-none absolute z-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100"
        style={{
          top: `calc(${pct(contentRect.y)} - 10px)`,
          left: `calc(${pct(contentRect.x)} + 10px)`,
        }}
      >
        Frame
      </div>
      <div
        className="pointer-events-none absolute z-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100"
        style={{
          top: `calc(${pct(captionRect.y)} - 10px)`,
          left: `calc(${pct(captionRect.x)} + 10px)`,
        }}
      >
        Subtitles
      </div>
      <div
        className="pointer-events-none absolute flex items-center justify-center px-4 text-center text-[11px] font-semibold text-amber-100/90"
        style={{
          top: pct(captionRect.y),
          left: pct(captionRect.x),
          width: pct(captionRect.width),
          height: pct(captionRect.height),
        }}
      >
        Caption safe area
      </div>
      {editable ? (
        <>
          <div
            className="pointer-events-auto absolute"
            style={{
              top: pct(contentRect.y),
              left: pct(contentRect.x),
              width: pct(contentRect.width),
              height: pct(contentRect.height),
            }}
          >
            {renderHandle("content", "nw", "-left-2 -top-2")}
            {renderHandle("content", "ne", "-right-2 -top-2")}
            {renderHandle("content", "sw", "-left-2 -bottom-2")}
            {renderHandle("content", "se", "-right-2 -bottom-2")}
          </div>
          <div
            className="pointer-events-auto absolute"
            style={{
              top: pct(captionRect.y),
              left: pct(captionRect.x),
              width: pct(captionRect.width),
              height: pct(captionRect.height),
            }}
          >
            {renderHandle("caption", "nw", "-left-2 -top-2")}
            {renderHandle("caption", "ne", "-right-2 -top-2")}
            {renderHandle("caption", "sw", "-left-2 -bottom-2")}
            {renderHandle("caption", "se", "-right-2 -bottom-2")}
          </div>
        </>
      ) : null}
    </div>
  );
}
