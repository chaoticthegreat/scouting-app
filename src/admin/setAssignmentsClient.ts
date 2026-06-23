import { supabase } from '@/lib/supabase';
import type { Assignment } from './types';

export async function publishAssignments(
  eventKey: string,
  assignments: Assignment[]
): Promise<number> {
  const p_assignments = assignments.map((a) => ({
    match_key: a.matchKey,
    scout_id: a.scoutId,
    alliance_color: a.allianceColor,
    station: a.station,
    target_team_number: a.targetTeamNumber,
  }));

  const { data, error } = await supabase.rpc('set_assignments', {
    p_event_key: eventKey,
    p_assignments,
  });

  if (error) {
    throw new Error(error.message);
  }
  return (data as number) ?? 0;
}
