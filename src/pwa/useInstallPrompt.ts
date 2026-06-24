// src/pwa/useInstallPrompt.ts
// Add-to-home-screen (A2HS) plumbing. Chrome/Android fire `beforeinstallprompt`,
// which we capture and replay on demand so we can show OUR own "Add" button at a
// sensible moment (the scouting home) instead of relying on the browser's mini
// infobar. iOS Safari has no such event — installs are manual via the Share menu
// — so we also expose `isIOS()` / `isStandalone()` so the UI can fall back to
// instructions and hide itself once the app is already installed.
import { useEffect, useState } from 'react';

/** The non-standard event Chromium fires before showing its install UI. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** True when the app is already running as an installed PWA (standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return mm || iosStandalone;
}

/** True on iOS (where A2HS is a manual Share-sheet action, not an event). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export interface InstallPromptState {
  /** True when a native install prompt has been captured and can be replayed. */
  canPrompt: boolean;
  /** True once the app has been installed this session (appinstalled fired). */
  installed: boolean;
  /** Replay the captured prompt; resolves with the user's choice. */
  promptInstall: () => Promise<InstallOutcome>;
}

export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeInstall = (e: Event): void => {
      // Stop the browser's default mini-infobar; we surface our own control.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome;
  };

  return { canPrompt: deferred != null, installed, promptInstall };
}
