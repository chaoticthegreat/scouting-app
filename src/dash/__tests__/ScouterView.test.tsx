// src/dash/__tests__/ScouterView.test.tsx
// SCOUTERVIEW cluster test. Mocks the react-query data hooks so the view is a
// pure presentation component: list the event's scouters, click one to open a
// profile = report count, matches/teams covered, avg fuel points, reliability
// flags, and a per-report list.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MsrRow } from '@/dash/types';
import type { ScoutRow } from '@/dash/useEventData';

const useEventScoutsMock = vi.fn();
const useEventReportsMock = vi.fn();
const deleteScoutMock = vi.fn();

vi.mock('@/dash/useEventData', () => ({
  useEventScouts: (eventKey: string | null) => useEventScoutsMock(eventKey),
  useEventReports: (eventKey: string | null) => useEventReportsMock(eventKey),
}));

vi.mock('@/dash/scoutAdminClient', () => ({
  deleteScout: (id: string) => deleteScoutMock(id),
}));

import ScouterView from '@/dash/ScouterView';

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ScouterView eventKey="2026casnv" />
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

const scouts: ScoutRow[] = [
  { id: 's1', display_name: 'Ada', event_key: '2026casnv' },
  { id: 's2', display_name: 'Babbage', event_key: '2026casnv' },
];

// Ada submitted two reports (one with a no-show flag); Babbage submitted none.
const reports: MsrRow[] = [
  row({
    scout_id: 's1',
    match_key: '2026casnv_qm1',
    target_team_number: 254,
    fuel_points: 20,
  }),
  row({
    scout_id: 's1',
    match_key: '2026casnv_qm2',
    target_team_number: 1678,
    fuel_points: 10,
    no_show: true,
  }),
];

function querySuccess<T>(data: T) {
  return { data, isLoading: false, isError: false, isSuccess: true };
}
function queryLoading() {
  return { data: undefined, isLoading: true, isError: false, isSuccess: false };
}

beforeEach(() => {
  cleanup();
  useEventScoutsMock.mockReset();
  useEventReportsMock.mockReset();
  deleteScoutMock.mockReset();
  useEventScoutsMock.mockReturnValue(querySuccess(scouts));
  useEventReportsMock.mockReturnValue(querySuccess(reports));
});

describe('ScouterView', () => {
  it('renders the shell and a scouter list', () => {
    const { getByTestId } = renderView();
    expect(getByTestId('dash-scouter')).toBeTruthy();
    const list = getByTestId('scouter-list');
    expect(within(list).getByText(/Ada/)).toBeTruthy();
    expect(within(list).getByText(/Babbage/)).toBeTruthy();
  });

  it('shows a loading state while data is loading', () => {
    useEventScoutsMock.mockReturnValue(queryLoading());
    const { getByTestId } = renderView();
    expect(getByTestId('scouter-loading')).toBeTruthy();
  });

  it('shows a per-scouter report count in the list', () => {
    const { getByTestId } = renderView();
    const adaItem = getByTestId('scouter-item-s1');
    expect(adaItem.textContent).toContain('2');
    const babItem = getByTestId('scouter-item-s2');
    expect(babItem.textContent).toContain('0');
  });

  it('opens a scouter profile on click with count, coverage, avg fuel and reliability', () => {
    const { getByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-item-s1'));

    const profile = getByTestId('scouter-profile');
    const scope = within(profile);
    // 2 reports
    expect(scope.getByTestId('scouter-report-count').textContent).toContain('2');
    // teams covered: 254 + 1678
    expect(scope.getByTestId('scouter-teams-covered').textContent).toContain('2');
    // matches covered: qm1 + qm2
    expect(scope.getByTestId('scouter-matches-covered').textContent).toContain('2');
    // avg fuel points = (20 + 10) / 2 = 15
    expect(scope.getByTestId('scouter-avg-fuel').textContent).toContain('15');
    // reliability flag: one no-show
    expect(scope.getByTestId('scouter-flags').textContent?.toLowerCase()).toContain('no-show');
  });

  it('lists the scouter per-report rows with friendly labels', () => {
    const { getByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-item-s1'));
    const list = getByTestId('scouter-report-list');
    const scope = within(list);
    expect(scope.getByText(/Qual 1/)).toBeTruthy();
    expect(scope.getByText(/Qual 2/)).toBeTruthy();
    expect(scope.queryByText(/2026casnv_qm/)).toBeNull();
  });

  it('opens the full per-report detail in a sheet when a report row is tapped', () => {
    const { getByTestId, queryByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-item-s1'));
    expect(queryByTestId('report-detail')).toBeNull();

    fireEvent.click(getByTestId('scouter-report-0'));
    const detail = getByTestId('report-detail');
    expect(detail).toBeTruthy();
    expect(getByTestId('report-match-label').textContent).toBe('Qual 1');
    expect(within(detail).getByText(/Fuel points/i)).toBeTruthy();
  });

  it('shows an empty profile for a scouter with no reports', () => {
    const { getByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-item-s2'));
    expect(getByTestId('scouter-report-count').textContent).toContain('0');
    expect(getByTestId('scouter-empty')).toBeTruthy();
  });

  it('requires a confirm before removing a scouter, and can be cancelled', () => {
    const { getByTestId, queryByTestId } = renderView();
    // First click reveals the confirm/cancel controls — does NOT delete yet.
    fireEvent.click(getByTestId('scouter-remove-s1'));
    expect(getByTestId('scouter-remove-confirm-s1')).toBeTruthy();
    expect(deleteScoutMock).not.toHaveBeenCalled();
    // Cancel returns to the plain remove button.
    fireEvent.click(getByTestId('scouter-remove-cancel-s1'));
    expect(queryByTestId('scouter-remove-confirm-s1')).toBeNull();
    expect(getByTestId('scouter-remove-s1')).toBeTruthy();
    expect(deleteScoutMock).not.toHaveBeenCalled();
  });

  it('permanently deletes the scouter (and their data) on confirm', async () => {
    deleteScoutMock.mockResolvedValue(undefined);
    const { getByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-remove-s1'));
    fireEvent.click(getByTestId('scouter-remove-confirm-s1'));
    await waitFor(() => expect(deleteScoutMock).toHaveBeenCalledWith('s1'));
  });

  it('surfaces an error when the delete fails', async () => {
    deleteScoutMock.mockRejectedValue(new Error('nope'));
    const { getByTestId } = renderView();
    fireEvent.click(getByTestId('scouter-remove-s1'));
    fireEvent.click(getByTestId('scouter-remove-confirm-s1'));
    await waitFor(() => expect(getByTestId('scouter-remove-error').textContent).toContain('nope'));
  });
});
