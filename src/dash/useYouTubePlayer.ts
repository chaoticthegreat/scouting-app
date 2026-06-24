// src/dash/useYouTubePlayer.ts
// Loads the official YouTube IFrame Player API (window.YT) via one shared script
// injection, then attaches a YT.Player to a given iframe element so we can read
// live playback position. Used by MatchVideo to expose currentTime up to
// MatchView for syncing the activity timelines to the running match video.
//
// Graceful by design: if the API never loads (offline, blocked, test env) or the
// element is absent, the hook simply never reports a time and callers degrade to
// a video with no playhead. Nothing here throws.

import { useEffect, useRef } from 'react';

// Minimal shape of the bits of the YT API we touch — keeps us off a new dep.
interface YTPlayer {
  getCurrentTime?: () => number;
  destroy?: () => void;
}
interface YTPlayerCtorOptions {
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
  };
}
interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerCtorOptions) => YTPlayer;
  PlayerState?: { PLAYING?: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';
const POLL_MS = 250;

// Resolves once window.YT.Player is available. Shared across all callers so the
// script is injected at most once. Rejects nothing — pending forever if it never
// loads, which is fine because callers tear down on unmount.
let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return new Promise<YTNamespace>(() => {});
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve) => {
    const ready = () => {
      if (window.YT && window.YT.Player) resolve(window.YT);
    };
    // The API calls this global when it finishes loading. Chain any prior hook.
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      ready();
    };
    // If the script tag already exists (e.g. another mount), just wait for ready.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = SCRIPT_SRC;
      tag.async = true;
      document.head.appendChild(tag);
    }
    // Belt-and-suspenders: in case the API was already present.
    ready();
  });
  return apiPromise;
}

export interface UseYouTubePlayerOptions {
  /** The iframe element to attach the YT.Player to (or null until mounted). */
  iframe: HTMLIFrameElement | null;
  /** Whether to attach at all (e.g. only when a video key exists). */
  enabled: boolean;
  /** Called ~4x/sec with the live playback position in milliseconds. */
  onTimeMs: (ms: number) => void;
}

/**
 * Attaches a YT.Player to `iframe` and polls its currentTime, reporting it (in
 * ms) through onTimeMs. Cleans up the player + interval on unmount or when the
 * iframe/enabled inputs change. Never throws; if the API can't load, onTimeMs is
 * simply never called.
 */
export function useYouTubePlayer({ iframe, enabled, onTimeMs }: UseYouTubePlayerOptions): void {
  // Keep the latest callback without re-running the attach effect each render.
  const onTimeRef = useRef(onTimeMs);
  onTimeRef.current = onTimeMs;

  useEffect(() => {
    if (!enabled || !iframe) return;
    let cancelled = false;
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => {
        const t = player?.getCurrentTime?.();
        if (typeof t === 'number' && Number.isFinite(t)) onTimeRef.current(t * 1000);
      }, POLL_MS);
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        try {
          player = new YT.Player(iframe, {
            events: {
              onReady: () => startPolling(),
              onStateChange: () => startPolling(),
            },
          });
        } catch {
          // Constructing the player failed — degrade silently to no playhead.
        }
      })
      .catch(() => {
        /* never rejects, but stay defensive */
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        player?.destroy?.();
      } catch {
        /* ignore teardown errors */
      }
    };
  }, [iframe, enabled]);
}
