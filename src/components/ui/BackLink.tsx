import { Link } from 'react-router-dom';
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
 * back button. Uses react-router client-side navigation (NOT a full-page
 * `<a href>` reload) so back/forward works offline — a full document reload
 * depends on the service worker re-serving index.html and was the cause of
 * "pages stop loading when going back". Renders an anchor at a 44px minimum
 * touch target. Drop one into every top-level screen's header so no page is a
 * dead end.
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
    <Link
      to={to}
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
    </Link>
  );
}

export default BackLink;
