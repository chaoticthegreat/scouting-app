// src/dash/__tests__/MatchView.test.tsx
// MATCHVIEW cluster test. Mocks the react-query data hooks. List the event's
// matches; clicking one shows every report on that match (across stations /
// teams / scouters) so the lead can cross-check.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MsrRow } from '@/dash/types';
import type { MatchRow, ScoutRow } from '@/dash/useEventData';

const useEventMatchesMock = vi.fn();
const useEventReportsMock = vi.fn();
const useEventScoutsMock = vi.fn();

vi.mock('@/dash/useEventData', () => ({
  useEventMatches: (eventKey: string | null) => useEventMatchesMock(eventKey),
  useEventReports: (eventKey: string | null) => useEventReportsMock(eventKey),
  useEventScouts: (eventKey: string | null) => useEventScoutsMock(eventKey),
}));

// MatchVideo (via MatchView) fetches the TBA match through tbaGet; keep it pending
// so the embed stays in its loading state and never touches the network.
vi.mock('@/dash/proxies', () => ({
  tbaGet: vi.fn(() => new Promise(() => {})),
}));

import MatchView from '@/dash/MatchView';

function renderView(eventKey: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MatchView eventKey={eventKey} />
    </QueryClientProvider>,
  );
}

function row(overrides: Partial<MsrRow>): MsrRow {
  return {
    target_team_number: 254,
    match_key: '2026casnv_qm1',
    alliance_color: 'red',
    station: 1,
    auto_fuel: 0,
    teleop_fuel_active: 0,
    teleop_fuel_inactive: 0,
    endgame_fuel: 0,
    fuel_points: 0,
    fuel_estimate_confidence: 1,
    fuel_by_shift: [0, 0, 0, 0],
    climb_level: 0,
    climb_attempted: false,
    climb_success: false,
    auto_left_starting_line: false,
    auto_climb_level1: false,
    defense_rating: 0,
    pins: 0,
    no_show: false,
    died: false,
    tipped: false,
    dropped_fuel: false,
    fed_corral: false,
    auto_start_position: null,
    auto_path: null,
    scout_id: null,
    notes: null,
    server_received_at: '2026-06-23T00:00:00Z',
    deleted: false,
    ...overrides,
  };
}

function match(overrides: Partial<MatchRow>): MatchRow {
  return {
    match_key: '2026casnv_qm1',
    event_key: '2026casnv',
    comp_level: 'qm',
    match_number: 1,
    scheduled_time: null,
    red1: 254,
    red2: 1678,
    red3: null,
    blue1: null,
    blue2: null,
    blue3: null,
    actual_red_score: null,
    actual_blue_score: null,
    winner: null,
    result_synced_at: null,
    ...overrides,
  };
}

const matches: MatchRow[] = [
  match({ match_key: '2026casnv_qm1', match_number: 1 }),
  match({ match_key: '2026casnv_qm2', match_number: 2 }),
];

const scouts: ScoutRow[] = [{ id: 's1', display_name: 'Ada', event_key: '2026casnv' }];

// qm1 has two reports (different teams/stations/scouters); qm2 has none.
const reports: MsrRow[] = [
  row({ match_key: '2026casnv_qm1', target_team_number: 254, station: 1, scout_id: 's1', fuel_points: 20 }),
  row({ match_key: '2026casnv_qm1', target_team_number: 1678, station: 2, scout_id: null, fuel_points: 8 }),
];

function querySuccess<T>(data: T) {
  return { data, isLoading: false, isError: false, isSuccess: true };
}
function queryLoading() {
  return { data: undefined, isLoading: true, isError: false, isSuccess: false };
}

beforeEach(() => {
  cleanup();
  useEventMatchesMock.mockReset();
  useEventReportsMock.mockReset();
  useEventScoutsMock.mockReset();
  useEventMatchesMock.mockReturnValue(querySuccess(matches));
  useEventReportsMock.mockReturnValue(querySuccess(reports));
  useEventScoutsMock.mockReturnValue(querySuccess(scouts));
});

describe('MatchView', () => {
  it('renders the shell and a match list with friendly labels', () => {
    const { getByTestId } = renderView("2026casnv");
    expect(getByTestId('dash-match')).toBeTruthy();
    const list = getByTestId('match-list');
    // Friendly labels, not raw match keys.
    expect(within(list).getByText('Qual 1')).toBeTruthy();
    expect(within(list).getByText('Qual 2')).toBeTruthy();
    expect(within(list).queryByText(/2026casnv_qm1/)).toBeNull();
  });

  it('shows a loading state while data is loading', () => {
    useEventMatchesMock.mockReturnValue(queryLoading());
    const { getByTestId } = renderView("2026casnv");
    expect(getByTestId('match-loading')).toBeTruthy();
  });

  it('shows a per-match report count in the list', () => {
    const { getByTestId } = renderView("2026casnv");
    expect(getByTestId('match-item-2026casnv_qm1').textContent).toContain('2');
    expect(getByTestId('match-item-2026casnv_qm2').textContent).toContain('0');
  });

  it('opens a match on click and shows every report with team/station/scouter', () => {
    const { getByTestId } = renderView("2026casnv");
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));

    const detail = getByTestId('match-detail');
    const scope = within(detail);
    // both target teams appear
    expect(scope.getByText(/254/)).toBeTruthy();
    expect(scope.getByText(/1678/)).toBeTruthy();
    // scouter name resolved for s1; "unassigned" / "—" for the null scout_id
    expect(scope.getByText(/Ada/)).toBeTruthy();
  });

  it('shows an empty state for a match with no reports', () => {
    const { getByTestId } = renderView("2026casnv");
    fireEvent.click(getByTestId('match-item-2026casnv_qm2'));
    expect(getByTestId('match-empty')).toBeTruthy();
  });

  it('shows the match video embed and a per-team activity timeline for the selected match', () => {
    const { getByTestId } = renderView("2026casnv");
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));

    // Video embed mounts (pending fetch → loading state).
    expect(getByTestId('match-video-loading')).toBeTruthy();

    // One timeline row per report, labelled with team number.
    const timelines = getByTestId('match-timelines');
    expect(getByTestId('match-timeline-254-1')).toBeTruthy();
    expect(getByTestId('match-timeline-1678-2')).toBeTruthy();
    expect(within(timelines).getByText(/Team 254/)).toBeTruthy();
  });

  it('puts the video before the report list in the detail grid (no-scroll layout)', () => {
    const { getByTestId } = renderView('2026casnv');
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));

    const grid = getByTestId('match-detail-grid');
    const video = getByTestId('match-video-sync');
    const detail = getByTestId('match-detail');
    // Both live inside the shared grid…
    expect(grid.contains(video)).toBe(true);
    expect(grid.contains(detail)).toBe(true);
    // …and the video card comes first in DOM order (top on mobile).
    expect(video.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the activity timelines before the report list (readable alongside the video)', () => {
    const { getByTestId } = renderView('2026casnv');
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));

    const timelines = getByTestId('match-timelines');
    const detail = getByTestId('match-detail');
    // Timelines sit above the reports list so they can be read alongside the video.
    expect(
      timelines.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the sync control disabled until a video time is known', () => {
    const { getByTestId } = renderView('2026casnv');
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));
    const syncBtn = getByTestId('match-sync-now') as HTMLButtonElement;
    expect(syncBtn.disabled).toBe(true);
  });

  it('degrades gracefully with no playhead before any video time arrives', () => {
    const { getByTestId, queryByTestId } = renderView('2026casnv');
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));
    // No video time yet → timelines render but carry no playhead.
    expect(getByTestId('match-timelines')).toBeTruthy();
    expect(queryByTestId('timeline-playhead')).toBeNull();
  });

  it('opens the full per-report detail in a sheet when a report row is tapped', () => {
    const { getByTestId, queryByTestId } = renderView("2026casnv");
    fireEvent.click(getByTestId('match-item-2026casnv_qm1'));

    // No report sheet yet.
    expect(queryByTestId('report-detail')).toBeNull();

    fireEvent.click(getByTestId('match-report-254-1'));
    const detail = getByTestId('report-detail');
    const scope = within(detail);
    // Full report detail surfaces the friendly match label and fuel breakdown.
    expect(getByTestId('report-match-label').textContent).toBe('Qual 1');
    expect(scope.getByText(/Teleop active/i)).toBeTruthy();
    expect(scope.getByText(/Fuel points/i)).toBeTruthy();
  });
});
