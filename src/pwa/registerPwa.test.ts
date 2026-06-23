import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => () => {}),
}));

import { registerPwa } from './registerPwa';
import { registerSW } from 'virtual:pwa-register';

describe('registerPwa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the service worker and requests persistent storage', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist },
    });

    await registerPwa();

    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not throw when storage.persist is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: undefined,
    });

    await expect(registerPwa()).resolves.toBeUndefined();
    expect(registerSW).toHaveBeenCalledTimes(1);
  });
});
