// src/dash/EventStream.tsx
// Pure, presentational embed for an event's live webcast on the broadcast-style
// admin dashboard. It takes a parsed TBA webcast descriptor via props and renders
// the matching iframe (YouTube or Twitch) in a responsive 16:9 frame, degrading
// to a centered placeholder whenever there's no usable stream (null webcast,
// unknown type, or missing ids).
//
// Deliberately does NO data fetching — props in, JSX out — so it's trivially
// unit-testable without a QueryClient. The pure `webcastEmbedSrc` helper that
// computes the iframe src is exported and tested directly. Nothing here throws;
// every missing/odd field falls through to the placeholder.

import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EventWebcast {
  /** TBA webcast type, e.g. 'youtube' | 'twitch' | 'livestream' | ... */
  type: string;
  /** Channel/video identifier (TBA `channel`). For youtube this is the video id OR channel; for twitch the channel name. */
  channel?: string | null;
  /** Optional secondary id (TBA `file`). For youtube, when present, `channel` may be a channel id and `file` the video id. */
  file?: string | null;
}

export interface EventStreamProps {
  webcast: EventWebcast | null;
  /** Page host for the Twitch `parent` param; defaults to window.location.hostname. */
  parentHost?: string;
  className?: string;
}

/** Default parent host for the Twitch `parent` param, safe under SSR/jsdom. */
function defaultParentHost(): string {
  return typeof window !== 'undefined' && window.location
    ? window.location.hostname
    : 'localhost';
}

/**
 * Compute the iframe src for a parsed webcast descriptor, or null when there's
 * nothing embeddable. Pure and defensive — never throws.
 *
 * - youtube: videoId = `file` (if non-empty) else `channel`; null if neither.
 * - twitch: requires `channel`; encodes it and includes the `parent` host.
 * - anything else (or null webcast): null.
 */
export function webcastEmbedSrc(
  webcast: EventWebcast | null | undefined,
  parentHost: string,
): string | null {
  if (!webcast) return null;
  const channel = typeof webcast.channel === 'string' ? webcast.channel : '';
  const file = typeof webcast.file === 'string' ? webcast.file : '';

  switch (webcast.type) {
    case 'youtube': {
      const videoId = file || channel;
      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}`;
    }
    case 'twitch': {
      if (!channel) return null;
      return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}`;
    }
    default:
      return null;
  }
}

function Frame({ children }: { children: React.ReactNode }): JSX.Element {
  // 16:9 responsive box.
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black/40">
      <div style={{ paddingTop: '56.25%' }} />
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export default function EventStream({
  webcast,
  parentHost,
  className,
}: EventStreamProps): JSX.Element {
  const host = parentHost ?? defaultParentHost();
  const src = webcastEmbedSrc(webcast, host);

  const body = src ? (
    <Frame>
      <iframe
        data-testid="dash-stream-frame"
        className="absolute inset-0 h-full w-full"
        src={src}
        title="Event livestream"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </Frame>
  ) : (
    <Frame>
      <span
        data-testid="dash-stream-none"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Radio className="size-4" /> No livestream available
      </span>
    </Frame>
  );

  return (
    <div data-testid="dash-stream" className={cn('w-full', className)}>
      {body}
    </div>
  );
}
