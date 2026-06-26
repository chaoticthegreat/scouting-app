import { describe, it, expect } from 'vitest';
import { formatMatchKey, formatMatchKeyRaw, compareMatchKeys } from '../formatMatch';

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
  it('disambiguates best-of-3 finals and double-elim replays (no collapse)', () => {
    expect(formatMatchKeyRaw('2026casnv_f1m1')).toBe('Final 1');
    expect(formatMatchKeyRaw('2026casnv_f1m2')).toBe('Final 2');
    expect(formatMatchKeyRaw('2026casnv_f1m3')).toBe('Final 3');
    expect(formatMatchKeyRaw('2026casnv_sf3m2')).toBe('Semi 3-2');
  });
  it('handles bare tokens and empty input', () => {
    expect(formatMatchKeyRaw('qm7')).toBe('Qual 7');
    expect(formatMatchKeyRaw('')).toBe('');
    expect(formatMatchKeyRaw('garbage')).toBe('garbage');
  });
});

describe('compareMatchKeys', () => {
  it('orders by match number, not lexicographically (qm2 before qm10)', () => {
    const keys = ['2026casnv_qm10', '2026casnv_qm2', '2026casnv_qm1'];
    expect(keys.slice().sort(compareMatchKeys)).toEqual([
      '2026casnv_qm1',
      '2026casnv_qm2',
      '2026casnv_qm10',
    ]);
  });
  it('orders quals before playoffs before finals', () => {
    const keys = ['2026casnv_f1', '2026casnv_qm50', '2026casnv_sf3'];
    expect(keys.slice().sort(compareMatchKeys)).toEqual([
      '2026casnv_qm50',
      '2026casnv_sf3',
      '2026casnv_f1',
    ]);
  });
});
