import { useEffect, useState } from 'react';

/**
 * True when the viewport is in portrait orientation. Used to render the (very
 * wide) FieldDiagram rotated 90° so it's large and tappable on a phone held
 * vertically (the scout turns the phone sideways to view it upright). Re-renders
 * on orientation change. Defaults to portrait when matchMedia is unavailable
 * (SSR / jsdom).
 */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(orientation: portrait)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = (): void => setPortrait(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return portrait;
}
