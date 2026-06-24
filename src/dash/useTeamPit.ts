import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Normalized pit report for dashboard consumption. The DB folds capability list
// and intake sources into one jsonb `capabilities` column of the shape
// { items: string[], intakeSources: string[] } (see pit/pitStore.ts).
export interface TeamPit {
  eventKey: string;
  teamNumber: number;
  drivetrain: string | null;
  mechanisms: string[];
  capabilities: string[];
  intakeSources: string[];
  photoPath: string | null;
  notes: string | null;
  authorScoutId: string | null;
}

function normalizeCapabilities(raw: unknown): { capabilities: string[]; intakeSources: string[] } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as { items?: unknown; intakeSources?: unknown };
    return {
      capabilities: Array.isArray(obj.items) ? (obj.items as string[]) : [],
      intakeSources: Array.isArray(obj.intakeSources) ? (obj.intakeSources as string[]) : [],
    };
  }
  if (Array.isArray(raw)) return { capabilities: raw as string[], intakeSources: [] };
  return { capabilities: [], intakeSources: [] };
}

/**
 * Fetch a single team's pit scouting report for an event. Returns null when no
 * pit report exists yet (not an error). Used by TeamView's pit panel.
 */
export function useTeamPit(eventKey: string | null | undefined, teamNumber: number | null | undefined) {
  return useQuery<TeamPit | null>({
    queryKey: ['team-pit', eventKey, teamNumber],
    enabled: !!eventKey && teamNumber != null,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pit_scouting_report')
        .select('*')
        .eq('event_key', eventKey as string)
        .eq('team_number', teamNumber as number)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { capabilities, intakeSources } = normalizeCapabilities(data.capabilities);
      return {
        eventKey: data.event_key,
        teamNumber: data.team_number,
        drivetrain: data.drivetrain ?? null,
        mechanisms: Array.isArray(data.mechanisms) ? data.mechanisms : [],
        capabilities,
        intakeSources,
        photoPath: data.photo_path ?? null,
        notes: data.notes ?? null,
        authorScoutId: data.author_scout_id ?? null,
      };
    },
  });
}
