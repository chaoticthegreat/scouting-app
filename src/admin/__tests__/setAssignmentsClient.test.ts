import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { publishAssignments } from '../setAssignmentsClient';
import type { Assignment } from '../types';

const ASSIGNMENTS: Assignment[] = [
  { matchKey: '2026casnv_qm1', scoutId: 's1', allianceColor: 'red', station: 1, targetTeamNumber: 254 },
  { matchKey: '2026casnv_qm1', scoutId: 's2', allianceColor: 'blue', station: 3, targetTeamNumber: 1678 },
];

describe('publishAssignments', () => {
  beforeEach(() => rpc.mockReset());

  it('calls set_assignments with snake_cased rows and returns the inserted count', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const count = await publishAssignments('2026casnv', ASSIGNMENTS);
    expect(count).toBe(2);
    expect(rpc).toHaveBeenCalledWith('set_assignments', {
      p_event_key: '2026casnv',
      p_assignments: [
        { match_key: '2026casnv_qm1', scout_id: 's1', alliance_color: 'red', station: 1, target_team_number: 254 },
        { match_key: '2026casnv_qm1', scout_id: 's2', alliance_color: 'blue', station: 3, target_team_number: 1678 },
      ],
    });
  });

  it('throws when the rpc returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(publishAssignments('2026casnv', ASSIGNMENTS)).rejects.toThrow(/permission denied/);
  });
});
