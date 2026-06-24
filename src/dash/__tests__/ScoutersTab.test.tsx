// src/dash/__tests__/ScoutersTab.test.tsx
// The merged Scouters hub: persistent roster CRUD (always available) plus an
// event-scoped performance drill-down (ScouterView, shown only with an event).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const listRoster = vi.fn();
const addScouter = vi.fn();
const removeScouter = vi.fn();

vi.mock('@/roster/rosterClient', () => ({
  listRoster: () => listRoster(),
  addScouter: (name: string) => addScouter(name),
  removeScouter: (id: string) => removeScouter(id),
}));

// Stub the drill-down so this test stays focused on the hub wiring.
vi.mock('@/dash/ScouterView', () => ({
  default: ({ eventKey }: { eventKey: string }) => (
    <div data-testid="scouter-view" data-event={eventKey} />
  ),
}));

import ScoutersTab from '../ScoutersTab';

beforeEach(() => {
  listRoster.mockReset().mockResolvedValue([
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
  ]);
  addScouter.mockReset().mockResolvedValue(undefined);
  removeScouter.mockReset().mockResolvedValue(undefined);
});

describe('ScoutersTab', () => {
  it('lists roster names from the roster client', async () => {
    render(<ScoutersTab eventKey="2026demo" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('adds a scouter and refreshes the list', async () => {
    render(<ScoutersTab eventKey="2026demo" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    listRoster.mockResolvedValueOnce([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Carol' },
    ]);

    fireEvent.change(screen.getByTestId('roster-name-input'), {
      target: { value: 'Carol' },
    });
    fireEvent.click(screen.getByTestId('roster-add-btn'));

    await waitFor(() => expect(addScouter).toHaveBeenCalledWith('Carol'));
    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument());
  });

  it('does not add a blank name', async () => {
    render(<ScoutersTab eventKey="2026demo" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('roster-name-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('roster-add-btn'));
    expect(addScouter).not.toHaveBeenCalled();
  });

  it('removes a scouter and refreshes the list', async () => {
    render(<ScoutersTab eventKey="2026demo" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    listRoster.mockResolvedValueOnce([{ id: 'b', name: 'Bob' }]);

    fireEvent.click(screen.getByTestId('roster-remove-a'));

    await waitFor(() => expect(removeScouter).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  });

  it('shows the event-scoped performance drill-down when an event is active', async () => {
    render(<ScoutersTab eventKey="2026demo" />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    const view = screen.getByTestId('scouter-view');
    expect(view).toBeInTheDocument();
    expect(view.getAttribute('data-event')).toBe('2026demo');
    expect(screen.queryByTestId('scouters-no-event')).toBeNull();
  });

  it('keeps roster usable but hides performance with a note when no event is active', async () => {
    render(<ScoutersTab eventKey={null} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByTestId('scouter-view')).toBeNull();
    expect(screen.getByTestId('scouters-no-event')).toBeInTheDocument();
  });
});
