// src/dash/useFullscreen.ts
// Tiny wrapper over the Fullscreen API for a single element — used to let a lead
// blow the broadcast "Next Match" view up to a full-screen kiosk display. Returns
// `supported` (false on browsers/elements without the API, e.g. iOS Safari) so
// callers can hide the control rather than show a dead button.
import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface FullscreenControl {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => void;
}

export function useFullscreen(ref: RefObject<HTMLElement | null>): FullscreenControl {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = (): void => {
      setIsFullscreen(document.fullscreenElement === ref.current && ref.current != null);
    };
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  const toggle = useCallback((): void => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else if (ref.current) {
      void ref.current.requestFullscreen?.();
    }
  }, [ref]);

  return { isFullscreen, supported, toggle };
}
