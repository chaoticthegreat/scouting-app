import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const importEvent = vi.fn();
vi.mock('../importEventClient', () => ({ importEvent: (...a: unknown[]) => importEvent(...a) }));

import { EventSetup } from '../EventSetup';

describe('EventSetup', () => {
  beforeEach(() => importEvent.mockReset());

  it('imports an event and shows the summary', async () => {
    importEvent.mockResolvedValue({
      event_key: '2026casnv', name: 'CA SV', team_count: 37, match_count: 80, join_code: 'ABCD1234',
    });
    const onImported = vi.fn();
    render(<EventSetup onImported={onImported} />);

    fireEvent.change(screen.getByTestId('event-key-input'), { target: { value: '2026casnv' } });
    fireEvent.click(screen.getByTestId('event-import-submit'));

    const summary = await screen.findByTestId('event-summary');
    expect(summary).toHaveTextContent('37');
    expect(summary).toHaveTextContent('80');
    expect(summary).toHaveTextContent('ABCD1234');
    expect(importEvent).toHaveBeenCalledWith('2026casnv');
    expect(onImported).toHaveBeenCalledWith('2026casnv');
  });

  it('shows an error when import fails', async () => {
    importEvent.mockRejectedValueOnce(new Error('forbidden'));
    render(<EventSetup />);
    fireEvent.change(screen.getByTestId('event-key-input'), { target: { value: '2026casnv' } });
    fireEvent.click(screen.getByTestId('event-import-submit'));
    const err = await screen.findByTestId('event-import-error');
    expect(err).toHaveTextContent('forbidden');
  });

  it('does not double-submit while busy', async () => {
    let resolve!: (v: unknown) => void;
    importEvent.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<EventSetup />);
    fireEvent.change(screen.getByTestId('event-key-input'), { target: { value: '2026casnv' } });
    const btn = screen.getByTestId('event-import-submit');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    resolve({ event_key: '2026casnv', name: 'x', team_count: 1, match_count: 1, join_code: 'z' });
    await waitFor(() => expect(importEvent).toHaveBeenCalledTimes(1));
  });
});
