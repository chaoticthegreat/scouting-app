// src/dash/DashboardScreen.tsx — open (no login) lead/drive-coach hub. Landscape
// tab bar with lucide icons: Next Match · Team · Ranking · Picklist · Roster · Setup.
// Initial tab is read from ?tab= so the legacy /admin -> /dashboard?tab=setup alias
// lands on Setup.
import { useState } from 'react';
import { Swords, UserSearch, ListOrdered, ClipboardList, Users, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveEvent } from '@/dash/useActiveEvent';
import NextMatchView from '@/dash/NextMatchView';
import TeamView from '@/dash/TeamView';
import RankingView from '@/dash/RankingView';
import PicklistView from '@/dash/PicklistView';
import RosterTab from '@/dash/RosterTab';
import SetupTab from '@/dash/SetupTab';

type Tab = 'next' | 'team' | 'ranking' | 'picklist' | 'roster' | 'setup';

const TABS: { key: Tab; label: string; icon: LucideIcon; needsEvent: boolean }[] = [
  { key: 'next', label: 'Next Match', icon: Swords, needsEvent: true },
  { key: 'team', label: 'Team', icon: UserSearch, needsEvent: true },
  { key: 'ranking', label: 'Ranking', icon: ListOrdered, needsEvent: true },
  { key: 'picklist', label: 'Picklist', icon: ClipboardList, needsEvent: true },
  { key: 'roster', label: 'Roster', icon: Users, needsEvent: false },
  { key: 'setup', label: 'Setup', icon: Settings, needsEvent: false },
];

function initialTab(): Tab {
  try {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q && TABS.some((t) => t.key === q)) return q as Tab;
  } catch {
    /* no window/search — fall through */
  }
  return 'next';
}

export default function DashboardScreen(): JSX.Element {
  const { eventKey, loading } = useActiveEvent();
  const [tab, setTab] = useState<Tab>(initialTab);

  const current = TABS.find((t) => t.key === tab);
  const dataGated = current?.needsEvent ?? true;

  return (
    <div
      data-testid="dashboard"
      className="flex min-h-screen flex-col gap-4 bg-background p-4 text-foreground"
    >
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="font-mono text-sm text-muted-foreground">{eventKey ?? '—'}</span>
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.key}
              data-testid={`dash-tab-${t.key}`}
              variant={tab === t.key ? 'default' : 'outline'}
              size="big"
              className="flex-1"
              onClick={() => setTab(t.key)}
            >
              <Icon /> {t.label}
            </Button>
          );
        })}
      </nav>

      {tab === 'roster' && <RosterTab />}
      {tab === 'setup' && <SetupTab />}

      {dataGated &&
        (loading ? (
          <p data-testid="dashboard-loading" className="text-muted-foreground">
            Loading event…
          </p>
        ) : !eventKey ? (
          <p data-testid="dashboard-no-event" className="text-muted-foreground">
            No active event. Set one in the Setup tab.
          </p>
        ) : (
          <section className="flex-1">
            {tab === 'next' && <NextMatchView eventKey={eventKey} />}
            {tab === 'team' && <TeamView eventKey={eventKey} />}
            {tab === 'ranking' && <RankingView eventKey={eventKey} />}
            {tab === 'picklist' && <PicklistView eventKey={eventKey} />}
          </section>
        ))}
    </div>
  );
}
