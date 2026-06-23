import { registerSW } from 'virtual:pwa-register';

export async function registerPwa(): Promise<void> {
  registerSW({ immediate: true });

  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.persist === 'function'
  ) {
    try {
      await navigator.storage.persist();
    } catch {
      // Persistent storage is best-effort; ignore failures.
    }
  }
}
