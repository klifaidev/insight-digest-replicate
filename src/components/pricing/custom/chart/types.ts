// Chart style schema — applies to every ChartBlock.
// All design knobs the inspector and renderer share live here.

import type { KpiMeasureId } from "@/lib/customSlide";

export type ChartType =
  | "line" | "bar" | "column" | "hbar"
  | "pie" | "donut" | "bubble" | "area"
  | "scatter" | "combo" | "waterfall";

export type LineStyle = "solid" | "dashed" | "dotted";
export type GridStyle = "solid" | "dashed";
export type LegendPos = "top" | "bottom" | "left" | "right";
export type AxisFormat = "auto" | "currency" | "percent" | "number" | "tons";
export type MarkerShape = "circle" | "square" | "diamond" | "triangle";
export type DataLabelPos =
  | "above" | "below" | "inside-end" | "inside-base" | "center"
  | "left" | "right" | "inside" | "outside" | "callout";
export type BarMode = "grouped" | "stacked" | "stacked100";

export interface AxisStyle {
  show: boolean;
  labelSize: number;
  labelColor: string;
  titleText: string;
  titleSize: number;
  titleColor: string;
  ticks: boolean;
  lineColor: string;
  lineWidth: number;
  min: number | null;
  max: number | null;
  format: AxisFormat;
  decimals: number;
}

export interface GeneralStyle {
  titleShow: boolean;
  titleSize: number;
  titleColor: string;
  titleBold: boolean;
  titleItalic: boolean;
  background: string;
  borderColor: string;
  borderWidth: number;
  padding: number;
  legendShow: boolean;
  legendPos: LegendPos;
}

export interface GridStyleCfg {
  show: boolean;
  color: string;
  style: GridStyle;
}

export interface DataLabelStyle {
  show: boolean;
  position: DataLabelPos;
  size: number;
  color: string;
  autoContrast: boolean;
  bold: boolean;
  italic: boolean;
  format: AxisFormat;
  decimals: number;
  showSeries: boolean;
  showCategory: boolean;
  bgColor: string;
  bgOpacity: number; // 0..1
  borderColor: string;
  borderWidth: number;
}

export interface SeriesStyle {
  /** série/categoria identificador (matched by index when name unknown) */
  key: string;
  color?: string;
  /** line/area */
  lineStyle?: LineStyle;
  thickness?: number;
  smooth?: boolean;
  areaFill?: boolean;
  areaOpacity?: number;
  /** marker for line/scatter */
  marker?: { show: boolean; shape: MarkerShape; size: number; fill?: string; border?: string };
  /** for combo */
  asLine?: boolean;
  secondaryAxis?: boolean;
}

export interface BarStyleCfg {
  mode: BarMode;
  gapPct: number;       // 0..100
  cornerRadius: number; // px
  borderColor: string;
  borderWidth: number;
}

export interface PieStyleCfg {
  donutHolePct: number; // 0..80
  startAngle: number;   // degrees
  explodePct: number;   // 0..30 — applies to all when no per-slice override
  labelMode: "value" | "percent" | "name" | "name-percent" | "name-value";
  /** per slice: { key: { color, explode } } */
  slices: Record<string, { color?: string; explode?: number }>;
}

export interface BubbleStyleCfg {
  minSize: number; // px
  maxSize: number; // px
  fillOpacity: number; // 0..1
  borderColor: string;
  borderWidth: number;
  showSizeLabel: boolean;
}

export interface AreaStyleCfg {
  stacked: boolean;
  lineOnTop: boolean;
}

export interface WaterfallStyleCfg {
  positiveColor: string;
  negativeColor: string;
  totalColor: string;
  connectors: boolean;
  connectorColor: string;
  connectorStyle: LineStyle;
  showRunningTotal: boolean;
  labelPos: "above" | "inside" | "below";
  gapPct: number;
  /** per category override: positive | negative | total */
  classify: Record<string, "positive" | "negative" | "total">;
}

export interface FunnelStyleCfg {
  direction: "ttb" | "btt";
  gapPct: number;
  labelMode: "value" | "percent" | "name" | "name-percent";
  slices: Record<string, { color?: string }>;
}

export interface TreemapStyleCfg {
  colorScheme: "categorical" | "gradient";
  gradientFrom: string;
  gradientTo: string;
  showCategoryLabel: boolean;
  showValueLabel: boolean;
  labelSize: number;
  labelColor: string;
  borderColor: string;
  borderWidth: number;
}

export interface RadarStyleCfg {
  fillArea: boolean;
  fillOpacity: number; // 0..1
  gridShape: "polygon" | "circle";
  gridColor: string;
  axisLabelSize: number;
  axisLabelColor: string;
}

export interface HistogramStyleCfg {
  bins: number;
  binWidth: number | null;
  barColor: string;
  borderColor: string;
  borderWidth: number;
  cumulative: boolean;
}

export interface BoxplotStyleCfg {
  boxFillColor: string;
  whiskerColor: string;
  whiskerWidth: number;
  medianColor: string;
  medianWidth: number;
  showMean: boolean;
  showOutliers: boolean;
}

export interface ChartStyle {
  general: GeneralStyle;
  xAxis: AxisStyle;
  yAxis: AxisStyle;
  yAxis2?: AxisStyle; // combo
  grid: GridStyleCfg;
  dataLabels: DataLabelStyle;
  series: SeriesStyle[];
  bar: BarStyleCfg;
  pie: PieStyleCfg;
  bubble: BubbleStyleCfg;
  area: AreaStyleCfg;
  waterfall: WaterfallStyleCfg;
  funnel: FunnelStyleCfg;
  treemap: TreemapStyleCfg;
  radar: RadarStyleCfg;
  histogram: HistogramStyleCfg;
  boxplot: BoxplotStyleCfg;
  /** Bubble/scatter only — second measure for Y when X is the first */
  measureY?: KpiMeasureId;
  /** Combo only — measure used by line series */
  measureLine?: KpiMeasureId;
}

export const DEFAULT_PALETTE = [
  "#C8102E", "#1C2430", "#0F766E", "#7C3AED",
  "#EA580C", "#2563EB", "#0EA5E9", "#16A34A",
  "#DB2777", "#CA8A04", "#475569", "#9333EA",
];

export const BRAND_COLORS = [
  "#C8102E", "#1C2430", "#FFFFFF", "#F8FAFC",
  "#64748B", "#0F766E", "#2563EB", "#EA580C",
];

function defaultAxis(title = ""): AxisStyle {
  return {
    show: true, labelSize: 11, labelColor: "#64748B",
    titleText: title, titleSize: 12, titleColor: "#1C2430",
    ticks: true, lineColor: "#CBD5E1", lineWidth: 1,
    min: null, max: null, format: "auto", decimals: 0,
  };
}

export function defaultChartStyle(): ChartStyle {
  return {
    general: {
      titleShow: true, titleSize: 16, titleColor: "#C8102E",
      titleBold: true, titleItalic: false,
      background: "#FFFFFF", borderColor: "#E2E8F0", borderWidth: 0,
      padding: 8, legendShow: true, legendPos: "bottom",
    },
    xAxis: defaultAxis(),
    yAxis: defaultAxis(),
    yAxis2: defaultAxis(),
    grid: { show: true, color: "#E2E8F0", style: "dashed" },
    dataLabels: {
      show: false, position: "above", size: 10, color: "#1C2430",
      autoContrast: false, bold: false, italic: false,
      format: "auto", decimals: 0,
      showSeries: false, showCategory: false,
      bgColor: "#FFFFFF", bgOpacity: 0,
      borderColor: "#E2E8F0", borderWidth: 0,
    },
    series: [],
    bar: { mode: "grouped", gapPct: 20, cornerRadius: 0,
           borderColor: "#FFFFFF", borderWidth: 0 },
    pie: { donutHolePct: 0, startAngle: 0, explodePct: 0,
           labelMode: "name-percent", slices: {} },
    bubble: { minSize: 60, maxSize: 600, fillOpacity: 0.6,
              borderColor: "#1C2430", borderWidth: 1, showSizeLabel: false },
    area: { stacked: false, lineOnTop: true },
    waterfall: {
      positiveColor: "#16A34A", negativeColor: "#C8102E", totalColor: "#1C2430",
      connectors: true, connectorColor: "#94A3B8", connectorStyle: "dashed",
      showRunningTotal: false, labelPos: "above", gapPct: 30, classify: {},
    },
  };
}

/** Ensure a block.style object exists (back-compat for legacy ChartBlocks). */
export function ensureChartStyle(s?: Partial<ChartStyle>): ChartStyle {
  const d = defaultChartStyle();
  if (!s) return d;
  return {
    ...d, ...s,
    general: { ...d.general, ...(s.general ?? {}) },
    xAxis: { ...d.xAxis, ...(s.xAxis ?? {}) },
    yAxis: { ...d.yAxis, ...(s.yAxis ?? {}) },
    yAxis2: { ...d.yAxis2!, ...(s.yAxis2 ?? {}) },
    grid: { ...d.grid, ...(s.grid ?? {}) },
    dataLabels: { ...d.dataLabels, ...(s.dataLabels ?? {}) },
    bar: { ...d.bar, ...(s.bar ?? {}) },
    pie: { ...d.pie, ...(s.pie ?? {}) },
    bubble: { ...d.bubble, ...(s.bubble ?? {}) },
    area: { ...d.area, ...(s.area ?? {}) },
    waterfall: { ...d.waterfall, ...(s.waterfall ?? {}) },
    series: s.series ?? [],
  };
}

export function colorForSeries(
  style: ChartStyle, key: string, idx: number,
): string {
  const explicit = style.series.find((s) => s.key === key)?.color;
  return explicit ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
}
