import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const autoAssign = vi.fn();
const publishAssignments = vi.fn();
vi.mock('../autoAssign', () => ({ autoAssign: (...a: unknown[]) => autoAssign(...a) }));
vi.mock('../setAssignmentsClient', () => ({ publishAssignments: (...a: unknown[]) => publishAssignments(...a) }));

import { AssignmentBoard } from '../AssignmentBoard';
import type { AssignMatch, AssignScout, Assignment } from '../types';

const MATCHES: AssignMatch[] = [
  { matchKey: '2026casnv_qm1', redTeams: [254, 1678, 100], blueTeams: [200, 300, 400] },
];
const SCOUTS: AssignScout[] = [
  { id: 's1', displayName: 'Alice' },
  { id: 's2', displayName: 'Bob' },
];

describe('AssignmentBoard', () => {
  beforeEach(() => {
    autoAssign.mockReset();
    publishAssignments.mockReset();
  });

  it('auto-generates a grid then publishes', async () => {
    const generated: Assignment[] = [
      { matchKey: '2026casnv_qm1', scoutId: 's1', allianceColor: 'red', station: 1, targetTeamNumber: 254 },
      { matchKey: '2026casnv_qm1', scoutId: 's2', allianceColor: 'blue', station: 1, targetTeamNumber: 200 },
    ];
    autoAssign.mockReturnValue(generated);
    publishAssignments.mockResolvedValue(2);

    render(<AssignmentBoard eventKey="2026casnv" matches={MATCHES} scouts={SCOUTS} />);

    fireEvent.click(screen.getByTestId('auto-generate-btn'));
    const grid = await screen.findByTestId('assignment-grid');
    expect(grid).toHaveTextContent('254');
    expect(grid).toHaveTextContent('Alice');
    expect(autoAssign).toHaveBeenCalledWith(MATCHES, SCOUTS, expect.objectContaining({ ownTeam: 3256 }));

    fireEvent.click(screen.getByTestId('publish-assignments-btn'));
    await screen.findByTestId('assignments-published');
    expect(publishAssignments).toHaveBeenCalledWith('2026casnv', generated);
  });

  it('shows an error when publish fails', async () => {
    autoAssign.mockReturnValue([
      { matchKey: '2026casnv_qm1', scoutId: 's1', allianceColor: 'red', station: 1, targetTeamNumber: 254 },
    ]);
    publishAssignments.mockRejectedValueOnce(new Error('permission denied'));
    render(<AssignmentBoard eventKey="2026casnv" matches={MATCHES} scouts={SCOUTS} />);
    fireEvent.click(screen.getByTestId('auto-generate-btn'));
    await screen.findByTestId('assignment-grid');
    fireEvent.click(screen.getByTestId('publish-assignments-btn'));
    const err = await screen.findByTestId('assignments-publish-error');
    expect(err).toHaveTextContent('permission denied');
  });

  it('lets a slot be reassigned manually via a select', async () => {
    autoAssign.mockReturnValue([
      { matchKey: '2026casnv_qm1', scoutId: 's1', allianceColor: 'red', station: 1, targetTeamNumber: 254 },
    ]);
    publishAssignments.mockResolvedValue(1);
    render(<AssignmentBoard eventKey="2026casnv" matches={MATCHES} scouts={SCOUTS} />);
    fireEvent.click(screen.getByTestId('auto-generate-btn'));
    await screen.findByTestId('assignment-grid');

    const selects = screen.getAllByTestId('slot-select');
    fireEvent.change(selects[0], { target: { value: 's2' } });
    fireEvent.click(screen.getByTestId('publish-assignments-btn'));

    await waitFor(() => expect(publishAssignments).toHaveBeenCalled());
    const published = publishAssignments.mock.calls[0][1] as Assignment[];
    const slot = published.find((a) => a.matchKey === '2026casnv_qm1' && a.allianceColor === 'red' && a.station === 1);
    expect(slot?.scoutId).toBe('s2');
  });
});
