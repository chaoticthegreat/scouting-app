import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreen } from '@/dash/useFullscreen';

function makeRef(): { current: HTMLDivElement } {
  const el = document.createElement('div');
  (el as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = vi.fn(() =>
    Promise.resolve(),
  );
  return { current: el };
}

function setFullscreenElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = vi.fn(() =>
    Promise.resolve(),
  );
  setFullscreenElement(null);
});

describe('useFullscreen', () => {
  it('reports supported from document.fullscreenEnabled', () => {
    const { result } = renderHook(() => useFullscreen(makeRef()));
    expect(result.current.supported).toBe(true);
  });

  it('requests fullscreen on the element when not currently fullscreen', () => {
    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => result.current.toggle());
    expect(
      (ref.current as unknown as { requestFullscreen: () => void }).requestFullscreen,
    ).toHaveBeenCalled();
  });

  it('exits fullscreen when already fullscreen', () => {
    const ref = makeRef();
    setFullscreenElement(ref.current);
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => result.current.toggle());
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('tracks fullscreenchange events for our element', () => {
    const ref = makeRef();
    setFullscreenElement(ref.current);
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);
  });
});
