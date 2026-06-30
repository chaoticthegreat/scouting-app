// src/sync/SyncStatusScreen.tsx
//
// Lead-facing server-coverage view. Queries the active event's assignment grid
// (expected coverage) and the reports that have actually landed on the server,
// then groups by match to show received/expected, flag missing assigned
// reports, and surface the latest server_received_at.
//
// The data fetch is isolated in `fetchCoverage` (which only touches the
// supabase client) so tests can drive it by mocking `@/lib/supabase`.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/auth/useSession';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/button';
import { getSyncQueue, listDeadLetters, requeueReport } from '@/db/localStore';
import { getPitSyncQueue, listPitDeadLetters, requeuePitReport } from '@/pit/pitStore';
import { formatMatchKeyRaw } from '@/lib/formatMatch';

interface LocalDeadLetter {
  id: string;
  label: string;
  error: string | null;
  kind: 'match' | 'pit';
}

/**
 * This device's local outbox: how many reports are queued and which ones have
 * DEAD-LETTERED (stuck), with their error and a Retry. The server-coverage card
 * below only shows what reached the server — without this, a stuck report was
 * invisible here even though the header badge counted it.
 */
function LocalOutbox(): JSX.Element {
  const [queued, setQueued] = useState(0);
  const [dead, setDead] = useState<LocalDeadLetter[]>([]);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    const [mq, pq, md, pd] = await Promise.all([
      getSyncQueue(),
      getPitSyncQueue(),
      listDeadLetters(),
      listPitDeadLetters(),
    ]);
    setQueued(mq.length + pq.length);
    setDead([
      ...md.map((r) => ({
        id: r.id,
        label: `${formatMatchKeyRaw(r.matchKey)} · Team ${r.targetTeamNumber}`,
        error: r.lastSyncError ?? null,
        kind: 'match' as const,
      })),
      ...pd.map((r) => ({
        id: r.draftKey,
        label: `Pit · Team ${r.teamNumber}`,
        error: r.lastSyncError ?? null,
        kind: 'pit' as const,
      })),
    ]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retryAll = useCallback(async () => {
    setRetrying(true);
    try {
      for (const d of dead) {
        if (d.kind === 'match') await requeueReport(d.id);
        else await requeuePitReport(d.id);
      }
      // Nudge the sync engine (useSync listens for this) to drain immediately.
      window.dispatchEvent(new Event('scout-sync-changed'));
      await refresh();
    } finally {
      setRetrying(false);
    }
  }, [dead, refresh]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl text-brand">This device — local outbox</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p data-testid="local-outbox-queued" className="text-sm text-muted-foreground">
          {queued} queued to upload · {dead.length} failed
        </p>
        {dead.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {dead.map((d) => (
                <li
                  key={`${d.kind}:${d.id}`}
                  data-testid="local-outbox-deadletter"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold">{d.label}</div>
                    {/* A pure "Retry all" just re-runs the identical broken payload
                        and re-dead-letters (BUG-3). The real fix for a match report
                        is to CORRECT the bad match/team and re-save, so link each
                        match dead-letter to its editor. (Pit reports have no in-app
                        editor yet, so they only get Retry.) */}
                    {d.kind === 'match' ? (
                      <Link
                        data-testid="local-outbox-fix"
                        to={`/scout?edit=${d.id}`}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        Fix &amp; re-save
                      </Link>
                    ) : null}
                  </div>
                  {d.error ? (
                    <div className="mt-0.5 text-xs text-destructive [overflow-wrap:anywhere]">
                      {d.error}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              data-testid="local-outbox-retry"
              variant="outline"
              className="self-start"
              disabled={retrying}
              onClick={() => void retryAll()}
            >
              {retrying ? 'Retrying…' : 'Retry all failed'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-success">No failed reports on this device.</p>
        )}
      </CardContent>
    </Card>
  );
}

export interface CoverageAssignment {
  match_key: string;
  target_team_number: number;
  scout_id: string;
}

export interface CoverageReport {
  match_key: string;
  target_team_number: number;
  scout_id: string;
  server_received_at: string;
}

export interface CoverageData {
  eventKey: string | null;
  assignments: CoverageAssignment[];
  reports: CoverageReport[];
}

// Thin, mockable data layer: resolve the lead's active event, then fetch the
// RLS-scoped assignment grid + arrived reports for it.
export async function fetchCoverage(eventKey: string | null): Promise<CoverageData> {
  if (!eventKey) return { eventKey: null, assignments: [], reports: [] };

  const [assignRes, reportRes] = await Promise.all([
    supabase
      .from('assignment')
      .select('match_key,target_team_number,scout_id')
      .eq('event_key', eventKey),
    supabase
      .from('match_scouting_report')
      .select('match_key,target_team_number,scout_id,server_received_at')
      .eq('event_key', eventKey),
  ]);

  return {
    eventKey,
    assignments: (assignRes.data as CoverageAssignment[] | null) ?? [],
    reports: (reportRes.data as CoverageReport[] | null) ?? [],
  };
}

interface MatchCoverage {
  matchKey: string;
  expected: number;
  received: number;
  missing: { targetTeamNumber: number; scoutId: string }[];
  latestReceivedAt: string | null;
}

function reportKey(r: { target_team_number: number; scout_id: string }): string {
  return `${r.target_team_number}:${r.scout_id}`;
}

// Group by match_key and match each assigned (target_team_number, scout_id) to
// an arrived report. Reports without a matching assignment still count toward
// "received" and toward the latest-received timestamp.
export function computeCoverage(data: CoverageData): MatchCoverage[] {
  const byMatch = new Map<string, MatchCoverage>();

  const ensure = (matchKey: string): MatchCoverage => {
    let m = byMatch.get(matchKey);
    if (!m) {
      m = { matchKey, expected: 0, received: 0, missing: [], latestReceivedAt: null };
      byMatch.set(matchKey, m);
    }
    return m;
  };

  // Index arrived reports per match for fast membership + recency.
  const arrived = new Map<string, Set<string>>();
  for (const r of data.reports) {
    const m = ensure(r.match_key);
    if (!arrived.has(r.match_key)) arrived.set(r.match_key, new Set());
    arrived.get(r.match_key)!.add(reportKey(r));
    if (!m.latestReceivedAt || r.server_received_at > m.latestReceivedAt) {
      m.latestReceivedAt = r.server_received_at;
    }
  }

  for (const a of data.assignments) {
    const m = ensure(a.match_key);
    m.expected += 1;
    const here = arrived.get(a.match_key);
    if (here && here.has(reportKey(a))) {
      m.received += 1;
    } else {
      m.missing.push({ targetTeamNumber: a.target_team_number, scoutId: a.scout_id });
    }
  }

  return [...byMatch.values()].sort((x, y) => x.matchKey.localeCompare(y.matchKey));
}

export default function SyncStatusScreen(): JSX.Element {
  const { scout } = useSession();
  const eventKey = (scout as { event_key?: string } | null)?.event_key ?? null;
  const [data, setData] = useState<CoverageData | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const next = await fetchCoverage(eventKey);
      if (active) setData(next);
    })();
    return () => {
      active = false;
    };
  }, [eventKey]);

  const rows = data ? computeCoverage(data) : [];
  const noActiveEvent = data !== null && !data.eventKey;

  return (
    <main data-testid="sync-status" className="mx-auto flex max-w-3xl flex-col gap-4 px-safe py-safe sm:p-6">
      <div className="flex items-center gap-3">
        <BackLink to="/" label="Home" icon="home" />
        <h1 className="text-2xl font-bold">Sync status</h1>
      </div>
      <LocalOutbox />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-brand">Server coverage</CardTitle>
        </CardHeader>
        <CardContent>
          {noActiveEvent ? (
            <p className="text-sm text-warning">No active event.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments or reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((m) => {
                const complete = m.expected > 0 && m.received >= m.expected;
                return (
                  <li
                    key={m.matchKey}
                    data-testid={`sync-match-${m.matchKey}`}
                    className="flex flex-col gap-1 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-16 shrink-0 font-mono font-semibold">{m.matchKey}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                          complete
                            ? 'border-success/40 bg-success/15 text-success'
                            : 'border-warning/40 bg-warning/15 text-warning'
                        }`}
                      >
                        {m.received}/{m.expected}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                        {m.latestReceivedAt
                          ? new Date(m.latestReceivedAt).toLocaleString()
                          : 'none received'}
                      </span>
                    </div>
                    {m.missing.length > 0 ? (
                      <div className="text-xs font-medium text-destructive [overflow-wrap:anywhere]">
                        Missing:{' '}
                        {m.missing
                          .map((x) => `#${x.targetTeamNumber}`)
                          .join(', ')}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
