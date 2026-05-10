// ChartCanvas — single Recharts-based renderer for every ChartBlock variant.
// Reads the unified ChartStyle so the inspector can drive every visual knob.

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Sector,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip, LabelList,
  Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine,
} from "recharts";
import type { ChartBlock } from "@/lib/customSlide";
import { KPI_MEASURES } from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { applyFilters, calcPVM } from "@/lib/analytics";

const KPI_MEASURES_LABEL: Record<string, string> = Object.fromEntries(
  KPI_MEASURES.map((m) => [m.id, m.label]),
);
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { budgetRowsAsPricing } from "@/lib/budgetAdapter";
import { computeChartSeries, computeTopRanking, formatValue, inferFormat } from "@/lib/customKpi";
import { resolveChartFit } from "@/lib/customCapacity";
import { useSlideFilters, dimensionLabel } from "../SlideFilterContext";
import { monthLabel } from "@/lib/format";
import {
  ensureChartStyle, colorForSeries, DEFAULT_PALETTE, type ChartStyle,
} from "./types";
import {
  ChartTooltip, applySort, evalCondColor, renderRefLines,
  linearFit, movingAvg, resolveBridgeColumns, FunnelSVG,
  computeTrendlineSeries,
} from "./chartHelpers";

// -- helpers ---------------------------------------------------------------
function fmtVal(v: number, style: ChartStyle, fallback: ReturnType<typeof inferFormat>) {
  const f = style.dataLabels.format === "auto" ? fallback : style.dataLabels.format;
  return formatValue(v, f, "rol", style.dataLabels.decimals);
}
function axisFmt(ax: { format: string; decimals: number }, fallback: ReturnType<typeof inferFormat>) {
  return (v: number) => {
    if (!isFinite(v)) return "";
    const f = ax.format === "auto" ? fallback : ax.format;
    return formatValue(v, f as never, "rol", ax.decimals);
  };
}
function dashArr(s?: "solid" | "dashed" | "dotted") {
  return s === "dashed" ? "5 5" : s === "dotted" ? "2 4" : "0";
}

// Auto-contrast text color from background hex
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Custom data-label content factory — supports bg, border, autoContrast, showSeries/Category
function makeLabelContent(opts: {
  style: ChartStyle;
  measureFmt: ReturnType<typeof inferFormat>;
  seriesName?: string;
  categories?: string[];
  customFmt?: (v: number) => string;
  anchor?: "middle" | "start" | "end";
}) {
  const { style: cs, measureFmt, seriesName, categories, customFmt, anchor = "middle" } = opts;
  const dl = cs.dataLabels;
  return (props: { x?: number; y?: number; value?: number | string; index?: number }) => {
    if (props.x == null || props.y == null || props.value == null) return null;
    const num = typeof props.value === "number" ? props.value : Number(props.value);
    if (!isFinite(num)) return null;
    let text = customFmt ? customFmt(num) : fmtVal(num, cs, measureFmt);
    const prefix: string[] = [];
    if (dl.showSeries && seriesName) prefix.push(seriesName);
    if (dl.showCategory && categories && props.index != null) {
      const c = categories[props.index];
      if (c) prefix.push(c);
    }
    if (prefix.length) text = `${prefix.join(" · ")}: ${text}`;
    let color = dl.color;
    if (dl.autoContrast && dl.bgOpacity > 0) {
      color = luminance(dl.bgColor) > 0.55 ? "#000000" : "#FFFFFF";
    }
    const fs = dl.size;
    const padX = 3, padY = 2;
    const approxW = text.length * fs * 0.55 + padX * 2;
    const approxH = fs + padY * 2;
    const rx = anchor === "middle" ? props.x - approxW / 2
      : anchor === "end" ? props.x - approxW : props.x;
    const ry = props.y - approxH + padY;
    const showBg = dl.bgOpacity > 0 || dl.borderWidth > 0;
    return (
      <g>
        {showBg && (
          <rect x={rx} y={ry} width={approxW} height={approxH} rx={2}
            fill={dl.bgColor} fillOpacity={dl.bgOpacity}
            stroke={dl.borderColor} strokeWidth={dl.borderWidth} />
        )}
        <text x={props.x} y={props.y - padY}
          fontSize={fs} fill={color}
          textAnchor={anchor}
          fontWeight={dl.bold ? 700 : 400}
          fontStyle={dl.italic ? "italic" : "normal"}>{text}</text>
      </g>
    );
  };
}

// Map our generic dataLabels.position → recharts position per chart family
type Family = "line" | "area" | "bar-vertical" | "bar-horizontal" | "pie" | "scatter";
function mapPos(family: Family, p: string): string {
  if (family === "line" || family === "scatter") {
    switch (p) {
      case "below": return "bottom";
      case "left": return "left";
      case "right": return "right";
      case "above":
      default: return "top";
    }
  }
  if (family === "area") {
    return p === "below" ? "bottom" : p === "left" ? "left" : p === "right" ? "right" : "top";
  }
  if (family === "bar-vertical") {
    switch (p) {
      case "inside-end": return "insideTop";
      case "inside-base": return "insideBottom";
      case "center": return "center";
      case "below": return "bottom";
      case "above":
      default: return "top";
    }
  }
  if (family === "bar-horizontal") {
    switch (p) {
      case "inside-end": return "insideRight";
      case "inside-base": return "insideLeft";
      case "center": return "center";
      case "left": return "left";
      case "right":
      default: return "right";
    }
  }
  if (family === "pie") {
    if (p === "inside") return "inside";
    return "outside";
  }
  return "top";
}

// -- main ------------------------------------------------------------------
export function ChartCanvas({ block }: { block: ChartBlock }) {
  const style = useMemo(() => ensureChartStyle(block.style), [block.style]);
  const measureFmt = inferFormat(block.measure);

  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const rawDsRows = useMemo(
    () => (block.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing),
    [block.dataSource, pricing, budget],
  );
  const xDim = block.fieldWells?.xDim ?? null;
  // C1 — colorDim overrides breakdown as series-key generator
  const seriesDim = block.fieldWells?.colorDim ?? block.breakdown;

  // ---- Cross-filter (Part B.6) ----
  const cf = useSlideFilters();
  const participates = block.participatesInCrossFilter !== false;
  const emits = block.emitsCrossFilter !== false;
  // Block's own emitted filter (drives dimming, not row filtering on self)
  const ownFilter = useMemo(
    () => cf.filters.find((f) => f.sourceBlockId === block.id) ?? null,
    [cf.filters, block.id],
  );
  // Incoming filters from other blocks; matched by dim against this block's xDim/colorDim/breakdown.
  const myDims = useMemo(() => {
    const set = new Set<string>();
    if (xDim) set.add(xDim);
    if (block.fieldWells?.colorDim) set.add(block.fieldWells.colorDim);
    if (block.breakdown) set.add(block.breakdown);
    return set;
  }, [xDim, block.fieldWells?.colorDim, block.breakdown]);
  const incoming = useMemo(() => {
    if (!participates) return [];
    return cf.filters.filter(
      (f) => f.sourceBlockId !== block.id && (myDims.has(f.dimension) || f.dimension === "period")
    );
  }, [cf.filters, participates, block.id, myDims]);
  // Apply incoming filters to dsRows
  const dsRows = useMemo(() => {
    if (incoming.length === 0) return rawDsRows;
    return rawDsRows.filter((r) => {
      for (const f of incoming) {
        if (f.dimension === "period") {
          const lbl = monthLabel((r as any).mes, (r as any).ano);
          if (!f.values.includes(lbl) && !f.values.includes(String((r as any).periodo))) return false;
        } else {
          const v = String((r as unknown as Record<string, unknown>)[f.dimension] ?? "");
          if (!f.values.includes(v)) return false;
        }
      }
      return true;
    });
  }, [rawDsRows, incoming]);

  // Determine the dimension this block emits
  const emitDim: string = (xDim && xDim !== "period" ? xDim
    : block.breakdown ?? "period");

  // Click handler — emits/toggles a filter on this block's emit dimension
  const handleEmit = (rawValue: unknown, opts?: { shift?: boolean }) => {
    if (!emits) return;
    const v = String(rawValue ?? "");
    if (!v) return;
    const filter = { sourceBlockId: block.id, dimension: emitDim, values: [v] };
    if (opts?.shift) cf.toggleFilter(filter);
    else {
      // single click: if same single value already selected, clear; else replace
      if (ownFilter && ownFilter.values.length === 1 && ownFilter.values[0] === v
          && ownFilter.dimension === emitDim) {
        cf.clearFilter(block.id);
      } else {
        cf.setFilter(filter);
      }
    }
  };

  // Helper for Recharts top-level onClick (point/bar payload)
  const chartOnClick = (e: any) => {
    if (!emits) return;
    const label = e?.activeLabel ?? e?.activePayload?.[0]?.payload?.__period
      ?? e?.activePayload?.[0]?.payload?.name;
    if (label != null) handleEmit(label, { shift: !!e?.shiftKey });
  };

  // Should a value be dimmed (own filter active and value not selected)?
  const isDimmed = (value: string) => {
    if (!ownFilter) return false;
    if (ownFilter.dimension !== emitDim) return false;
    return !ownFilter.values.includes(value);
  };
  // Active own-emitted filter on the row-level dim (used for per-Cell dimming on bars/columns/hbars)
  const ownFilterOnRowDim = !!ownFilter && ownFilter.dimension === emitDim;
  const cellFillOpacity = (rowName: string) =>
    ownFilterOnRowDim && !ownFilter!.values.includes(rowName) ? 0.4 : 1;
  // Series-level dim for line/area (by series.name = colorDim/breakdown value)
  const seriesDim_ = block.fieldWells?.colorDim ?? block.breakdown ?? null;
  const seriesDimmed = (seriesName: string) => {
    if (!ownFilter) return false;
    // Only dim series when filter dimension targets the series dimension
    if (!seriesDim_) return false;
    if (ownFilter.dimension !== seriesDim_) return false;
    return !ownFilter.values.includes(seriesName);
  };

  const raw = useMemo(
    () => computeChartSeries(dsRows, block.filters, block.measure, seriesDim, xDim),
    [dsRows, block.filters, block.measure, seriesDim, xDim],
  );
  const data = useMemo(() => {
    const ranked = [...raw.series].sort((a, z) =>
      Math.abs(z.values.reduce((s, v) => s + (v || 0), 0))
      - Math.abs(a.values.reduce((s, v) => s + (v || 0), 0))
    );
    const fit = resolveChartFit(block, ranked.length);
    const visible = ranked.slice(0, fit.shown);
    const hidden = ranked.slice(fit.shown);
    if (block.showOthers && hidden.length > 0) {
      visible.push({
        name: `Outros (${hidden.length})`,
        values: raw.periodos.map((_, i) =>
          hidden.reduce((s, ser) => s + (ser.values[i] || 0), 0)),
      });
    }
    // B.5 — apply user-defined sort
    return applySort(raw.periodos, visible, block.sortConfig);
  }, [raw, block.h, block.w, block.autoFit, block.maxSeries, block.showOthers, block.sortConfig]);

  // Tooltip lookup tables — previous period delta + YoY (best-effort heuristic on label match)
  const tooltipMaps = useMemo(() => {
    const prev = new Map<string, Map<string, number>>();
    const yoy = new Map<string, Map<string, number>>();
    data.series.forEach((s) => {
      const pmap = new Map<string, number>(); const ymap = new Map<string, number>();
      data.periodos.forEach((p, i) => {
        if (i > 0) pmap.set(p.label, s.values[i - 1] ?? 0);
        if (i >= 12) ymap.set(p.label, s.values[i - 12] ?? 0);
      });
      prev.set(s.name, pmap); yoy.set(s.name, ymap);
    });
    return { prev, yoy };
  }, [data]);

  // C2 — tooltipMeasure: extra measure value per X label
  const tooltipExtra = useMemo(() => {
    const tm = block.fieldWells?.tooltipMeasure;
    if (!tm) return null;
    try {
      const r = computeChartSeries(dsRows, block.filters, tm, null, xDim);
      const map = new Map<string, number>();
      r.periodos.forEach((p, i) => {
        const total = r.series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0);
        map.set(p.label, total);
      });
      const label = KPI_MEASURES_LABEL[tm] ?? tm;
      const fmt = inferFormat(tm);
      return { map, label, fmt, measure: tm };
    } catch { return null; }
  }, [block.fieldWells?.tooltipMeasure, dsRows, block.filters, xDim]);

  // Combo: optional second measure for line series
  const lineSeriesData = useMemo(() => {
    if (block.chartType !== "combo" || !style.measureLine) return null;
    return computeChartSeries(dsRows, block.filters, style.measureLine, seriesDim);
  }, [block.chartType, style.measureLine, dsRows, block.filters, seriesDim]);

  // ---- ranking-style data for pie/donut/bubble/scatter/funnel/treemap ----
  const rankingTypes = ["pie", "donut", "bubble", "scatter", "funnel", "treemap"];
  const ranking = useMemo(() => {
    if (!rankingTypes.includes(block.chartType)) return [];
    const base = computeTopRanking(
      dsRows, block.filters,
      seriesDim ?? "marca",
      block.measure, 50, "all", null,
    );
    // FIX 2 — apply sortConfig to ranking (pie/donut/funnel/treemap/bubble/scatter)
    const sc = block.sortConfig;
    if (!sc) return base;
    if (sc.field === "name") {
      return [...base].sort((a, b) => sc.dir === "asc"
        ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    }
    if (sc.field === "value") {
      return sc.dir === "asc" ? [...base].reverse() : base;
    }
    return base;
  }, [dsRows, block.filters, seriesDim, block.measure, block.chartType, block.sortConfig]);

  // ---- empty states ----
  const seriesEmpty = data.periodos.length === 0 || data.series.length === 0;
  const rankingEmpty = ranking.length === 0;
  const isRankingChart = rankingTypes.includes(block.chartType);
  // Bridge PVM has its own data path (calcPVM) and own empty state.
  const isPvmBridge = block.chartType === "waterfall"
    && (style.waterfall.mode ?? "pvm") === "pvm";

  if (!isPvmBridge && ((isRankingChart && rankingEmpty) || (!isRankingChart && seriesEmpty))) {
    return (
      <Wrapper style={style}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Sem dados para os filtros escolhidos
        </div>
      </Wrapper>
    );
  }

  // ---- pivot to recharts row format ----
  let rows = data.periodos.map((p, i) => {
    const r: Record<string, number | string> = { __period: p.label };
    data.series.forEach((s) => { r[s.name] = s.values[i] ?? 0; });
    if (lineSeriesData) {
      lineSeriesData.series.forEach((s) => { r[`__line_${s.name}`] = s.values[i] ?? 0; });
    }
    return r;
  });

  // 1.4 stacked100 — normalize each row to percentage of total
  const ct = block.chartType;
  const isStack100 = (ct === "bar" || ct === "column" || ct === "hbar" || ct === "stackedColumn" || ct === "stackedBar")
    && style.bar.mode === "stacked100";
  if (isStack100) {
    rows = rows.map((r) => {
      const total = data.series.reduce((s, ser) => s + (Number(r[ser.name]) || 0), 0);
      const out: Record<string, number | string> = { __period: r.__period };
      data.series.forEach((ser) => {
        out[ser.name] = total > 0 ? (Number(r[ser.name]) || 0) / total * 100 : 0;
      });
      return out;
    });
  }

  const legendVerticalAlign = style.general.legendPos === "top" ? "top"
    : style.general.legendPos === "bottom" ? "bottom" : "middle";
  const legendAlign = style.general.legendPos === "left" ? "left"
    : style.general.legendPos === "right" ? "right" : "center";
  const legendLayout = (style.general.legendPos === "left" || style.general.legendPos === "right")
    ? "vertical" : "horizontal";

  const renderLegend = style.general.legendShow ? (
    <Legend verticalAlign={legendVerticalAlign} align={legendAlign} layout={legendLayout}
      wrapperStyle={{ fontSize: 11 }} />
  ) : null;

  const renderGrid = style.grid.show && !["pie", "donut", "radar"].includes(ct) ? (
    <CartesianGrid stroke={style.grid.color}
      strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
  ) : null;

  const xAx = style.xAxis;
  const yAx = style.yAxis;
  const yAx2 = style.yAxis2 ?? yAx;

  // 1.2 X axis min/max — apply when numeric (scatter/bubble/hbar)
  const xDomain: [number | string, number | string] = [
    xAx.min ?? "auto", xAx.max ?? "auto",
  ];

  const xAxis = xAx.show ? (
    <XAxis
      dataKey="__period"
      tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
      stroke={xAx.lineColor} tickLine={xAx.ticks}
      strokeWidth={xAx.lineWidth}
      label={xAx.titleText ? { value: xAx.titleText, position: "insideBottom",
        offset: -2, style: { fontSize: xAx.titleSize, fill: xAx.titleColor } } : undefined}
    />
  ) : <XAxis hide />;
  const yAxis = yAx.show ? (
    <YAxis
      yAxisId="left"
      tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
      stroke={yAx.lineColor} tickLine={yAx.ticks}
      strokeWidth={yAx.lineWidth}
      domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
      tickFormatter={isStack100 ? (v: number) => `${v.toFixed(0)}%` : axisFmt(yAx, measureFmt)}
      label={yAx.titleText ? { value: yAx.titleText, angle: -90, position: "insideLeft",
        style: { fontSize: yAx.titleSize, fill: yAx.titleColor } } : undefined}
    />
  ) : <YAxis yAxisId="left" hide />;

  // 1.3 Secondary Y axis for combo
  const hasSecondary = ct === "combo"
    && (style.series.some((s) => s.secondaryAxis) || !!style.measureLine);
  const yAxisRight = hasSecondary ? (
    <YAxis
      yAxisId="right" orientation="right"
      tick={{ fontSize: yAx2.labelSize, fill: yAx2.labelColor }}
      stroke={yAx2.lineColor} tickLine={yAx2.ticks}
      strokeWidth={yAx2.lineWidth}
      domain={[yAx2.min ?? "auto", yAx2.max ?? "auto"]}
      tickFormatter={axisFmt(yAx2, measureFmt)}
      label={yAx2.titleText ? { value: yAx2.titleText, angle: 90, position: "insideRight",
        style: { fontSize: yAx2.titleSize, fill: yAx2.titleColor } } : undefined}
    />
  ) : null;

  const labelStyle = { fontSize: style.dataLabels.size, fill: style.dataLabels.color,
    fontWeight: style.dataLabels.bold ? 700 : 400,
    fontStyle: style.dataLabels.italic ? "italic" : "normal" };
  const dlPos = style.dataLabels.position;

  // ---- renderers per chart type ----
  let chart: React.ReactNode = null;
  const forceStack = ct === "stackedColumn" || ct === "stackedBar" || ct === "stackedArea";
  const cats = data.periodos.map((p) => p.label);
  const stack100Fmt = (v: number) => `${(v as number).toFixed(0)}%`;

  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "combo") {
    // C2 — trendline + forecast overlay
    const trendCfg = style.analytics?.trendline;
    const fcCfg = style.analytics?.forecast;
    const trendOn = !!trendCfg?.enabled;
    const bandOn = trendOn && !!fcCfg?.enabled && !!fcCfg?.band;
    // FIX 3 — band needs Area children; switch line→ComposedChart when band on
    const Comp = (ct === "area" || ct === "stackedArea") ? AreaChart
      : ct === "combo" ? ComposedChart
      : (bandOn ? ComposedChart : LineChart);

    const trendOut = trendOn ? computeTrendlineSeries(
      data.series, cats,
      { enabled: true, type: trendCfg!.type, maWindow: trendCfg!.maWindow },
      { enabled: !!fcCfg?.enabled, periods: fcCfg?.periods ?? 0 },
    ) : null;
    let chartRows = rows as Record<string, number | string | null | [number, number]>[];
    if (trendOut && trendOut.rows.length > 0) {
      const merged: Record<string, number | string | null | [number, number]>[] = rows.map((r) => ({ ...r }));
      const fwd = (fcCfg?.enabled ? Math.max(0, Math.min(6, fcCfg.periods ?? 0)) : 0);
      for (let i = 0; i < fwd; i++) merged.push({ __period: `+${i + 1}` });
      trendOut.rows.forEach((tr, i) => {
        Object.keys(tr).forEach((k) => {
          if (k === "__period") return;
          if (merged[i]) merged[i][k] = tr[k] as never;
        });
      });
      // FIX 3 — confidence band: per-series [lo, up] for each forecast index
      if (bandOn) {
        const startIdx = trendOut.forecastStartIdx;
        data.series.forEach((s) => {
          const tk = trendOut.trendKey(s.name);
          merged.forEach((r, i) => {
            if (i >= startIdx) {
              const tv = Number(r[tk]) || 0;
              const dist = i - startIdx + 1;
              const u = 0.03 * dist;
              r[`__band_${s.name}`] = [tv * (1 - u), tv * (1 + u)];
            } else {
              r[`__band_${s.name}`] = null;
            }
          });
        });
      }
      chartRows = merged;
    }
    const trendDash = (s?: "solid" | "dashed" | "dotted") => dashArr(s);

    chart = (
      <Comp data={chartRows} onClick={chartOnClick}>
        {renderGrid}{xAxis}{yAxis}{yAxisRight}
        <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          const dash = dashArr(cfg?.lineStyle);
          const sDim = seriesDimmed(s.name);
          const sStrokeOp = sDim ? 0.2 : 1;
          const sFillOp = sDim ? 0.1 : undefined;
          if (ct === "area" || ct === "stackedArea") {
            const stacked = forceStack || style.area.stacked;
            return (
              <Area key={s.name} isAnimationActive={false} dataKey={s.name}
                type={cfg?.smooth ? "monotone" : "linear"}
                stroke={color} fill={color}
                strokeOpacity={sStrokeOp}
                fillOpacity={sDim ? 0.1 : (cfg?.areaOpacity ?? 0.35)}
                strokeWidth={style.area.lineOnTop ? (cfg?.thickness ?? 2.5) : (cfg?.thickness ?? 1)}
                strokeDasharray={dash}
                stackId={stacked ? "stack" : undefined}
                yAxisId="left">
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={mapPos("area", dlPos) as never}
                    content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats }) as never} />
                )}
              </Area>
            );
          }
          if (ct === "combo" && !cfg?.asLine) {
            return (
              <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
                fillOpacity={sFillOp}
                radius={style.bar.cornerRadius} stroke={style.bar.borderColor}
                strokeWidth={style.bar.borderWidth}
                yAxisId={cfg?.secondaryAxis ? "right" : "left"}>
                {((style.conditionalRules?.length ?? 0) > 0 || ownFilterOnRowDim) && chartRows.map((r, ri) => {
                  const baseFill = (style.conditionalRules?.length ?? 0) > 0
                    ? evalCondColor(Number(r[s.name]) || 0, style.conditionalRules, style.conditionalDefault || color)
                    : color;
                  return <Cell key={`${s.name}-${ri}`} fill={baseFill} fillOpacity={cellFillOpacity(String(r.__period ?? r.name ?? ""))} />;
                })}
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                    content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats }) as never} />
                )}
              </Bar>
            );
          }
          return (
            <Line key={s.name} isAnimationActive={false} dataKey={s.name}
              type={cfg?.smooth ? "monotone" : "linear"}
              stroke={color} strokeWidth={cfg?.thickness ?? 2.5}
              strokeOpacity={sStrokeOp}
              strokeDasharray={dash}
              yAxisId={ct === "combo" && cfg?.secondaryAxis ? "right" : "left"}
              dot={cfg?.marker?.show !== false ? {
                r: cfg?.marker?.size ?? 3,
                fill: cfg?.marker?.fill ?? color,
                stroke: cfg?.marker?.border ?? color,
                fillOpacity: sStrokeOp,
              } : false}
              connectNulls>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("line", dlPos) as never}
                  content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats }) as never} />
              )}
            </Line>
          );
        })}
        {/* C2 — trendline overlay (one Line per series) */}
        {trendOut && data.series.map((s) => {
          const tk = trendOut.trendKey(s.name);
          const tcolor = trendCfg!.color;
          const r2 = trendOut.r2ByName[s.name];
          const showR2 = trendCfg!.showR2 && isFinite(r2);
          return (
            <Line key={tk} isAnimationActive={false} dataKey={tk}
              name={showR2 ? `${s.name} (tend. R²=${r2.toFixed(2)})` : `${s.name} (tendência)`}
              type="monotone" stroke={tcolor}
              strokeWidth={trendCfg!.thickness}
              strokeDasharray={trendDash(trendCfg!.style)}
              dot={false} connectNulls
              yAxisId="left" />
          );
        })}
        {/* FIX 3 — forecast confidence band (Area between [lo, up]) */}
        {bandOn && trendOut && data.series.map((s) => (
          <Area key={`band_${s.name}`} isAnimationActive={false}
            dataKey={`__band_${s.name}`}
            stroke="none" fill={trendCfg!.color} fillOpacity={0.2}
            connectNulls yAxisId="left"
            legendType="none" />
        ))}
        {/* Combo: line series from second measure */}
        {ct === "combo" && lineSeriesData && lineSeriesData.series.map((s, i) => {
          const color = DEFAULT_PALETTE[(data.series.length + i) % DEFAULT_PALETTE.length];
          return (
            <Line key={`__line_${s.name}`} isAnimationActive={false}
              dataKey={`__line_${s.name}`} name={`${s.name} (linha)`}
              type="monotone" stroke={color} strokeWidth={2.5}
              yAxisId="right" dot={{ r: 3, fill: color }} />
          );
        })}
      </Comp>
    );
  } else if (ct === "bar" || ct === "column" || ct === "stackedColumn") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    chart = (
      <BarChart data={rows} layout="horizontal" onClick={chartOnClick}
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}{xAxis}{yAxis}
        <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              yAxisId="left"
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {/* C1 — conditional formatting + per-row dim cells */}
              {((style.conditionalRules?.length ?? 0) > 0 || ownFilterOnRowDim) && rows.map((r, ri) => {
                const baseFill = (style.conditionalRules?.length ?? 0) > 0
                  ? evalCondColor(Number(r[s.name]) || 0, style.conditionalRules, style.conditionalDefault || color)
                  : color;
                return <Cell key={`${s.name}-${ri}`} fill={baseFill} fillOpacity={cellFillOpacity(String(r.__period ?? ""))} />;
              })}
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                  content={makeLabelContent({
                    style, measureFmt, seriesName: s.name, categories: cats,
                    customFmt: isStack100 ? stack100Fmt : undefined,
                  }) as never} />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (ct === "hbar" || ct === "stackedBar") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    chart = (
      <BarChart data={rows} layout="vertical" onClick={chartOnClick}
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}
        <XAxis type="number" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
          stroke={xAx.lineColor} strokeWidth={xAx.lineWidth}
          domain={xDomain}
          tickFormatter={isStack100 ? stack100Fmt : axisFmt(xAx, measureFmt)}
          label={xAx.titleText ? { value: xAx.titleText, position: "insideBottom", offset: -5,
            style: { fontSize: xAx.titleSize, fill: xAx.titleColor } } : undefined} />
        <YAxis type="category" dataKey="__period"
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          stroke={yAx.lineColor} strokeWidth={yAx.lineWidth}
          label={yAx.titleText ? { value: yAx.titleText, angle: -90, position: "insideLeft",
            style: { fontSize: yAx.titleSize, fill: yAx.titleColor } } : undefined} />
        <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {((style.conditionalRules?.length ?? 0) > 0 || ownFilterOnRowDim) && rows.map((r, ri) => {
                const baseFill = (style.conditionalRules?.length ?? 0) > 0
                  ? evalCondColor(Number(r[s.name]) || 0, style.conditionalRules, style.conditionalDefault || color)
                  : color;
                return <Cell key={`${s.name}-${ri}`} fill={baseFill} fillOpacity={cellFillOpacity(String(r.__period ?? ""))} />;
              })}
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("bar-horizontal", dlPos) as never}
                  content={makeLabelContent({
                    style, measureFmt, seriesName: s.name, categories: cats,
                    customFmt: isStack100 ? stack100Fmt : undefined, anchor: "start",
                  }) as never} />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (ct === "pie" || ct === "donut") {
    const inner = ct === "donut"
      ? `${Math.max(0, Math.min(80, style.pie.donutHolePct))}%` : 0;
    const labelKey = style.pie.labelMode;
    const labelMode = mapPos("pie", dlPos); // "inside" | "outside"
    const isCallout = dlPos === "callout";
    // A.9 — per-slice explosion via custom shape
    const renderPieShape = (props: {
      cx: number; cy: number; midAngle: number;
      innerRadius: number; outerRadius: number;
      startAngle: number; endAngle: number; fill: string;
      payload: { name: string };
    }) => {
      const sliceCfg = style.pie.slices[props.payload.name];
      const explodePct = (sliceCfg?.explode ?? style.pie.explodePct ?? 0) / 100;
      const RAD = Math.PI / 180;
      const off = props.outerRadius * explodePct * 0.4;
      const dx = Math.cos(-props.midAngle * RAD) * off;
      const dy = Math.sin(-props.midAngle * RAD) * off;
      return (
        <Sector cx={props.cx + dx} cy={props.cy + dy}
          innerRadius={props.innerRadius} outerRadius={props.outerRadius}
          startAngle={props.startAngle} endAngle={props.endAngle}
          fill={props.fill} />
      );
    };
    const dl = style.dataLabels;
    const pieTotal = ranking.reduce((s, r) => s + Math.abs(r.value), 0) || 1;
    // FIX 5 — fully-styled pie label honoring size/color/bold/italic/format/position/showCategory
    const pieLabel = dl.show ? (props: any) => {
      const { cx, cy, midAngle, outerRadius, innerRadius, percent, value, name } = props;
      const RAD = Math.PI / 180;
      const inside = labelMode === "inside";
      const r = inside
        ? innerRadius + (outerRadius - innerRadius) * 0.55
        : outerRadius + (isCallout ? 24 : 12);
      const x = cx + r * Math.cos(-midAngle * RAD);
      const y = cy + r * Math.sin(-midAngle * RAD);
      const pct = (percent * 100).toFixed(dl.decimals ?? 1) + "%";
      const fmt = dl.format === "auto" ? measureFmt : dl.format;
      const valStr = formatValue(value, fmt, "rol", dl.decimals);
      let body: string;
      switch (labelKey) {
        case "value": body = valStr; break;
        case "percent": body = pct; break;
        case "name": body = name; break;
        case "name-value": body = `${name}: ${valStr}`; break;
        default: body = `${name}: ${pct}`;
      }
      const text = dl.showCategory ? `${name} · ${body}` : body;
      return (
        <text x={x} y={y} fill={dl.color}
          fontSize={dl.size}
          fontWeight={dl.bold ? 700 : 400}
          fontStyle={dl.italic ? "italic" : "normal"}
          textAnchor={x > cx ? "start" : "end"}
          dominantBaseline="central">{text}</text>
      );
    } : false;
    chart = (
      <PieChart onClick={chartOnClick}>
        <Tooltip content={(p: any) => (
          <ChartTooltip {...p} style={style} measureFmt={measureFmt} variant="pie" pieTotal={pieTotal} additionalRow={tooltipExtra ?? undefined} />
        )} />
        {renderLegend}
        <Pie data={ranking} isAnimationActive={false} dataKey="value" nameKey="name"
          startAngle={style.pie.startAngle}
          endAngle={style.pie.startAngle + 360}
          innerRadius={inner} outerRadius="80%"
          labelLine={!!pieLabel && (labelMode === "outside" || isCallout)}
          activeIndex={ranking.map((_, i) => i)}
          activeShape={renderPieShape as never}
          label={pieLabel as never}
          onClick={(_d: any, idx: number, e: any) =>
            handleEmit(ranking[idx]?.name, { shift: !!e?.shiftKey })}
        >
          {ranking.map((r, i) => {
            const sl = style.pie.slices[r.name];
            const color = sl?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
            const op = isDimmed(r.name) ? 0.4 : 1;
            return <Cell key={r.name} fill={color} fillOpacity={op} />;
          })}
        </Pie>
      </PieChart>
    );
  } else if (ct === "bubble" || ct === "scatter") {
    // A.4 — bubble/scatter use measureX/measureY/measure(size) when set
    const dim = seriesDim ?? "marca";
    const sizeRanking = ranking; // ranks by primary measure (drives size)
    const xRanking = style.measureX
      ? computeTopRanking(dsRows, block.filters, dim, style.measureX, 50, "all", null)
      : null;
    const yRanking = style.measureY
      ? computeTopRanking(dsRows, block.filters, dim, style.measureY, 50, "all", null)
      : null;
    const xByName = new Map(xRanking?.map((r) => [r.name, r.value]) ?? []);
    const yByName = new Map(yRanking?.map((r) => [r.name, r.value]) ?? []);
    // C3 — labelDim: pick representative dimension value per point
    const labelDim = block.fieldWells?.labelDim ?? null;
    const labelByName = new Map<string, string>();
    if (labelDim) {
      for (const r of dsRows) {
        const k = String((r as unknown as Record<string, unknown>)[dim] ?? "—");
        if (labelByName.has(k)) continue;
        const lv = String((r as unknown as Record<string, unknown>)[labelDim] ?? "");
        if (lv) labelByName.set(k, lv);
      }
    }
    const points = sizeRanking.map((r, i) => ({
      x: xRanking ? (xByName.get(r.name) ?? 0) : (i + 1),
      y: yRanking ? (yByName.get(r.name) ?? 0) : r.value,
      z: r.value,
      name: r.name,
      __label: labelDim ? (labelByName.get(r.name) ?? "") : "",
    }));
    const xLabel = style.measureX
      ? KPI_MEASURES_LABEL[style.measureX] : "Índice";
    const yLabel = style.measureY
      ? KPI_MEASURES_LABEL[style.measureY] : KPI_MEASURES_LABEL[block.measure];
    const xFmt = style.measureX ? inferFormat(style.measureX) : measureFmt;
    const yFmt = style.measureY ? inferFormat(style.measureY) : measureFmt;
    chart = (
      <ScatterChart onClick={chartOnClick}>
        {renderGrid}
        <XAxis type="number" dataKey="x" name={xLabel}
          domain={xDomain}
          tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
          tickFormatter={style.measureX ? axisFmt({ ...xAx, format: xAx.format }, xFmt) : undefined}
          label={(xAx.titleText || style.measureX) ? {
            value: xAx.titleText || xLabel, position: "insideBottom", offset: -5,
            style: { fontSize: xAx.titleSize, fill: xAx.titleColor },
          } : undefined} />
        <YAxis type="number" dataKey="y" name={yLabel}
          domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt({ ...yAx, format: yAx.format }, yFmt)}
          label={(yAx.titleText || style.measureY) ? {
            value: yAx.titleText || yLabel, angle: -90, position: "insideLeft",
            style: { fontSize: yAx.titleSize, fill: yAx.titleColor },
          } : undefined} />
        {ct === "bubble" && (
          <ZAxis type="number" dataKey="z" range={[style.bubble.minSize, style.bubble.maxSize]} />
        )}
        <Tooltip cursor={{ strokeDasharray: "3 3" }}
          content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} variant={ct === "bubble" ? "bubble" : "scatter"} additionalRow={tooltipExtra ?? undefined} />} />
        {renderLegend}
        <Scatter data={points} isAnimationActive={false} fill={DEFAULT_PALETTE[0]}
          fillOpacity={style.bubble.fillOpacity}
          stroke={style.bubble.borderColor} strokeWidth={style.bubble.borderWidth}>
          {points.map((p, i) => (
            <Cell key={p.name} fill={DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
              fillOpacity={isDimmed(p.name) ? 0.4 : (style.bubble.fillOpacity ?? 1)} />
          ))}
          {style.dataLabels.show && (
            <LabelList dataKey="name" position={mapPos("scatter", dlPos) as never}
              content={makeLabelContent({ style, measureFmt,
                customFmt: (_v) => "" }) as never} />
          )}
          {ct === "bubble" && style.bubble.showSizeLabel && (
            <LabelList dataKey="z" position="top"
              content={makeLabelContent({ style, measureFmt }) as never} />
          )}
          {/* C3 — labelDim renders dimension value next to each point */}
          {labelDim && (
            <LabelList dataKey="__label"
              content={(p: any) => {
                if (p.x == null || p.y == null || !p.value) return null;
                return (
                  <text x={p.x + 8} y={p.y - 8}
                    fontSize={style.dataLabels.size}
                    fill={style.dataLabels.color}
                    fontWeight={style.dataLabels.bold ? 700 : 400}
                    fontStyle={style.dataLabels.italic ? "italic" : "normal"}>
                    {String(p.value)}
                  </text>
                );
              }} />
          )}
        </Scatter>
      </ScatterChart>
    );
  } else if (ct === "waterfall") {
    chart = <WaterfallChart block={block} style={style} rows={rows} series={data.series} dsRows={dsRows} />;
  } else if (ct === "funnel") {
    // FIX 3 — replace recharts Funnel (broken triangles) with custom SVG trapezoids
    const fdata = ranking.map((r, i) => ({
      name: r.name, value: r.value,
      color: style.funnel.slices[r.name]?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }));
    chart = (
      <FunnelSVG data={fdata} style={style} measureFmt={measureFmt}
        onSliceClick={(name, e) => handleEmit(name, { shift: !!e.shiftKey })}
        dimmedNames={ownFilter && ownFilter.dimension === emitDim
          ? new Set(fdata.map(d => d.name).filter(n => !ownFilter.values.includes(n))) : null} />
    ) as React.ReactElement;
  } else if (ct === "treemap") {
    const total = ranking.reduce((s, r) => s + Math.abs(r.value), 0) || 1;
    const tdata = ranking.map((r, i) => {
      let fill: string;
      if (style.treemap.colorScheme === "gradient") {
        const t = ranking.length > 1 ? i / (ranking.length - 1) : 0;
        fill = mixHex(style.treemap.gradientFrom, style.treemap.gradientTo, t);
      } else {
        fill = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      }
      // C1 — conditional formatting overrides palette/gradient
      if ((style.conditionalRules?.length ?? 0) > 0) {
        fill = evalCondColor(r.value, style.conditionalRules, style.conditionalDefault || fill);
      }
      return { name: r.name, size: Math.abs(r.value), value: r.value, pct: (Math.abs(r.value) / total) * 100, fill };
    });
    chart = (
      <Treemap data={tdata} isAnimationActive={false} dataKey="size" nameKey="name"
        stroke={style.treemap.borderColor}
        aspectRatio={4 / 3}
        onClick={(node: any) => handleEmit(node?.name)}
        content={<TreemapTile cfg={style.treemap} dl={style.dataLabels} fmt={measureFmt} dimmedNames={ownFilter && ownFilter.dimension === emitDim ? new Set(ranking.map(r => r.name).filter(n => !ownFilter.values.includes(n))) : null} />} />
    );
  } else if (ct === "radar") {
    const polarGrid = (
      <PolarGrid stroke={style.radar.gridColor}
        gridType={style.radar.gridShape === "circle" ? "circle" : "polygon"} />
    );
    chart = (
      <RadarChart data={rows} outerRadius="80%" onClick={chartOnClick}>
        {polarGrid}
        <PolarAngleAxis dataKey="__period"
          tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }} />
        <PolarRadiusAxis tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          // FIX 7b — radar custom data labels via dot prop
          const dl = style.dataLabels;
          const dotRenderer = dl.show ? (props: any) => {
            const { cx, cy, value } = props;
            if (cx == null || cy == null) return <g />;
            const off = dl.position === "below" ? 12 : -8;
            const fmt = dl.format === "auto" ? measureFmt : dl.format;
            return (
              <g>
                <circle cx={cx} cy={cy} r={2.5} fill={color} />
                <text x={cx} y={cy + off} fontSize={dl.size} fill={dl.color}
                  fontWeight={dl.bold ? 700 : 400}
                  fontStyle={dl.italic ? "italic" : "normal"}
                  textAnchor="middle">
                  {formatValue(Number(value) || 0, fmt, "rol", dl.decimals)}
                </text>
              </g>
            );
          } : { r: 2.5, fill: color };
          return (
            <Radar key={s.name} isAnimationActive={false} dataKey={s.name}
              stroke={color} strokeWidth={cfg?.thickness ?? 2}
              strokeDasharray={dashArr(cfg?.lineStyle)}
              fill={color}
              fillOpacity={style.radar.fillArea ? style.radar.fillOpacity : 0}
              dot={dotRenderer as never} />
          );
        })}
      </RadarChart>
    );
  } else if (ct === "histogram") {
    // A.10 — when breakdown set, one histogram series per breakdown
    const seriesList = data.series.length > 0 ? data.series : [{ name: "Total", values: [] as number[] }];
    const allFlat: number[] = [];
    seriesList.forEach((s) => s.values.forEach((v) => { if (isFinite(v)) allFlat.push(v); }));
    const min = allFlat.length ? Math.min(...allFlat) : 0;
    const max = allFlat.length ? Math.max(...allFlat) : 1;
    const bins = Math.max(2, Math.min(100, style.histogram.bins || 10));
    const w = style.histogram.binWidth && style.histogram.binWidth > 0
      ? style.histogram.binWidth
      : ((max - min) / bins) || 1;
    const nBuckets = style.histogram.binWidth ? Math.max(1, Math.ceil((max - min) / w)) : bins;
    const buckets: Record<string, number | string>[] = Array.from({ length: nBuckets }, (_, i) => ({
      bin: `${(min + i * w).toFixed(1)}`,
    }));
    seriesList.forEach((s) => {
      buckets.forEach((b) => { b[s.name] = 0; });
      s.values.forEach((v) => {
        if (!isFinite(v)) return;
        const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor((v - min) / w)));
        buckets[idx][s.name] = (Number(buckets[idx][s.name]) || 0) + 1;
      });
    });
    if (style.histogram.cumulative) {
      seriesList.forEach((s) => {
        let acc = 0;
        buckets.forEach((b) => { acc += Number(b[s.name]) || 0; b[`__cum_${s.name}`] = acc; });
      });
    }
    chart = (
      <ComposedChart data={buckets} barCategoryGap="2%">
        {renderGrid}
        <XAxis dataKey="bin" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis yAxisId="left" tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        {style.histogram.cumulative && (
          <YAxis yAxisId="right" orientation="right"
            tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        )}
        <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {seriesList.map((s, i) => {
          const color = colorForSeries(style, s.name, i) ?? style.histogram.barColor;
          return (
            <Bar key={s.name} yAxisId="left" isAnimationActive={false}
              dataKey={s.name} name={s.name}
              fill={seriesList.length === 1 ? style.histogram.barColor : color}
              fillOpacity={seriesList.length > 1 ? 0.55 : 1}
              stroke={style.histogram.borderColor}
              strokeWidth={style.histogram.borderWidth}>
              {/* FIX 6 — histogram data labels (always above) */}
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position="top"
                  content={makeLabelContent({ style, measureFmt,
                    customFmt: (v) => Number.isInteger(v) ? String(v) : v.toFixed(0) }) as never} />
              )}
            </Bar>
          );
        })}
        {style.histogram.cumulative && seriesList.map((s, i) => (
          <Line key={`cum_${s.name}`} yAxisId="right" isAnimationActive={false}
            dataKey={`__cum_${s.name}`} name={`${s.name} (acum.)`}
            type="monotone"
            stroke={DEFAULT_PALETTE[(i + 1) % DEFAULT_PALETTE.length]}
            strokeWidth={2} dot={false} />
        ))}
      </ComposedChart>
    );
  } else if (ct === "boxplot") {
    chart = <BoxPlot block={block} style={style} series={data.series} />;
  }

  return (
    <Wrapper style={style}>
      {/* Cross-filter badges */}
      <div style={{ position: "absolute", top: 4, left: 4, zIndex: 5,
        display: "flex", flexDirection: "column", gap: 2, pointerEvents: "none" }}>
        {incoming.map((f) => (
          <span key={f.sourceBlockId + f.dimension} style={{
            background: "#1E3A8A", color: "#fff", fontSize: 10,
            padding: "2px 6px", borderRadius: 9999, fontWeight: 600,
          }}>
            {dimensionLabel(f.dimension)}: {f.values.join(", ")}
          </span>
        ))}
        {!participates && (
          <span style={{ background: "#475569", color: "#fff", fontSize: 9,
            padding: "1px 5px", borderRadius: 4 }}>🔒 sem filtro</span>
        )}
      </div>
      {ownFilter && (
        <div style={{ position: "absolute", top: 4, right: 4, zIndex: 5,
          background: "#C8102E", color: "#fff", fontSize: 10, padding: "2px 6px",
          borderRadius: 9999, fontWeight: 600, pointerEvents: "auto", cursor: "pointer" }}
          onClick={(e) => { e.stopPropagation(); cf.clearFilter(block.id); }}
          title="Limpar filtro deste gráfico">
          🔍 {ownFilter.values.join(", ")}
        </div>
      )}
      {style.general.titleShow && block.title && (
        <div style={{
          fontSize: style.general.titleSize, color: style.general.titleColor,
          fontWeight: style.general.titleBold ? 700 : 500,
          fontStyle: style.general.titleItalic ? "italic" : "normal",
          padding: "4px 8px",
        }}>{block.title}</div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children, style }: { children: React.ReactNode; style: ChartStyle }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: style.general.background,
      border: style.general.borderWidth > 0
        ? `${style.general.borderWidth}px solid ${style.general.borderColor}` : undefined,
      padding: style.general.padding,
      fontFamily: "Calibri, sans-serif", overflow: "hidden",
      position: "relative",
    }}>
      {children}
    </div>
  );
}

// -- Treemap tile renderer (A.7 — honors dataLabels) ---------------------
function TreemapTile({ cfg, dl, fmt, dimmedNames, ...props }: any) {
  const { x, y, width, height, name, value, fill } = props;
  if (width < 2 || height < 2) return null;
  const showCat = cfg.showCategoryLabel && width > 40 && height > 20;
  const showVal = cfg.showValueLabel && width > 60 && height > 32;
  const valStr = formatValue(
    value ?? 0,
    dl?.format && dl.format !== "auto" ? dl.format : fmt,
    "rol",
    dl?.decimals,
  );
  const fontWeight = dl?.bold ? 700 : 400;
  const fontStyle = dl?.italic ? "italic" : "normal";
  const fs = dl?.size ?? 11;
  const fc = dl?.color ?? "#FFFFFF";
  const op = dimmedNames && dimmedNames.has(name) ? 0.4 : 1;
  return (
    <g opacity={op}>
      <rect x={x} y={y} width={width} height={height}
        style={{ fill, stroke: cfg.borderColor, strokeWidth: cfg.borderWidth }} />
      {showCat && (
        <text x={x + 4} y={y + fs + 2}
          fontSize={fs} fill={fc}
          fontWeight={fontWeight} fontStyle={fontStyle}>{name}</text>
      )}
      {showVal && (
        <text x={x + 4} y={y + fs * 2 + 6}
          fontSize={fs - 1} fill={fc}
          fontWeight={fontWeight} fontStyle={fontStyle}>
          {valStr}
        </text>
      )}
    </g>
  );
}

// -- Color blend (hex) -----------------------------------------------------
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", ""); const pb = b.replace("#", "");
  const ra = parseInt(pa.slice(0, 2), 16), ga = parseInt(pa.slice(2, 4), 16), ba = parseInt(pa.slice(4, 6), 16);
  const rb = parseInt(pb.slice(0, 2), 16), gb = parseInt(pb.slice(2, 4), 16), bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

// -- Waterfall (custom Recharts composition) -------------------------------
// FIX 1+2 — supports both legacy per-period mode AND smart column-builder mode.
function WaterfallChart({
  block, style, series, dsRows: dsRowsProp,
}: {
  block: ChartBlock;
  style: ChartStyle;
  rows: Record<string, number | string>[];
  series: { name: string; values: number[] }[];
  dsRows?: PricingRow[];
}) {
  const measureFmt = inferFormat(block.measure);
  const pricing = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const budget = useBudget((s) => s.rows);
  const dsRows = dsRowsProp
    ?? (block.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing);

  const wfMode = style.waterfall.mode ?? "pvm";
  const pvmCfg = style.waterfall.pvm ?? { base: null, comp: null, periodMode: "month" as const };

  // PVM mode — decomposição igual à aba Bridge
  const pvmItems = useMemo(() => {
    if (wfMode !== "pvm") return null;
    if (!pvmCfg.base || !pvmCfg.comp || pvmCfg.base === pvmCfg.comp) return [];
    const filtered = applyFilters(dsRows, block.filters, null);
    const labels = pvmCfg.periodMode === "month" ? {
      base: (() => { const r = filtered.find((x) => x.periodo === pvmCfg.base); return r ? monthLabel(r.mes, r.ano) : pvmCfg.base!; })(),
      comp: (() => { const r = filtered.find((x) => x.periodo === pvmCfg.comp); return r ? monthLabel(r.mes, r.ano) : pvmCfg.comp!; })(),
    } : undefined;
    try {
      const r = calcPVM(filtered, metric, pvmCfg.base, pvmCfg.comp, pvmCfg.periodMode, labels);
      const t = (v: number): "positive" | "negative" => v >= 0 ? "positive" : "negative";
      return [
        { label: r.baseLabel,    value: r.base,       type: "start" as const },
        { label: "Volume",       value: r.volume,     type: t(r.volume) },
        { label: "Preço",        value: r.price,      type: t(r.price) },
        { label: "Custo",        value: r.cost,       type: t(r.cost) },
        { label: "Frete",        value: r.freight,    type: t(r.freight) },
        { label: "Comissão",     value: r.commission, type: t(r.commission) },
        { label: "Outros",       value: r.others,     type: t(r.others) },
        { label: r.currentLabel, value: r.current,    type: "total" as const },
      ];
    } catch { return []; }
  }, [wfMode, pvmCfg.base, pvmCfg.comp, pvmCfg.periodMode, dsRows, block.filters, metric]);

  // Smart column / fallback (modo manual)
  const cols = style.waterfall.columns;
  const items = useMemo(() => {
    if (wfMode === "pvm") return pvmItems ?? [];
    if (cols && cols.length > 0) {
      const resolved = resolveBridgeColumns(cols, dsRows, block.filters, block.measure);
      return resolved.map((r) => ({ label: r.label, value: r.value, type: r.type }));
    }
    const s0 = series[0];
    if (!s0) return [];
    return s0.values.map((v, i) => ({
      label: `P${i + 1}`,
      value: v,
      type: (style.waterfall.classify[`P${i + 1}`] ?? (v >= 0 ? "positive" : "negative")) as
        "start" | "positive" | "negative" | "total" | "subtotal",
    }));
  }, [wfMode, pvmItems, cols, dsRows, block.filters, block.measure, series, style.waterfall.classify]);

  const wfRows = useMemo(() => {
    let acc = 0;
    return items.map((it) => {
      let base: number, delta: number, end: number, signed: number;
      if (it.type === "start" || it.type === "total" || it.type === "subtotal") {
        const target = it.type === "start" ? it.value
          : it.type === "subtotal" ? acc
          : it.value;
        base = Math.min(0, target);
        delta = Math.abs(target);
        end = target;
        signed = target;
        acc = target;
      } else {
        const v = it.type === "negative" ? -Math.abs(it.value) : Math.abs(it.value);
        const next = acc + v;
        base = Math.min(acc, next);
        delta = Math.max(0.0001, Math.abs(v)); // ensure non-zero so bar is visible
        end = next;
        signed = v;
        acc = next;
      }
      return { label: it.label, base, delta, end, signed, type: it.type };
    });
  }, [items]);

  const colorOf = (t: string) =>
    t === "positive" ? style.waterfall.positiveColor
    : t === "negative" ? style.waterfall.negativeColor
    : style.waterfall.totalColor;

  const labelPos = style.waterfall.labelPos === "inside" ? "center"
    : style.waterfall.labelPos === "below" ? "bottom" : "top";

  // Compute Y domain explicitly so empty/edge cases don't render blank
  const allEnds = wfRows.flatMap((r) => [r.base, r.base + r.delta, r.end]);
  const yMin = style.yAxis.min ?? Math.min(0, ...allEnds);
  const yMax = style.yAxis.max ?? Math.max(0, ...allEnds);

  return (
    <BarChart data={wfRows} barCategoryGap={`${style.waterfall.gapPct}%`}>
      {style.grid.show && (
        <CartesianGrid stroke={style.grid.color}
          strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      )}
      <XAxis dataKey="label" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        domain={[yMin, yMax]}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} variant="waterfall" />} />
      {renderRefLines(style)}
      {style.waterfall.connectors && wfRows.slice(0, -1).map((r, i) => (
        <ReferenceLine key={`c-${i}`} segment={[
          { x: r.label, y: r.end }, { x: wfRows[i + 1].label, y: r.end },
        ]} stroke={style.waterfall.connectorColor}
          strokeDasharray={dashArr(style.waterfall.connectorStyle)} />
      ))}
      <Bar isAnimationActive={false} dataKey="base" stackId="wf" fill="transparent" />
      <Bar isAnimationActive={false} dataKey="delta" stackId="wf">
        {wfRows.map((r) => {
          const baseFill = colorOf(r.type);
          const fill = evalCondColor(r.signed, style.conditionalRules, baseFill);
          return <Cell key={r.label} fill={fill} />;
        })}
        {style.dataLabels.show && (
          <LabelList dataKey="end" position={labelPos as never}
            style={{ fontSize: style.dataLabels.size, fill: style.dataLabels.color,
              fontWeight: style.dataLabels.bold ? 700 : 400,
              fontStyle: style.dataLabels.italic ? "italic" : "normal" }}
            formatter={(v: number) => formatValue(v,
              style.dataLabels.format === "auto" ? measureFmt : style.dataLabels.format,
              "rol", style.dataLabels.decimals)} />
        )}
      </Bar>
      {style.waterfall.showRunningTotal && (
        <Line type="linear" dataKey="end" isAnimationActive={false}
          stroke={style.waterfall.totalColor} strokeWidth={2}
          dot={{ r: 3, fill: style.waterfall.totalColor }} />
      )}
    </BarChart>
  );
}

// -- Box & Whisker --------------------------------------------------------
function BoxPlot({
  block, style, series,
}: {
  block: ChartBlock;
  style: ChartStyle;
  series: { name: string; values: number[] }[];
}) {
  const measureFmt = inferFormat(block.measure);
  const stats = series.map((s, idx) => {
    const sorted = [...s.values].filter((v) => isFinite(v)).sort((a, b) => a - b);
    const n = sorted.length;
    const q = (p: number) => sorted[Math.floor((n - 1) * p)] ?? 0;
    const q1 = q(0.25); const q2 = q(0.5); const q3 = q(0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const inFence = sorted.filter((v) => v >= lowerFence && v <= upperFence);
    const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
    const min = inFence[0] ?? q1;
    const max = inFence[inFence.length - 1] ?? q3;
    const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0;
    const cfg = style.series.find((x) => x.key === s.name);
    return {
      name: s.name, q1, q2, q3, min, max, mean, outliers,
      color: cfg?.color ?? style.boxplot.boxFillColor, idx,
    };
  });

  const all = stats.flatMap((s) => [s.min, s.max, ...s.outliers]);
  // A.12 — honor user yAxis.min/max when set
  const yMin = style.yAxis.min ?? (all.length ? Math.min(...all) : 0);
  const yMax = style.yAxis.max ?? (all.length ? Math.max(...all) : 1);

  return (
    <ComposedChart data={stats}>
      <CartesianGrid stroke={style.grid.color}
        strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      <XAxis dataKey="name" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis domain={[yMin, yMax]}
        tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip content={(p: any) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} />} />
      <Bar dataKey="q1" stackId="bp" fill="transparent" isAnimationActive={false} />
      <Bar dataKey={(r: any) => r.q3 - r.q1} stackId="bp"
        isAnimationActive={false}
        shape={(props: any) => {
          const { x, y, width, height, payload } = props;
          const cy = (v: number) => {
            const range = yMax - yMin || 1;
            return y + height - ((v - payload.q1) / (payload.q3 - payload.q1 || 1)) * height;
          };
          // Convert chart-relative coords with same plot
          const plotTop = y; const plotBot = y + height;
          const scale = (v: number) => {
            const range = yMax - yMin || 1;
            return plotBot - ((v - yMin) / range) * (plotBot - plotTop) * 0;
          };
          // Use simple proportional mapping inside the bar's own band
          const yMinBar = y; const yMaxBar = y + height;
          // Recompute proper full-axis mapping: use external yMin/yMax
          const yPx = (v: number) => {
            const top = props.background?.y ?? y;
            const totalH = props.background?.height ?? height;
            const range = yMax - yMin || 1;
            return top + totalH - ((v - yMin) / range) * totalH;
          };
          const yQ1 = yPx(payload.q1);
          const yQ3 = yPx(payload.q3);
          const yMed = yPx(payload.q2);
          const yMn = yPx(payload.min);
          const yMx = yPx(payload.max);
          const yMean = yPx(payload.mean);
          const cx = x + width / 2;
          return (
            <g>
              {/* whisker line */}
              <line x1={cx} x2={cx} y1={yMx} y2={yMn}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              {/* whisker caps */}
              <line x1={x + width * 0.25} x2={x + width * 0.75} y1={yMx} y2={yMx}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              <line x1={x + width * 0.25} x2={x + width * 0.75} y1={yMn} y2={yMn}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              {/* box */}
              <rect x={x} y={yQ3} width={width} height={Math.max(1, yQ1 - yQ3)}
                fill={payload.color} stroke={style.boxplot.whiskerColor} />
              {/* median */}
              <line x1={x} x2={x + width} y1={yMed} y2={yMed}
                stroke={style.boxplot.medianColor} strokeWidth={style.boxplot.medianWidth} />
              {/* mean */}
              {style.boxplot.showMean && (
                <circle cx={cx} cy={yMean} r={3} fill={style.boxplot.medianColor} />
              )}
              {/* outliers */}
              {style.boxplot.showOutliers && payload.outliers.map((o: number, i: number) => (
                <circle key={i} cx={cx} cy={yPx(o)} r={2.5}
                  fill="none" stroke={style.boxplot.whiskerColor} strokeWidth={1} />
              ))}
            </g>
          );
        }}
      />
    </ComposedChart>
  );
}
