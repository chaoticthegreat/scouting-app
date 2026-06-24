import { describe, it, expect } from 'vitest';
import { formatMatchKey, formatMatchKeyRaw } from '../formatMatch';

describe('formatMatchKey', () => {
  it('formats qualification matches', () => {
    expect(formatMatchKey('qm', 1)).toBe('Qual 1');
    expect(formatMatchKey('qm', 12)).toBe('Qual 12');
  });
  it('formats playoff levels', () => {
    expect(formatMatchKey('qf', 3)).toBe('Quarter 3');
    expect(formatMatchKey('sf', 1)).toBe('Semi 1');
    expect(formatMatchKey('f', 1)).toBe('Final 1');
    expect(formatMatchKey('ef', 2)).toBe('Eighth 2');
  });
  it('is case-insensitive and trims', () => {
    expect(formatMatchKey('QM', 5)).toBe('Qual 5');
    expect(formatMatchKey(' sf ', 2)).toBe('Semi 2');
  });
  it('falls back for unknown levels and missing numbers', () => {
    expect(formatMatchKey('pr', 4)).toBe('Pr 4');
    expect(formatMatchKey('qm', null)).toBe('Qual');
    expect(formatMatchKey('', null)).toBe('Match');
  });
});

describe('formatMatchKeyRaw', () => {
  it('parses event-prefixed raw keys', () => {
    expect(formatMatchKeyRaw('2026casnv_qm1')).toBe('Qual 1');
    expect(formatMatchKeyRaw('2026casnv_sf3')).toBe('Semi 3');
    expect(formatMatchKeyRaw('2026casnv_f1')).toBe('Final 1');
  });
  it('parses double-elim style tokens', () => {
    expect(formatMatchKeyRaw('2026casnv_sf3m1')).toBe('Semi 3');
  });
  it('handles bare tokens and empty input', () => {
    expect(formatMatchKeyRaw('qm7')).toBe('Qual 7');
    expect(formatMatchKeyRaw('')).toBe('');
    expect(formatMatchKeyRaw('garbage')).toBe('garbage');
  });
});
