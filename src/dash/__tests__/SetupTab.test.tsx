import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/dash/useActiveEvent', () => ({
  useActiveEvent: () => ({ eventKey: '2026demo', loading: false }),
}));

const setActiveEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/dash/setActiveEvent', () => ({
  setActiveEvent: (...a: unknown[]) => setActiveEventMock(...a),
}));

// Stub admin children to keep the test focused on SetupTab wiring.
vi.mock('@/admin/EventSetup', () => ({
  EventSetup: (props: { onImported: (k: string) => void }) => (
    <button data-testid="import-stub" onClick={() => props.onImported('2026new')}>
      import
    </button>
  ),
}));
vi.mock('@/admin/ScheduleView', () => ({ ScheduleView: () => <div data-testid="schedule-stub" /> }));
vi.mock('@/admin/AssignmentBoard', () => ({ AssignmentBoard: () => <div data-testid="assign-stub" /> }));

const EVENTS = [
  { event_key: '2026casnv', name: 'Silicon Valley', is_active: true },
  { event_key: '2026caetb', name: 'East Bay', is_active: false },
];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        // loadEventData: match/scout queries (select -> eq [-> order]).
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        // loadEvents: event query (select -> order), returns the imported events.
        order: () =>
          Promise.resolve({ data: table === 'event' ? EVENTS : [], error: null }),
      }),
    }),
  },
}));

// The jsdom-compat test env has a non-functional localStorage, so mock the base
// team store with an in-memory value (same approach as useActiveEvent.test).
// vi.hoisted lets the (hoisted) vi.mock factory share state without TDZ issues.
const DEFAULT_BASE_TEAM = 3256;
const store = vi.hoisted(() => ({ team: 3256 }));
vi.mock('@/dash/baseTeamStore', () => ({
  DEFAULT_BASE_TEAM: 3256,
  getStoredBaseTeam: () => store.team,
  setStoredBaseTeam: (n: number | null) => {
    store.team = n != null && Number.isInteger(n) && n > 0 ? n : 3256;
  },
}));

import SetupTab from '../SetupTab';
import { getStoredBaseTeam } from '@/dash/baseTeamStore';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  setActiveEventMock.mockClear();
  store.team = DEFAULT_BASE_TEAM;
});

describe('SetupTab', () => {
  it('shows the current active event', () => {
    render(<SetupTab />, { wrapper });
    expect(screen.getByTestId('setup-active-event').textContent).toContain('2026demo');
  });

  it('sets the imported event active', async () => {
    render(<SetupTab />, { wrapper });
    fireEvent.click(screen.getByTestId('import-stub'));
    await waitFor(() => expect(setActiveEventMock).toHaveBeenCalledWith('2026new', expect.anything()));
  });

  it('switches to an already-imported event without re-importing', async () => {
    render(<SetupTab />, { wrapper });
    // The picker lists imported events; switching only flips is_active.
    const btn = await screen.findByTestId('setup-switch-2026caetb');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(setActiveEventMock).toHaveBeenCalledWith('2026caetb', expect.anything()),
    );
  });

  it('defaults the base team to 3256', () => {
    render(<SetupTab />, { wrapper });
    expect(screen.getByTestId('setup-base-team-current').textContent).toContain('3256');
  });

  it('saves a new base team', () => {
    render(<SetupTab />, { wrapper });
    fireEvent.change(screen.getByTestId('setup-base-team-input'), { target: { value: '254' } });
    fireEvent.click(screen.getByTestId('setup-base-team-save'));
    expect(getStoredBaseTeam()).toBe(254);
    expect(screen.getByTestId('setup-base-team-current').textContent).toContain('254');
  });

  it('rejects a non-positive base team without persisting', () => {
    render(<SetupTab />, { wrapper });
    fireEvent.change(screen.getByTestId('setup-base-team-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('setup-base-team-save'));
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
  });

  it('resets the base team to the default', () => {
    render(<SetupTab />, { wrapper });
    fireEvent.change(screen.getByTestId('setup-base-team-input'), { target: { value: '254' } });
    fireEvent.click(screen.getByTestId('setup-base-team-save'));
    expect(getStoredBaseTeam()).toBe(254);

    fireEvent.click(screen.getByTestId('setup-base-team-reset'));
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
    expect(screen.getByTestId('setup-base-team-current').textContent).toContain('3256');
  });
});
