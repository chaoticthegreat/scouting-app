// HomeScreen landing page — lets the user choose Scout vs Lead Dashboard.
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HomeScreen from '../HomeScreen';

describe('HomeScreen', () => {
  it('renders the landing shell', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-screen')).toBeInTheDocument();
  });

  it('offers a Scout choice linking to /scout', () => {
    render(<HomeScreen />);
    const scout = screen.getByTestId('home-go-scout');
    expect(scout).toBeInTheDocument();
    expect(scout).toHaveAttribute('href', '/scout');
    expect(scout).toHaveTextContent(/scout/i);
  });

  it('offers a Lead Dashboard choice linking to /dashboard', () => {
    render(<HomeScreen />);
    const dash = screen.getByTestId('home-go-dashboard');
    expect(dash).toBeInTheDocument();
    expect(dash).toHaveAttribute('href', '/dashboard');
    expect(dash).toHaveTextContent(/dashboard/i);
  });
});
