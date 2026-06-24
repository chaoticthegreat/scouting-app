// src/home/HomeScreen.tsx — landing page. No auth, no gates: a deliberate fork
// between the two roles. Scouts tap "Scout"; leads/drive-coaches tap "Lead
// Dashboard". Uses react-router client-side navigation so it works offline (a
// full-page reload would depend on the service worker re-serving the document).
// Built for phones in landscape — the two choices sit side by side there,
// stacked otherwise.
import { Link } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Choice {
  testid: string;
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
}

const CHOICES: Choice[] = [
  {
    testid: 'home-go-scout',
    href: '/scout',
    icon: ClipboardList,
    title: 'Scout',
    blurb: 'Capture match data from the stands.',
  },
  {
    testid: 'home-go-dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    title: 'Lead Dashboard',
    blurb: 'Rankings, picklist, roster and event setup for leads.',
  },
];

export default function HomeScreen(): JSX.Element {
  return (
    <div
      data-testid="home-screen"
      className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background p-6 text-foreground"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          FRC Scouting
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Pick your station</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Two ways in — grabbing data on the floor, or running the show from the dashboard.
        </p>
      </header>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 landscape:grid-cols-2 sm:grid-cols-2">
        {CHOICES.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.testid}
              data-testid={c.testid}
              to={c.href}
              className="group flex min-h-[44px] flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-6" />
              </span>
              <span className="flex items-center justify-between">
                <span className="text-2xl font-semibold tracking-tight">{c.title}</span>
                <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
              </span>
              <span className="text-sm text-muted-foreground">{c.blurb}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
