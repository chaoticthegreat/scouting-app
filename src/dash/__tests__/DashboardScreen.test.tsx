import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/dash/useActiveEvent', () => ({
  useActiveEvent: () => ({ eventKey: '2026demo', loading: false }),
}));

// Stub the heavy tab bodies so the shell test stays isolated (no supabase/react-query).
vi.mock('@/dash/NextMatchView', () => ({ default: () => <div data-testid="view-next" /> }));
vi.mock('@/dash/TeamView', () => ({ default: () => <div data-testid="view-team" /> }));
vi.mock('@/dash/RankingView', () => ({ default: () => <div data-testid="view-ranking" /> }));
vi.mock('@/dash/PicklistView', () => ({ default: () => <div data-testid="view-picklist" /> }));
vi.mock('@/dash/RosterTab', () => ({ default: () => <div data-testid="roster-tab" /> }));
vi.mock('@/dash/SetupTab', () => ({ default: () => <div data-testid="setup-tab" /> }));

import DashboardScreen from '../DashboardScreen';

beforeEach(() => {
  window.history.replaceState({}, '', '/dashboard');
});

describe('DashboardScreen', () => {
  it('defaults to the Next Match tab', () => {
    render(<DashboardScreen />);
    expect(screen.getByTestId('view-next')).toBeInTheDocument();
  });

  it('switches to the Roster and Setup tabs on click', () => {
    render(<DashboardScreen />);
    fireEvent.click(screen.getByTestId('dash-tab-roster'));
    expect(screen.getByTestId('roster-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dash-tab-setup'));
    expect(screen.getByTestId('setup-tab')).toBeInTheDocument();
  });

  it('opens directly on Setup when ?tab=setup (the /admin alias)', () => {
    window.history.replaceState({}, '', '/dashboard?tab=setup');
    render(<DashboardScreen />);
    expect(screen.getByTestId('setup-tab')).toBeInTheDocument();
  });
});
