// src/dash/SetupTab.tsx — lead event setup: import an event, set it ACTIVE (so it
// persists and "stays"), and assign scouters. Folds the old /admin page in.
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Star, Radio } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventSetup } from '@/admin/EventSetup';
import { ScheduleView } from '@/admin/ScheduleView';
import { AssignmentBoard } from '@/admin/AssignmentBoard';
import type { AssignMatch, AssignScout } from '@/admin/types';
import { useActiveEvent } from '@/dash/useActiveEvent';
import { setActiveEvent } from '@/dash/setActiveEvent';
import { getStoredNexusEventKey, setStoredNexusEventKey } from '@/dash/nexusEventStore';

interface MatchRow {
  match_key: string;
  match_number: number;
  red1: number;
  red2: number;
  red3: number;
  blue1: number;
  blue2: number;
  blue3: number;
}

interface ScoutRow {
  id: string;
  display_name: string;
}

export default function SetupTab(): JSX.Element {
  const queryClient = useQueryClient();
  const { eventKey: activeEvent } = useActiveEvent();
  const [matches, setMatches] = useState<AssignMatch[]>([]);
  const [scouts, setScouts] = useState<AssignScout[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nexusInput, setNexusInput] = useState(() => getStoredNexusEventKey() ?? '');
  const [nexusStored, setNexusStored] = useState<string | null>(() => getStoredNexusEventKey());

  const saveNexusEvent = useCallback(() => {
    setStoredNexusEventKey(nexusInput);
    setNexusStored(getStoredNexusEventKey());
  }, [nexusInput]);

  const clearNexusEvent = useCallback(() => {
    setStoredNexusEventKey(null);
    setNexusInput('');
    setNexusStored(null);
  }, []);

  const loadEventData = useCallback(async (key: string) => {
    const [matchRes, scoutRes] = await Promise.all([
      supabase
        .from('match')
        .select('match_key,match_number,red1,red2,red3,blue1,blue2,blue3')
        .eq('event_key', key)
        .order('match_number', { ascending: true }),
      supabase.from('scout').select('id,display_name').eq('event_key', key),
    ]);
    const matchRows = (matchRes.data as MatchRow[] | null) ?? [];
    setMatches(
      matchRows.map((m) => ({
        matchKey: m.match_key,
        redTeams: [m.red1, m.red2, m.red3],
        blueTeams: [m.blue1, m.blue2, m.blue3],
      })),
    );
    const scoutRows = (scoutRes.data as ScoutRow[] | null) ?? [];
    setScouts(scoutRows.map((s) => ({ id: s.id, displayName: s.display_name })));
  }, []);

  useEffect(() => {
    if (activeEvent) void loadEventData(activeEvent);
  }, [activeEvent, loadEventData]);

  const makeActive = useCallback(
    async (key: string) => {
      setBusy(true);
      setError(null);
      try {
        await setActiveEvent(key, queryClient);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set active event.');
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  return (
    <div data-testid="setup-tab" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <span className="text-sm text-muted-foreground">Active event</span>
        <span data-testid="setup-active-event" className="font-mono text-lg font-semibold">
          {activeEvent ?? '— none —'}
        </span>
        {activeEvent && <CheckCircle2 className="size-5 text-green-500" />}
      </div>

      {/* Optional DEMO Nexus event override — only affects the live field-status feed. */}
      <div
        data-testid="setup-nexus-event"
        className="flex flex-col gap-2 rounded-lg border border-border p-3"
      >
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Demo Nexus event id (live data testing)</span>
        </div>
        <p className="text-xs text-muted-foreground">
          When set, the live Nexus field-status feed uses this event id instead of the active
          event — useful for testing live data against a demo event such as a Nexus demo event.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            data-testid="setup-nexus-event-input"
            className="max-w-xs font-mono"
            placeholder="e.g. 2026demo"
            value={nexusInput}
            onChange={(e) => setNexusInput(e.target.value)}
          />
          <Button data-testid="setup-nexus-event-save" variant="outline" onClick={saveNexusEvent}>
            Save
          </Button>
          <Button data-testid="setup-nexus-event-clear" variant="ghost" onClick={clearNexusEvent}>
            Clear
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Currently:{' '}
          <span data-testid="setup-nexus-event-current" className="font-mono">
            {nexusStored ?? '— none —'}
          </span>
        </div>
      </div>

      {/* Import an event; on success make it the active event so it persists. */}
      <EventSetup
        onImported={(key) => {
          void makeActive(key);
        }}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {activeEvent ? (
        <>
          <Button
            data-testid="setup-set-active"
            size="big"
            variant="outline"
            disabled={busy}
            onClick={() => void makeActive(activeEvent)}
          >
            <Star /> Keep “{activeEvent}” active
          </Button>
          <ScheduleView eventKey={activeEvent} />
          <AssignmentBoard eventKey={activeEvent} matches={matches} scouts={scouts} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Import an event to begin.</p>
      )}
    </div>
  );
}
