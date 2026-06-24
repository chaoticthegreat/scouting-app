// src/dash/charts/chartColors.ts
// Shared design-token colors for the dependency-free SVG charts. These resolve
// to the same Tailwind tokens used across the dashboard (brand/energy/success/
// warning) via CSS variables, so charts stay theme-aware with zero new deps.

export const CHART_COLORS = {
  brand: 'hsl(var(--brand))',
  energy: 'hsl(var(--energy))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
} as const;

export type ChartColorKey = keyof typeof CHART_COLORS;

/** The default rotation used for stacked-bar series segments. */
export const SERIES_PALETTE: ChartColorKey[] = ['brand', 'energy', 'success', 'warning'];

/** Shared empty-state copy so every chart degrades identically. */
export const NOT_ENOUGH_DATA = 'Not enough data to chart';

/** Charts need at least this many data points to be meaningful. */
export const MIN_POINTS = 2;
