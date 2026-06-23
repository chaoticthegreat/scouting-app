import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const from = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));

import { ScheduleView } from '../ScheduleView';

function mockMatches(rows: unknown[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  from.mockReturnValue(builder);
}

describe('ScheduleView', () => {
  beforeEach(() => from.mockReset());

  it('renders a row per qual match with all six team numbers', async () => {
    mockMatches([
      { match_key: '2026casnv_qm1', match_number: 1, red1: 254, red2: 1678, red3: 100, blue1: 200, blue2: 300, blue3: 400 },
      { match_key: '2026casnv_qm2', match_number: 2, red1: 11, red2: 12, red3: 13, blue1: 21, blue2: 22, blue3: 23 },
    ]);
    render(<ScheduleView eventKey="2026casnv" />);

    const list = await screen.findByTestId('schedule-list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByTestId('schedule-row')).toHaveLength(2);
    expect(list).toHaveTextContent('254');
    expect(list).toHaveTextContent('400');
    expect(from).toHaveBeenCalledWith('match');
  });

  it('shows an empty state when there are no matches', async () => {
    mockMatches([]);
    render(<ScheduleView eventKey="2026casnv" />);
    await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument());
  });
});
