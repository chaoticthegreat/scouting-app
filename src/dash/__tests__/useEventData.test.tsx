import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- supabase mock: a chainable query builder that resolves to {data,error} ---
interface BuilderResult {
  data: unknown;
  error: unknown;
}
const tableResults: Record<string, BuilderResult> = {};

function makeBuilder(result: BuilderResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'order', 'in', 'is']) {
    builder[method] = vi.fn(chain);
  }
  // Awaiting the builder resolves to the result.
  (builder as { then: unknown }).then = (
    resolve: (r: BuilderResult) => unknown,
  ) => resolve(result);
  return builder;
}

const fromMock = vi.fn((table: string) =>
  makeBuilder(tableResults[table] ?? { data: [], error: null }),
);

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

// --- proxies mock ---
const tbaGetMock = vi.fn();
const statboticsGetMock = vi.fn();
const nexusGetMock = vi.fn();
const epaFromTeamEventMock = vi.fn();
vi.mock('@/dash/proxies', () => ({
  tbaGet: (path: string) => tbaGetMock(path),
  statboticsGet: (path: string) => statboticsGetMock(path),
  nexusGet: (path: string) => nexusGetMock(path),
  epaFromTeamEvent: (json: unknown) => epaFromTeamEventMock(json),
}));

import type { MatchRow } from '../useEventData';
import {
  useEventReports,
  useEventMatches,
  useEventTeams,
  useEventScouts,
  useTbaRankings,
  useEventEpa,
  useNexusEventStatus,
} from '../useEventData';

/** Minimal played MatchRow factory for the local-EPA fallback tests. */
function playedMatch(o: Partial<MatchRow>): MatchRow {
  return {
    match_key: '2026casnv_qm1',
    event_key: '2026casnv',
    comp_level: 'qm',
    match_number: 1,
    scheduled_time: null,
    red1: null,
    red2: null,
    red3: null,
    blue1: null,
    blue2: null,
    blue3: null,
    actual_red_score: null,
    actual_blue_score: null,
    winner: null,
    result_synced_at: null,
    ...o,
  };
}
import { useActiveEvent } from '../useActiveEvent';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useEventData', () => {
  beforeEach(() => {
    fromMock.mockClear();
    tbaGetMock.mockReset();
    statboticsGetMock.mockReset();
    nexusGetMock.mockReset();
    epaFromTeamEventMock.mockReset();
    for (const k of Object.keys(tableResults)) delete tableResults[k];
  });

  it('useEventReports resolves rows from match_scouting_report', async () => {
    tableResults['match_scouting_report'] = {
      data: [{ target_team_number: 254, match_key: 'qm1' }],
      error: null,
    };
    const { result } = renderHook(() => useEventReports('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ target_team_number: 254, match_key: 'qm1' }]);
    expect(fromMock).toHaveBeenCalledWith('match_scouting_report');
  });

  it('useEventMatches resolves rows from match', async () => {
    tableResults['match'] = {
      data: [{ match_key: 'qm1', event_key: '2026casnv' }],
      error: null,
    };
    const { result } = renderHook(() => useEventMatches('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ match_key: 'qm1', event_key: '2026casnv' }]);
    expect(fromMock).toHaveBeenCalledWith('match');
  });

  it('useEventTeams resolves teams for the event', async () => {
    tableResults['event_team'] = {
      data: [{ team: { team_number: 254, nickname: 'Cheesy' } }],
      error: null,
    };
    const { result } = renderHook(() => useEventTeams('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ team_number: 254, nickname: 'Cheesy' }]);
  });

  it('useEventScouts resolves scouts for the event', async () => {
    tableResults['scout'] = {
      data: [{ id: 's1', display_name: 'Ada', event_key: '2026casnv' }],
      error: null,
    };
    const { result } = renderHook(() => useEventScouts('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 's1', display_name: 'Ada', event_key: '2026casnv' },
    ]);
    expect(fromMock).toHaveBeenCalledWith('scout');
  });

  it('useTbaRankings calls tbaGet with the rankings path', async () => {
    tbaGetMock.mockResolvedValue({ rankings: [] });
    const { result } = renderHook(() => useTbaRankings('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tbaGetMock).toHaveBeenCalledWith('/event/2026casnv/rankings');
  });

  it('does not run any query when eventKey is null (enabled guard)', async () => {
    renderHook(() => useEventReports(null), { wrapper: wrapper() });
    renderHook(() => useTbaRankings(null), { wrapper: wrapper() });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
    expect(tbaGetMock).not.toHaveBeenCalled();
  });

  it('useEventEpa builds an epaByTeam map and is available when EPA is present', async () => {
    statboticsGetMock.mockImplementation(async (path: string) =>
      path.includes('/254/') ? { epa: { total_points: { mean: 50 } } } : { available: false },
    );
    epaFromTeamEventMock.mockImplementation((json: unknown) =>
      json && (json as { epa?: unknown }).epa ? 50 : null,
    );

    const { result } = renderHook(() => useEventEpa([254, 1678], '2026casnv'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(true);
    expect(result.current.data?.source).toBe('statbotics');
    expect(result.current.data?.epaByTeam.get(254)).toBe(50);
    // 1678 came back unavailable → null in the map.
    expect(result.current.data?.epaByTeam.get(1678)).toBeNull();
  });

  it('useEventEpa source is none with no matches when Statbotics is down for every team', async () => {
    statboticsGetMock.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useEventEpa([254, 1678], '2026casnv'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(false);
    expect(result.current.data?.source).toBe('none');
    expect(result.current.data?.epaByTeam.get(254)).toBeNull();
    expect(result.current.data?.epaByTeam.get(1678)).toBeNull();
  });

  it('useEventEpa falls back to local EPA from matches when Statbotics is down', async () => {
    statboticsGetMock.mockResolvedValue({ available: false });

    const matches: MatchRow[] = [
      playedMatch({
        match_number: 1,
        red1: 254,
        red2: 1,
        red3: 2,
        blue1: 1678,
        blue2: 3,
        blue3: 4,
        actual_red_score: 90,
        actual_blue_score: 60,
      }),
    ];

    const { result } = renderHook(() => useEventEpa([254, 1678], '2026casnv', matches), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(true);
    expect(result.current.data?.source).toBe('local');
    // Winning red 254 should sit above losing blue 1678.
    const a = result.current.data?.epaByTeam.get(254) as number;
    const b = result.current.data?.epaByTeam.get(1678) as number;
    expect(a).toBeGreaterThan(b);
  });

  it('useNexusEventStatus parses live status when Nexus is available', async () => {
    nexusGetMock.mockResolvedValue({
      eventKey: '2026casnv',
      nowQueuing: 'Qualification 5',
      matches: [
        { label: 'Qualification 5', status: 'Now queuing', redTeams: ['1'], blueTeams: ['2'], times: {} },
      ],
    });

    const { result } = renderHook(() => useNexusEventStatus('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(true);
    expect(result.current.data?.status?.nowQueuing).toBe('Qualification 5');
    expect(nexusGetMock).toHaveBeenCalledWith('/event/2026casnv');
  });

  it('useNexusEventStatus degrades to unavailable when Nexus is down', async () => {
    nexusGetMock.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useNexusEventStatus('2026casnv'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(false);
    expect(result.current.data?.status).toBeNull();
  });
});

describe('useActiveEvent', () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const k of Object.keys(tableResults)) delete tableResults[k];
  });

  it('resolves the active event_key from the event table', async () => {
    tableResults['event'] = {
      data: [{ event_key: '2026casnv', is_active: true }],
      error: null,
    };
    const { result } = renderHook(() => useActiveEvent(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eventKey).toBe('2026casnv');
    expect(fromMock).toHaveBeenCalledWith('event');
  });

  it('returns a null eventKey when no event is active', async () => {
    tableResults['event'] = { data: [], error: null };
    const { result } = renderHook(() => useActiveEvent(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eventKey).toBeNull();
  });
});
