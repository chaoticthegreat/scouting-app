// src/pwa/InstallPrompt.tsx
// Dismissible "Add to Home Screen" banner shown to SCOUTING users so they can run
// the app as a full-screen, offline PWA during matches. On Chrome/Android it
// replays the captured native install prompt; on iOS it shows Share-sheet
// instructions. Hides itself when already installed (standalone) or dismissed.
import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt, isStandalone, isIOS } from '@/pwa/useInstallPrompt';

const DISMISS_KEY = 'a2hs_dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallPrompt(): JSX.Element | null {
  const { canPrompt, installed, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);

  const standalone = isStandalone();
  const ios = isIOS();

  // Nothing to do when already installed, dismissed, or there's no way to install.
  if (installed || standalone || dismissed) return null;
  if (!canPrompt && !ios) return null;

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — non-fatal */
    }
    setDismissed(true);
  };

  return (
    <div
      data-testid="install-prompt"
      className="flex items-center gap-3 rounded-lg border border-brand/40 bg-brand/10 p-3"
    >
      <Download className="size-5 shrink-0 text-brand" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-foreground">Add this app to your home screen</p>
        {canPrompt ? (
          <p className="text-muted-foreground">
            Install it for a full-screen, offline-ready app during matches.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Tap the Share{' '}
            <Share className="inline size-4 align-text-bottom" /> button, then “Add to Home
            Screen”, for a full-screen, offline-ready app.
          </p>
        )}
      </div>
      {canPrompt ? (
        <Button
          data-testid="install-prompt-add"
          size="sm"
          className="min-h-[44px] shrink-0"
          onClick={() => void promptInstall()}
        >
          Add
        </Button>
      ) : null}
      <button
        type="button"
        data-testid="install-prompt-dismiss"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export default InstallPrompt;
