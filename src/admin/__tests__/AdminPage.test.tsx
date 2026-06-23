import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../EventSetup', () => ({
  EventSetup: ({ onImported }: { onImported?: (k: string) => void }) => (
    <button data-testid="mock-event-setup" onClick={() => onImported?.('2026casnv')}>
      setup
    </button>
  ),
}));
vi.mock('../ScheduleView', () => ({
  ScheduleView: ({ eventKey }: { eventKey: string }) => (
    <div data-testid="mock-schedule">{eventKey}</div>
  ),
}));
vi.mock('../AssignmentBoard', () => ({
  AssignmentBoard: ({ eventKey, matches, scouts }: { eventKey: string; matches: unknown[]; scouts: unknown[] }) => (
    <div data-testid="mock-board">
      {eventKey}:{matches.length}:{scouts.length}
    </div>
  ),
}));

const from = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));

import AdminPage from '../AdminPage';

function tableMock(table: string) {
  if (table === 'event') {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ event_key: '2026casnv' }], error: null }),
    };
  }
  if (table === 'scout') {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 's1', display_name: 'Alice' }, { id: 's2', display_name: 'Bob' }],
        error: null,
      }),
    };
  }
  // match
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: [
        { match_key: '2026casnv_qm1', match_number: 1, red1: 254, red2: 1678, red3: 100, blue1: 200, blue2: 300, blue3: 400 },
      ],
      error: null,
    }),
  };
}

describe('AdminPage', () => {
  beforeEach(() => {
    from.mockReset();
    from.mockImplementation((t: string) => tableMock(t));
  });

  it('renders setup, schedule, and board for the active event with loaded scouts and matches', async () => {
    render(<AdminPage />);
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.getByTestId('mock-event-setup')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('mock-schedule')).toHaveTextContent('2026casnv'));
    await waitFor(() => expect(screen.getByTestId('mock-board')).toHaveTextContent('2026casnv:1:2'));
  });
});
