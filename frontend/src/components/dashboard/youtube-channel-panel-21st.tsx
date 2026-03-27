"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Loader2,
  Settings,
  Users,
  Video,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, getYoutubeAvatarUrl, type YouTubeChannelSummary } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type YoutubeChannelStatsPayload = Awaited<ReturnType<typeof api.youtubeChannelStats>>;

function formatStat(raw: string | undefined, hidden: boolean): string {
  if (hidden) return "Hidden";
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function channelHref(ch: NonNullable<YoutubeChannelStatsPayload["channel"]>): string {
  const h = (ch.custom_url || "").replace(/^@/, "").trim();
  if (h) return `https://www.youtube.com/@${h}`;
  if (ch.id) return `https://www.youtube.com/channel/${ch.id}`;
  return "https://www.youtube.com";
}

type Props = {
  data: YoutubeChannelStatsPayload | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError?: boolean;
  channels?: YouTubeChannelSummary[];
  activeChannelId?: string | null;
  onSelectChannel?: (channelId: string) => void;
  className?: string;
};

export function YoutubeChannelPanel21st({
  data,
  isLoading,
  isFetching,
  isError,
  channels = [],
  activeChannelId = null,
  onSelectChannel,
  className,
}: Props) {
  const [connecting, setConnecting] = useState(false);

  const onConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await api.youtubeAuthUrl();
      window.location.href = url;
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : "Could not start YouTube sign-in");
      setConnecting(false);
    }
  };

  const loaded = data !== undefined;
  const oauthReady = data?.oauth_ready ?? false;
  const connected = data?.connected ?? false;
  const activeChannel = channels.find((c) => c.channel_id === activeChannelId) || channels[0];

  if (loaded && !connected) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-xl border border-slate-200/80 dark:border-zinc-700/90 bg-white/90 dark:bg-zinc-900/85 px-4 py-4 shadow-sm sm:px-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 pb-3 dark:border-zinc-700/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 dark:bg-red-500/15">
            <Youtube className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              YouTube channel
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Subscribers, uploads, and views from your connected channel
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {channels.length > 1 ? (
            <select
              className="h-8 rounded-lg border border-slate-200/70 bg-white px-2 text-[11px] text-slate-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              value={activeChannelId || activeChannel?.channel_id || ""}
              onChange={(e) => onSelectChannel?.(e.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel.channel_id} value={channel.channel_id}>
                  {channel.channel_title || channel.channel_id}
                </option>
              ))}
            </select>
          ) : null}
          {isFetching && !isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
          ) : null}
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" asChild>
            <Link href="/settings">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      <div className="pt-4">
        {isError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Could not load YouTube stats. Check that the API is running and try refresh.
          </p>
        )}

        {!isError && !loaded && isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking YouTube connection…
          </div>
        )}

        {!isError && loaded && !oauthReady && (
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>To connect YouTube, try these quick steps:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ask your admin to add the YouTube keys in the system settings.</li>
              <li>
                Open{" "}
                <Link href="/settings" className="text-cyan-600 hover:underline dark:text-cyan-400">
                  Settings
                </Link>{" "}
                and finish the connection.
              </li>
              <li>Refresh this page after connecting.</li>
            </ul>
            <p className="text-[11px] text-slate-500 dark:text-slate-500">
              (Technical details: add <code className="rounded bg-slate-100 px-1 dark:bg-zinc-800">YOUTUBE_CLIENT_ID</code>{" "}
              and <code className="rounded bg-slate-100 px-1 dark:bg-zinc-800">YOUTUBE_CLIENT_SECRET</code> to{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-zinc-800">.env</code>.)
            </p>
          </div>
        )}

        {!isError && loaded && oauthReady && !connected && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <p>Your YouTube account is not connected yet.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Click Connect to sign in with YouTube.</li>
                <li>Pick the channel you want to link.</li>
                <li>Come back here to see stats.</li>
              </ul>
            </div>
            <Button
              type="button"
              className="shrink-0 gap-2 rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500"
              disabled={connecting}
              onClick={() => void onConnect()}
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
              Connect channel
            </Button>
          </div>
        )}

        {!isError && loaded && oauthReady && connected && isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading channel stats…
          </div>
        )}

        {!isError && loaded && oauthReady && connected && !isLoading && data?.error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{data.error}</span>
          </div>
        )}

        {!isError && loaded && oauthReady && connected && !isLoading && !data?.error && data?.channel && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="flex shrink-0 gap-3">
              {data.channel.thumbnail_url ? (
                <img
                  src={getYoutubeAvatarUrl(data.channel.thumbnail_url)}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-zinc-600"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 dark:border-zinc-600 dark:bg-zinc-800">
                  <Youtube className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex flex-col justify-center">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {data.channel.title || "Channel"}
                </p>
                <a
                  href={channelHref(data.channel)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline dark:text-cyan-400"
                >
                  View on YouTube
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Users className="h-3 w-3" />
                  Subscribers
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatStat(data.channel.subscriber_count, data.channel.hidden_subscriber_count)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Video className="h-3 w-3" />
                  Videos
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatStat(data.channel.video_count, false)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/50">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Eye className="h-3 w-3" />
                  Views
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatStat(data.channel.view_count, false)}
                </p>
              </div>
            </div>
          </div>
        )}

        {loaded && oauthReady && connected && !isLoading && !data?.error && !data?.channel && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No channel data returned. Try reconnecting in{" "}
            <Link href="/settings" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Settings
            </Link>
            .
          </p>
        )}
      </div>
    </motion.div>
  );
}
