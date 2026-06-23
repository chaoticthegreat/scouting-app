/**
 * Custom vitest environment that wraps the built-in jsdom environment and
 * restores Node.js's native AbortController / AbortSignal after jsdom
 * overwrites them.
 *
 * Motivation: React Router 6 data routers create `new Request(url, { signal })`
 * via `createClientSideRequest`. Node's built-in `Request` (undici) validates
 * `signal instanceof AbortSignal` using an internal class reference, not
 * `globalThis.AbortSignal`. When jsdom replaces `globalThis.AbortController`
 * (and thus the signals it produces), the undici validation fails in Node 18+.
 *
 * By restoring the native implementations after jsdom's `populateGlobal` call,
 * signals produced by `new AbortController()` in tests are always instances of
 * Node's native `AbortSignal`, satisfying undici's check.
 */
import { builtinEnvironments } from 'vitest/environments';
import type { Environment } from 'vitest/environments';

const jsdomCompat: Environment = {
  name: 'jsdom-compat',
  transformMode: 'web',

  async setup(global: typeof globalThis, options: Record<string, unknown>) {
    // Capture native implementations BEFORE jsdom's populateGlobal overwrites them.
    const NativeAbortController = global.AbortController;
    const NativeAbortSignal = global.AbortSignal;

    // Delegate to the built-in jsdom environment.
    const result = await builtinEnvironments.jsdom.setup(global, options);

    // Restore native AbortController / AbortSignal so that signals produced
    // in tests satisfy Node's undici Request signal validation.
    global.AbortController = NativeAbortController;
    global.AbortSignal = NativeAbortSignal;

    return result;
  },
};

export default jsdomCompat;
