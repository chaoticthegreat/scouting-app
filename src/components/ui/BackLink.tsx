import { ArrowLeft, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BackLinkProps {
  /** Destination route. Defaults to the home chooser ("/"). */
  to?: string;
  /** Visible label. Defaults to "Home". */
  label?: string;
  /**
   * Which leading icon to show: "back" (arrow) for a return-to-previous-screen
   * link, "home" (house) for a jump-to-home link. Defaults to "back".
   */
  icon?: 'back' | 'home';
  /** Render icon only (no text) — handy in tight headers. */
  iconOnly?: boolean;
  'data-testid'?: string;
  className?: string;
}

/**
 * Standard in-app navigation link for installed-PWA users, who have no browser
 * back button. Renders the same plain `<a href>` the rest of the app uses (see
 * HomeScreen / ScoutHome) at a 44px minimum touch target. Drop one into every
 * top-level screen's header so no page is a dead end.
 */
export function BackLink({
  to = '/',
  label = 'Home',
  icon = 'back',
  iconOnly = false,
  className,
  ...rest
}: BackLinkProps): JSX.Element {
  const Icon = icon === 'home' ? Home : ArrowLeft;
  return (
    <a
      href={to}
      aria-label={iconOnly ? label : undefined}
      data-testid={rest['data-testid'] ?? 'nav-back'}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        iconOnly ? 'min-w-[44px]' : 'px-4',
        className,
      )}
    >
      <Icon className="size-5" />
      {iconOnly ? null : label}
    </a>
  );
}

export default BackLink;
