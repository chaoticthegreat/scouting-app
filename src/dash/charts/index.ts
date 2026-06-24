// src/dash/charts/index.ts
// Barrel for the dependency-free SVG chart set used across the dashboard.
export { BarChart, type BarChartProps, type BarDatum } from './BarChart';
export { LineChart, type LineChartProps, type LinePoint } from './LineChart';
export { StackedBar, type StackedBarProps, type StackedDatum } from './StackedBar';
export { EmptyChart, type EmptyChartProps } from './EmptyChart';
export { CHART_COLORS, SERIES_PALETTE, NOT_ENOUGH_DATA, MIN_POINTS } from './chartColors';
