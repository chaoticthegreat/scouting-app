import Dexie, { type Table } from 'dexie';
import { supabase } from '@/lib/supabase';

export interface PitReport {
  eventKey: string;
  teamNumber: number;
  drivetrain: string;
  mechanisms: string[];
  capabilities: string[];
  intakeSources: string[];
  photoPath: string | null;
  notes: string;
  scoutId: string;
}

export interface PitDraft {
  draftKey: string;
  eventKey: string;
  teamNumber: number;
  updatedAt: string;
  data: PitReport;
}

class PitDb extends Dexie {
  pitDrafts!: Table<PitDraft, string>;

  constructor() {
    super('pit-scouting-db');
    this.version(1).stores({
      pitDrafts: 'draftKey',
    });
  }
}

export const pitDb = new PitDb();

function pitDraftKey(eventKey: string, teamNumber: number): string {
  return eventKey + ':' + teamNumber;
}

export async function savePitDraft(
  eventKey: string,
  teamNumber: number,
  data: PitReport
): Promise<void> {
  const draft: PitDraft = {
    draftKey: pitDraftKey(eventKey, teamNumber),
    eventKey,
    teamNumber,
    updatedAt: new Date().toISOString(),
    data,
  };
  await pitDb.pitDrafts.put(draft);
}

export async function getPitDraft(
  eventKey: string,
  teamNumber: number
): Promise<PitDraft | undefined> {
  return pitDb.pitDrafts.get(pitDraftKey(eventKey, teamNumber));
}

export async function submitPit(report: PitReport): Promise<void> {
  const { error } = await supabase.from('pit_scouting_report').upsert({
    event_key: report.eventKey,
    team_number: report.teamNumber,
    drivetrain: report.drivetrain,
    mechanisms: report.mechanisms,
    capabilities: report.capabilities,
    intake_sources: report.intakeSources,
    photo_path: report.photoPath,
    notes: report.notes,
    author_scout_id: report.scoutId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
