// ChartCanvas — single Recharts-based renderer for every ChartBlock variant.
// Reads the unified ChartStyle so the inspector can drive every visual knob.

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip, LabelList,
  FunnelChart, Funnel, Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { ChartBlock } from "@/lib/customSlide";
import { usePricing } from "@/store/pricing";
import { computeChartSeries, computeTopRanking, formatValue, inferFormat } from "@/lib/customKpi";
import { resolveChartFit } from "@/lib/customCapacity";
import {
  ensureChartStyle, colorForSeries, DEFAULT_PALETTE, type ChartStyle,
} from "./types";

// -- helpers ---------------------------------------------------------------
function fmtVal(v: number, style: ChartStyle, fallback: ReturnType<typeof inferFormat>) {
  const f = style.dataLabels.format === "auto" ? fallback : style.dataLabels.format;
  return formatValue(v, f, "rol"); // measure not used when format != auto
}
function axisFmt(ax: { format: string; decimals: number }, fallback: ReturnType<typeof inferFormat>) {
  return (v: number) => {
    if (!isFinite(v)) return "";
    const f = ax.format === "auto" ? fallback : ax.format;
    return formatValue(v, f as never, "rol");
  };
}

// -- main ------------------------------------------------------------------
export function ChartCanvas({ block }: { block: ChartBlock }) {
  const style = useMemo(() => ensureChartStyle(block.style), [block.style]);
  const measureFmt = inferFormat(block.measure);

  // ---- common series fetch (line/bar/column/hbar/area/combo) ----
  const pricing = usePricing((s) => s.rows);
  const raw = useMemo(
    () => computeChartSeries(pricing, block.filters, block.measure, block.breakdown),
    [pricing, block.filters, block.measure, block.breakdown],
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
    return { periodos: raw.periodos, series: visible };
  }, [raw, block.h, block.w, block.autoFit, block.maxSeries, block.showOthers]);

  // ---- ranking-style data for pie/donut/bubble/scatter/funnel/treemap ----
  const rankingTypes = ["pie", "donut", "bubble", "scatter", "funnel", "treemap"];
  const ranking = useMemo(() => {
    if (!rankingTypes.includes(block.chartType)) return [];
    return computeTopRanking(
      pricing, block.filters,
      block.breakdown ?? "marca",
      block.measure, 50, "all", null,
    );
  }, [pricing, block.filters, block.breakdown, block.measure, block.chartType]);

  // ---- empty states ----
  const seriesEmpty = data.periodos.length === 0 || data.series.length === 0;
  const rankingEmpty = ranking.length === 0;
  const isRankingChart = rankingTypes.includes(block.chartType);

  if ((isRankingChart && rankingEmpty) || (!isRankingChart && seriesEmpty)) {
    return (
      <Wrapper style={style}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Sem dados para os filtros escolhidos
        </div>
      </Wrapper>
    );
  }

  // ---- pivot to recharts row format for series-based charts ----
  const rows = data.periodos.map((p, i) => {
    const r: Record<string, number | string> = { __period: p.label };
    data.series.forEach((s) => { r[s.name] = s.values[i] ?? 0; });
    return r;
  });

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

  const renderGrid = style.grid.show && !["pie", "donut"].includes(block.chartType) ? (
    <CartesianGrid stroke={style.grid.color}
      strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
  ) : null;

  const xAx = style.xAxis;
  const yAx = style.yAxis;

  const xAxis = xAx.show ? (
    <XAxis
      dataKey="__period"
      tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
      stroke={xAx.lineColor} tickLine={xAx.ticks}
      label={xAx.titleText ? { value: xAx.titleText, position: "insideBottom",
        offset: -2, style: { fontSize: xAx.titleSize, fill: xAx.titleColor } } : undefined}
    />
  ) : <XAxis hide />;
  const yAxis = yAx.show ? (
    <YAxis
      tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
      stroke={yAx.lineColor} tickLine={yAx.ticks}
      domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
      tickFormatter={axisFmt(yAx, measureFmt)}
      label={yAx.titleText ? { value: yAx.titleText, angle: -90, position: "insideLeft",
        style: { fontSize: yAx.titleSize, fill: yAx.titleColor } } : undefined}
    />
  ) : <YAxis hide />;

  const labelStyle = { fontSize: style.dataLabels.size, fill: style.dataLabels.color,
    fontWeight: style.dataLabels.bold ? 700 : 400,
    fontStyle: style.dataLabels.italic ? "italic" : "normal" };

  // ---- renderers per chart type ----
  let chart: React.ReactNode = null;
  const ct = block.chartType;
  const forceStack = ct === "stackedColumn" || ct === "stackedBar" || ct === "stackedArea";

  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "combo") {
    const Comp = (ct === "area" || ct === "stackedArea") ? AreaChart
      : ct === "combo" ? ComposedChart : LineChart;
    chart = (
      <Comp data={rows}>
        {renderGrid}{xAxis}{yAxis}
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          const dash = cfg?.lineStyle === "dashed" ? "5 5"
            : cfg?.lineStyle === "dotted" ? "2 4" : "0";
          if (ct === "area" || ct === "stackedArea") {
            const stacked = forceStack || style.area.stacked;
            return (
              <Area key={s.name} dataKey={s.name} type={cfg?.smooth ? "monotone" : "linear"}
                stroke={color} fill={color}
                fillOpacity={style.area.lineOnTop ? (cfg?.areaOpacity ?? 0.35) : 0.5}
                stackId={stacked ? "stack" : undefined}
                strokeWidth={cfg?.thickness ?? 2}>
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position="top" style={labelStyle}
                    formatter={(v: number) => fmtVal(v, style, measureFmt)} />
                )}
              </Area>
            );
          }
          if (ct === "combo" && !cfg?.asLine) {
            return (
              <Bar key={s.name} dataKey={s.name} fill={color}
                radius={style.bar.cornerRadius} stroke={style.bar.borderColor}
                strokeWidth={style.bar.borderWidth}
                yAxisId={cfg?.secondaryAxis ? "right" : undefined}>
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={style.dataLabels.position as never}
                    style={labelStyle}
                    formatter={(v: number) => fmtVal(v, style, measureFmt)} />
                )}
              </Bar>
            );
          }
          return (
            <Line key={s.name} dataKey={s.name} type={cfg?.smooth ? "monotone" : "linear"}
              stroke={color} strokeWidth={cfg?.thickness ?? 2.5}
              strokeDasharray={dash}
              dot={cfg?.marker?.show !== false ? {
                r: cfg?.marker?.size ?? 3,
                fill: cfg?.marker?.fill ?? color,
                stroke: cfg?.marker?.border ?? color,
              } : false}>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position="top" style={labelStyle}
                  formatter={(v: number) => fmtVal(v, style, measureFmt)} />
              )}
            </Line>
          );
        })}
      </Comp>
    );
  } else if (ct === "bar" || ct === "column" || ct === "stackedColumn") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    chart = (
      <BarChart data={rows} layout="horizontal"
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}{xAxis}{yAxis}
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={style.dataLabels.position as never}
                  style={labelStyle}
                  formatter={(v: number) => fmtVal(v, style, measureFmt)} />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (ct === "hbar" || ct === "stackedBar") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    chart = (
      <BarChart data={rows} layout="vertical"
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}
        <XAxis type="number" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
          tickFormatter={axisFmt(xAx, measureFmt)} />
        <YAxis type="category" dataKey="__period"
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth} />
          );
        })}
      </BarChart>
    );
  } else if (ct === "pie" || ct === "donut") {
    const inner = ct === "donut"
      ? `${Math.max(0, Math.min(80, style.pie.donutHolePct))}%` : 0;
    const labelKey = style.pie.labelMode;
    chart = (
      <PieChart>
        <Tooltip />
        {renderLegend}
        <Pie data={ranking} dataKey="value" nameKey="name"
          startAngle={style.pie.startAngle}
          endAngle={style.pie.startAngle + 360}
          innerRadius={inner} outerRadius="80%"
          label={(d: { name: string; value: number; percent: number }) => {
            const pct = (d.percent * 100).toFixed(1) + "%";
            switch (labelKey) {
              case "value": return formatValue(d.value, measureFmt, "rol");
              case "percent": return pct;
              case "name": return d.name;
              case "name-value": return `${d.name}: ${formatValue(d.value, measureFmt, "rol")}`;
              default: return `${d.name}: ${pct}`;
            }
          }}
        >
          {ranking.map((r, i) => {
            const sl = style.pie.slices[r.name];
            const color = sl?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
            return <Cell key={r.name} fill={color} />;
          })}
        </Pie>
      </PieChart>
    );
  } else if (ct === "bubble" || ct === "scatter") {
    const points = ranking.map((r, i) => ({ x: i + 1, y: r.value, z: r.value, name: r.name }));
    chart = (
      <ScatterChart>
        {renderGrid}
        <XAxis type="number" dataKey="x" name="idx"
          tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis type="number" dataKey="y" name="valor"
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        {ct === "bubble" && (
          <ZAxis type="number" dataKey="z" range={[style.bubble.minSize, style.bubble.maxSize]} />
        )}
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        {renderLegend}
        <Scatter data={points} fill={DEFAULT_PALETTE[0]}
          fillOpacity={style.bubble.fillOpacity}
          stroke={style.bubble.borderColor} strokeWidth={style.bubble.borderWidth}>
          {points.map((p, i) => (
            <Cell key={p.name} fill={DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]} />
          ))}
        </Scatter>
      </ScatterChart>
    );
  } else if (ct === "waterfall") {
    chart = <WaterfallChart block={block} style={style} rows={rows} series={data.series} />;
  } else if (ct === "funnel") {
    const fdata = ranking.map((r, i) => ({
      name: r.name, value: r.value,
      fill: DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }));
    chart = (
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="value" data={fdata} isAnimationActive>
          <LabelList position="right" fill={style.dataLabels.color}
            stroke="none" dataKey="name" style={{ fontSize: style.dataLabels.size }} />
        </Funnel>
      </FunnelChart>
    );
  } else if (ct === "treemap") {
    const tdata = ranking.map((r, i) => ({
      name: r.name, size: Math.abs(r.value),
      fill: DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }));
    chart = (
      <Treemap data={tdata} dataKey="size" nameKey="name" stroke="#fff"
        fill={DEFAULT_PALETTE[0]} aspectRatio={4 / 3} />
    );
  } else if (ct === "radar") {
    chart = (
      <RadarChart data={rows} outerRadius="80%">
        <PolarGrid stroke={style.grid.color} />
        <PolarAngleAxis dataKey="__period"
          tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <PolarRadiusAxis tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Radar key={s.name} dataKey={s.name} stroke={color} fill={color}
              fillOpacity={0.35} />
          );
        })}
      </RadarChart>
    );
  } else if (ct === "histogram") {
    const s0 = data.series[0];
    const vals = s0 ? s0.values.filter((v) => isFinite(v)) : [];
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    const bins = 10;
    const w = (max - min) / bins || 1;
    const buckets = Array.from({ length: bins }, (_, i) => ({
      bin: `${(min + i * w).toFixed(0)}`,
      count: 0,
    }));
    vals.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor((v - min) / w));
      buckets[idx].count++;
    });
    chart = (
      <BarChart data={buckets} barCategoryGap="2%">
        {renderGrid}
        <XAxis dataKey="bin" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        <Tooltip />
        <Bar dataKey="count" fill={DEFAULT_PALETTE[0]}
          stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth} />
      </BarChart>
    );
  } else if (ct === "boxplot") {
    const stats = data.series.map((s) => {
      const sorted = [...s.values].filter((v) => isFinite(v)).sort((a, b) => a - b);
      const q = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
      return {
        name: s.name, q1: q(0.25), iqr: q(0.75) - q(0.25),
      };
    });
    chart = (
      <ComposedChart data={stats}>
        {renderGrid}
        <XAxis dataKey="name" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        <Tooltip />
        {renderLegend}
        <Bar dataKey="q1" stackId="bp" fill="transparent" />
        <Bar dataKey="iqr" stackId="bp" fill={DEFAULT_PALETTE[0]} name="IQR" />
      </ComposedChart>
    );
  }

  return (
    <Wrapper style={style}>
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
    }}>
      {children}
    </div>
  );
}

// -- Waterfall (custom Recharts composition) -------------------------------
function WaterfallChart({
  block, style, series,
}: {
  block: ChartBlock;
  style: ChartStyle;
  rows: Record<string, number | string>[];
  series: { name: string; values: number[] }[];
}) {
  const measureFmt = inferFormat(block.measure);
  // Aggregate first series across periods → one bar per period.
  // Each bar value = primary series value at that period.
  const items = useMemo(() => {
    const s0 = series[0];
    if (!s0) return [];
    return s0.values.map((v, i) => ({
      name: String(block.measure),
      label: `P${i + 1}`,
      value: v,
    }));
  }, [series, block.measure]);

  // Build cumulative running base + delta for stacked invisible "base" + colored "delta"
  const wfRows = useMemo(() => {
    let acc = 0;
    return items.map((it) => {
      const cls = style.waterfall.classify[it.label] ?? (it.value >= 0 ? "positive" : "negative");
      const isTotal = cls === "total";
      const start = isTotal ? 0 : acc;
      const end = isTotal ? it.value : acc + it.value;
      const row = {
        label: it.label,
        base: Math.min(start, end),
        delta: Math.abs(end - start),
        cls,
        end,
      };
      acc = end;
      return row;
    });
  }, [items, style.waterfall.classify]);

  const colorOf = (cls: string) =>
    cls === "positive" ? style.waterfall.positiveColor
    : cls === "negative" ? style.waterfall.negativeColor
    : style.waterfall.totalColor;

  return (
    <BarChart data={wfRows} barCategoryGap={`${style.waterfall.gapPct}%`}>
      {style.grid.show && (
        <CartesianGrid stroke={style.grid.color}
          strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      )}
      <XAxis dataKey="label" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip />
      <Bar dataKey="base" stackId="wf" fill="transparent" />
      <Bar dataKey="delta" stackId="wf">
        {wfRows.map((r) => <Cell key={r.label} fill={colorOf(r.cls)} />)}
        {style.dataLabels.show && (
          <LabelList dataKey="end" position={style.waterfall.labelPos === "inside" ? "center" : "top"}
            style={{ fontSize: style.dataLabels.size, fill: style.dataLabels.color }}
            formatter={(v: number) => formatValue(v, measureFmt, "rol")} />
        )}
      </Bar>
    </BarChart>
  );
}
