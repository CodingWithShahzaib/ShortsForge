"use client";

/**
 * react-player v3 — native controls, fullscreen, volume, seek.
 * Do not set `pip` here: programmatic PiP requires a user gesture and throws NotAllowedError.
 * Users can still use the browser's PiP control on the video when supported.
 * https://github.com/cookpete/react-player
 */

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

export type VideoPlayerProps = {
  /** Playback URL (react-player `src`). */
  url: string;
  className?: string;
  /** Responsive 16:9 (modals) vs fixed height (inline cards). */
  variant?: "responsive" | "fixed";
  /** Used when variant is `fixed`. */
  fixedHeight?: number;
  playing?: boolean;
};

export function VideoPlayer({
  url,
  className,
  variant = "responsive",
  fixedHeight = 480,
  playing,
}: VideoPlayerProps) {
  const responsive = variant === "responsive";
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg bg-black",
        responsive && "aspect-video max-h-[min(80vh,900px)] min-h-[200px]",
        className
      )}
      style={!responsive ? { height: fixedHeight } : undefined}
    >
      <ReactPlayer src={url} controls width="100%" height="100%" playing={playing} />
    </div>
  );
}
