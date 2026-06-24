// Single source of truth for human-readable match labels. Scouting data stores
// raw keys like "2026casnv_qm1" and comp levels like "qm"/"sf"/"f"; users should
// never have to decipher those. Use formatMatchKey when you have comp_level +
// match_number, or formatMatchKeyRaw when all you have is the raw match key.

const LEVEL_LABEL: Record<string, string> = {
  qm: 'Qual',
  q: 'Qual',
  qual: 'Qual',
  ef: 'Eighth',
  qf: 'Quarter',
  sf: 'Semi',
  f: 'Final',
  final: 'Final',
};

/** "qm", 12 -> "Qual 12". Unknown levels fall back to a capitalized label. */
export function formatMatchKey(
  compLevel: string | null | undefined,
  matchNumber: number | null | undefined,
): string {
  const level = (compLevel ?? '').trim().toLowerCase();
  const label =
    LEVEL_LABEL[level] ??
    (level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Match');
  const n = matchNumber == null || Number.isNaN(matchNumber) ? '' : ` ${matchNumber}`;
  return `${label}${n}`.trim();
}

/**
 * "2026casnv_qm1" -> "Qual 1". Parses the trailing "<level><number>" token.
 * Falls back to the raw key if it can't be parsed.
 */
export function formatMatchKeyRaw(matchKey: string | null | undefined): string {
  if (!matchKey) return '';
  // Take the part after the event code, e.g. "2026casnv_qm1" -> "qm1".
  const tail = matchKey.includes('_') ? matchKey.slice(matchKey.lastIndexOf('_') + 1) : matchKey;
  // Double-elim keys can look like "sf3m1"; prefer the leading level + first number.
  const m = tail.match(/^([a-zA-Z]+)(\d+)/);
  if (!m) return matchKey;
  return formatMatchKey(m[1], Number(m[2]));
}
