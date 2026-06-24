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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}));

// The jsdom-compat test env has a non-functional localStorage, so mock the
// store module with an in-memory value (same approach as useActiveEvent.test).
let nexusStored: string | null = null;
vi.mock('../nexusEventStore', () => ({
  NEXUS_DEMO_EVENT_KEY: 'nexus_demo_event_key',
  getStoredNexusEventKey: () => nexusStored,
  setStoredNexusEventKey: (v: string | null) => {
    const trimmed = v?.trim();
    nexusStored = trimmed ? trimmed : null;
  },
}));

import SetupTab from '../SetupTab';
import { getStoredNexusEventKey } from '../nexusEventStore';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  setActiveEventMock.mockClear();
  nexusStored = null;
});

describe('SetupTab', () => {
  it('shows the current active event', () => {
    render(<SetupTab />, { wrapper });
    expect(screen.getByTestId('setup-active-event').textContent).toContain('2026demo');
  });

  it('keeps the active event when the lead confirms', async () => {
    render(<SetupTab />, { wrapper });
    fireEvent.click(screen.getByTestId('setup-set-active'));
    await waitFor(() => expect(setActiveEventMock).toHaveBeenCalledWith('2026demo', expect.anything()));
  });

  it('sets the imported event active', async () => {
    render(<SetupTab />, { wrapper });
    fireEvent.click(screen.getByTestId('import-stub'));
    await waitFor(() => expect(setActiveEventMock).toHaveBeenCalledWith('2026new', expect.anything()));
  });

  it('saves a demo Nexus event id to the store', () => {
    render(<SetupTab />, { wrapper });
    fireEvent.change(screen.getByTestId('setup-nexus-event-input'), {
      target: { value: '2026nexusdemo' },
    });
    fireEvent.click(screen.getByTestId('setup-nexus-event-save'));
    expect(getStoredNexusEventKey()).toBe('2026nexusdemo');
    expect(screen.getByTestId('setup-nexus-event-current').textContent).toContain('2026nexusdemo');
  });

  it('clears the demo Nexus event id', () => {
    render(<SetupTab />, { wrapper });
    fireEvent.change(screen.getByTestId('setup-nexus-event-input'), {
      target: { value: '2026nexusdemo' },
    });
    fireEvent.click(screen.getByTestId('setup-nexus-event-save'));
    expect(getStoredNexusEventKey()).toBe('2026nexusdemo');

    fireEvent.click(screen.getByTestId('setup-nexus-event-clear'));
    expect(getStoredNexusEventKey()).toBeNull();
    expect(screen.getByTestId('setup-nexus-event-current').textContent).toContain('— none —');
  });
});
