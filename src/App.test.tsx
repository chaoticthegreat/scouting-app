// App smoke test — deliberately updated in A27 when App was rewired to render
// <AppRouter /> (the full React Router router) instead of a static heading.
// The old assertion (`<h1>3256 Scouting</h1>`) no longer applies; we now verify
// that the app mounts and renders the router's default unauthenticated state
// (the /join screen, because / → /scout → RequireSession → /join when no scout).
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./auth/useSession', () => ({
  useSession: () => ({ loading: false, scout: null, role: null }),
}));

import App from './App';

describe('App', () => {
  it('renders without crashing and shows the join screen by default', () => {
    render(<App />);
    expect(screen.getByTestId('join-submit')).toBeInTheDocument();
  });
});
