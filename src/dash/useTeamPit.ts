import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { signedPitPhotoUrl } from '@/pit/photoUpload';
import { tbaGetOptional, isUnavailable } from '@/dash/proxies';

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

// A single TBA team-media item (see TBA v3 Team Media model). We only read the
// fields we need to pick a direct image URL.
interface TbaMedia {
  type?: string;
  preferred?: boolean;
  direct_url?: string;
}

// Media types whose `direct_url` reliably points straight at an image file.
const TBA_IMAGE_TYPES = new Set(['imgur', 'instagram-image']);

function isUsableImageMedia(m: TbaMedia): boolean {
  return (
    typeof m.type === 'string' &&
    TBA_IMAGE_TYPES.has(m.type) &&
    typeof m.direct_url === 'string' &&
    m.direct_url.length > 0
  );
}

/**
 * Pick the best image URL from a TBA team-media array: a `preferred` image
 * first, else the first usable image-type item with a non-empty direct_url.
 * Returns null when nothing usable is present.
 */
function pickTbaImageUrl(media: TbaMedia[]): string | null {
  const usable = media.filter(isUsableImageMedia);
  if (usable.length === 0) return null;
  const preferred = usable.find((m) => m.preferred === true);
  return (preferred ?? usable[0]).direct_url ?? null;
}

// Derive a 4-digit season year from an event key (e.g. "2026casj" → 2026).
// Falls back to the current calendar year when the key has no leading digits.
function seasonYearFromEventKey(eventKey: string): number {
  const m = /^(\d{4})/.exec(eventKey);
  if (m) {
    const y = Number(m[1]);
    if (Number.isFinite(y)) return y;
  }
  return new Date().getFullYear();
}

export type TeamPhotoSource = 'pit' | 'tba' | null;

export interface TeamPhoto {
  url: string | null;
  source: TeamPhotoSource;
}

/**
 * Resolve a display photo URL for a team. Prefers a scouted pit photo (resolved
 * from its Storage object path to a short-lived signed URL); otherwise falls
 * back to The Blue Alliance team media for the event's season. Never throws —
 * any failure resolves to `{ url: null, source: null }`. Works even when no pit
 * report exists (pass `pitPhotoPath = null`).
 */
export function useTeamPhoto(
  eventKey: string | null | undefined,
  teamNumber: number | null | undefined,
  pitPhotoPath: string | null | undefined,
) {
  return useQuery<TeamPhoto>({
    queryKey: ['team-photo', eventKey, teamNumber, pitPhotoPath ?? null],
    enabled: !!eventKey && teamNumber != null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 1) Scouted pit photo → signed URL.
      if (pitPhotoPath) {
        const url = await signedPitPhotoUrl(pitPhotoPath).catch(() => null);
        if (url) return { url, source: 'pit' };
      }
      // 2) Fall back to TBA team media for the season. Optional: never throws.
      const year = seasonYearFromEventKey(eventKey as string);
      const path = `/team/frc${teamNumber}/media/${year}`;
      const body = await tbaGetOptional<TbaMedia[]>(path);
      if (isUnavailable(body) || !Array.isArray(body)) {
        return { url: null, source: null };
      }
      const url = pickTbaImageUrl(body);
      return url ? { url, source: 'tba' } : { url: null, source: null };
    },
  });
}
