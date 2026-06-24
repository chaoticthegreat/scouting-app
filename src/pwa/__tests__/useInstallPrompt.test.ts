import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstallPrompt } from '@/pwa/useInstallPrompt';

function fireBeforeInstall(): { prompt: ReturnType<typeof vi.fn> } {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  window.dispatchEvent(e);
  return e;
}

describe('useInstallPrompt', () => {
  it('captures beforeinstallprompt and exposes canPrompt', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canPrompt).toBe(false);
    act(() => {
      fireBeforeInstall();
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it('replays the captured prompt and clears it', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let evt!: { prompt: ReturnType<typeof vi.fn> };
    act(() => {
      evt = fireBeforeInstall();
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(evt.prompt).toHaveBeenCalled();
    expect(outcome).toBe('accepted');
    expect(result.current.canPrompt).toBe(false);
  });

  it('returns "unavailable" when there is no captured prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('unavailable');
  });

  it('marks installed when appinstalled fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.installed).toBe(true);
  });
});
