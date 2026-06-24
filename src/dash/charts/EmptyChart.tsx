// src/dash/charts/EmptyChart.tsx
// Shared graceful empty state for every chart (<2 data points). Keeps the
// "Not enough data to chart" copy and styling identical across the chart set.

import { NOT_ENOUGH_DATA } from './chartColors';

export interface EmptyChartProps {
  /** Optional override message; defaults to the shared NOT_ENOUGH_DATA copy. */
  message?: string;
  testid?: string;
}

export function EmptyChart({ message = NOT_ENOUGH_DATA, testid }: EmptyChartProps): JSX.Element {
  return (
    <div
      data-testid={testid}
      data-chart-empty="true"
      className="flex min-h-[88px] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}

export default EmptyChart;
