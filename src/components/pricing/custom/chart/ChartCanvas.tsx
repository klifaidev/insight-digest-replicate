// ChartCanvas — single Recharts-based renderer for every ChartBlock variant.
// Reads the unified ChartStyle so the inspector can drive every visual knob.

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip, LabelList,
  FunnelChart, Funnel, Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine,
} from "recharts";
import type { ChartBlock } from "@/lib/customSlide";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { budgetRowsAsPricing } from "@/lib/budgetAdapter";
import { computeChartSeries, computeTopRanking, formatValue, inferFormat } from "@/lib/customKpi";
import { resolveChartFit } from "@/lib/customCapacity";
import {
  ensureChartStyle, colorForSeries, DEFAULT_PALETTE, type ChartStyle,
} from "./types";

// -- helpers ---------------------------------------------------------------
function fmtVal(v: number, style: ChartStyle, fallback: ReturnType<typeof inferFormat>) {
  const f = style.dataLabels.format === "auto" ? fallback : style.dataLabels.format;
  return formatValue(v, f, "rol");
}
function axisFmt(ax: { format: string; decimals: number }, fallback: ReturnType<typeof inferFormat>) {
  return (v: number) => {
    if (!isFinite(v)) return "";
    const f = ax.format === "auto" ? fallback : ax.format;
    return formatValue(v, f as never, "rol");
  };
}
function dashArr(s?: "solid" | "dashed" | "dotted") {
  return s === "dashed" ? "5 5" : s === "dotted" ? "2 4" : "0";
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
  const dsRows = useMemo(
    () => (block.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing),
    [block.dataSource, pricing, budget],
  );
  const raw = useMemo(
    () => computeChartSeries(dsRows, block.filters, block.measure, block.breakdown),
    [dsRows, block.filters, block.measure, block.breakdown],
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

  // Combo: optional second measure for line series
  const lineSeriesData = useMemo(() => {
    if (block.chartType !== "combo" || !style.measureLine) return null;
    return computeChartSeries(dsRows, block.filters, style.measureLine, block.breakdown);
  }, [block.chartType, style.measureLine, dsRows, block.filters, block.breakdown]);

  // ---- ranking-style data for pie/donut/bubble/scatter/funnel/treemap ----
  const rankingTypes = ["pie", "donut", "bubble", "scatter", "funnel", "treemap"];
  const ranking = useMemo(() => {
    if (!rankingTypes.includes(block.chartType)) return [];
    return computeTopRanking(
      dsRows, block.filters,
      block.breakdown ?? "marca",
      block.measure, 50, "all", null,
    );
  }, [dsRows, block.filters, block.breakdown, block.measure, block.chartType]);

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

  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "combo") {
    const Comp = (ct === "area" || ct === "stackedArea") ? AreaChart
      : ct === "combo" ? ComposedChart : LineChart;
    chart = (
      <Comp data={rows}>
        {renderGrid}{xAxis}{yAxis}{yAxisRight}
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          const dash = dashArr(cfg?.lineStyle);
          if (ct === "area" || ct === "stackedArea") {
            const stacked = forceStack || style.area.stacked;
            return (
              <Area key={s.name} isAnimationActive={false} dataKey={s.name}
                type={cfg?.smooth ? "monotone" : "linear"}
                stroke={color} fill={color}
                fillOpacity={cfg?.areaOpacity ?? 0.35}
                strokeWidth={style.area.lineOnTop ? (cfg?.thickness ?? 2.5) : (cfg?.thickness ?? 1)}
                strokeDasharray={dash}
                stackId={stacked ? "stack" : undefined}
                yAxisId="left">
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={mapPos("area", dlPos) as never}
                    style={labelStyle}
                    formatter={(v: number) => fmtVal(v, style, measureFmt)} />
                )}
              </Area>
            );
          }
          if (ct === "combo" && !cfg?.asLine) {
            return (
              <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
                radius={style.bar.cornerRadius} stroke={style.bar.borderColor}
                strokeWidth={style.bar.borderWidth}
                yAxisId={cfg?.secondaryAxis ? "right" : "left"}>
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                    style={labelStyle}
                    formatter={(v: number) => fmtVal(v, style, measureFmt)} />
                )}
              </Bar>
            );
          }
          return (
            <Line key={s.name} isAnimationActive={false} dataKey={s.name}
              type={cfg?.smooth ? "monotone" : "linear"}
              stroke={color} strokeWidth={cfg?.thickness ?? 2.5}
              strokeDasharray={dash}
              yAxisId={ct === "combo" && cfg?.secondaryAxis ? "right" : "left"}
              dot={cfg?.marker?.show !== false ? {
                r: cfg?.marker?.size ?? 3,
                fill: cfg?.marker?.fill ?? color,
                stroke: cfg?.marker?.border ?? color,
              } : false}>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("line", dlPos) as never}
                  style={labelStyle}
                  formatter={(v: number) => fmtVal(v, style, measureFmt)} />
              )}
            </Line>
          );
        })}
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
      <BarChart data={rows} layout="horizontal"
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}{xAxis}{yAxis}
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              yAxisId="left"
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                  style={labelStyle}
                  formatter={(v: number) => isStack100 ? `${(v as number).toFixed(0)}%` : fmtVal(v, style, measureFmt)} />
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
          domain={xDomain}
          tickFormatter={isStack100 ? (v: number) => `${v.toFixed(0)}%` : axisFmt(xAx, measureFmt)} />
        <YAxis type="category" dataKey="__period"
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("bar-horizontal", dlPos) as never}
                  style={labelStyle}
                  formatter={(v: number) => isStack100 ? `${(v as number).toFixed(0)}%` : fmtVal(v, style, measureFmt)} />
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
    const labelInside = mapPos("pie", dlPos) === "inside";
    chart = (
      <PieChart>
        <Tooltip />
        {renderLegend}
        <Pie data={ranking} isAnimationActive={false} dataKey="value" nameKey="name"
          startAngle={style.pie.startAngle}
          endAngle={style.pie.startAngle + 360}
          innerRadius={inner} outerRadius="80%"
          labelLine={!labelInside}
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
          domain={xDomain}
          tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis type="number" dataKey="y" name="valor"
          domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        {ct === "bubble" && (
          <ZAxis type="number" dataKey="z" range={[style.bubble.minSize, style.bubble.maxSize]} />
        )}
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        {renderLegend}
        <Scatter data={points} isAnimationActive={false} fill={DEFAULT_PALETTE[0]}
          fillOpacity={style.bubble.fillOpacity}
          stroke={style.bubble.borderColor} strokeWidth={style.bubble.borderWidth}>
          {points.map((p, i) => (
            <Cell key={p.name} fill={DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]} />
          ))}
          {style.dataLabels.show && (
            <LabelList dataKey="name" position={mapPos("scatter", dlPos) as never}
              style={labelStyle} />
          )}
          {ct === "bubble" && style.bubble.showSizeLabel && (
            <LabelList dataKey="z" position="top" style={labelStyle}
              formatter={(v: number) => fmtVal(v, style, measureFmt)} />
          )}
        </Scatter>
      </ScatterChart>
    );
  } else if (ct === "waterfall") {
    chart = <WaterfallChart block={block} style={style} rows={rows} series={data.series} />;
  } else if (ct === "funnel") {
    const ordered = style.funnel.direction === "btt" ? [...ranking].reverse() : ranking;
    const fdata = ordered.map((r, i) => ({
      name: r.name, value: r.value,
      fill: style.funnel.slices[r.name]?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }));
    const total = fdata.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
    chart = (
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="value" data={fdata} isAnimationActive={false}>
          <LabelList position="right" fill={style.dataLabels.color}
            stroke="none"
            style={{ fontSize: style.dataLabels.size }}
            formatter={(_v: unknown, entry: { name?: string; value?: number } = {}) => {
              const name = entry.name ?? "";
              const value = entry.value ?? 0;
              const pct = ((Math.abs(value) / total) * 100).toFixed(1) + "%";
              switch (style.funnel.labelMode) {
                case "value": return formatValue(value, measureFmt, "rol");
                case "percent": return pct;
                case "name": return name;
                default: return `${name}: ${pct}`;
              }
            }}
          />
        </Funnel>
      </FunnelChart>
    );
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
      return { name: r.name, size: Math.abs(r.value), value: r.value, pct: (Math.abs(r.value) / total) * 100, fill };
    });
    chart = (
      <Treemap data={tdata} isAnimationActive={false} dataKey="size" nameKey="name"
        stroke={style.treemap.borderColor}
        aspectRatio={4 / 3}
        content={<TreemapTile cfg={style.treemap} fmt={measureFmt} />} />
    );
  } else if (ct === "radar") {
    const polarGrid = (
      <PolarGrid stroke={style.radar.gridColor}
        gridType={style.radar.gridShape === "circle" ? "circle" : "polygon"} />
    );
    chart = (
      <RadarChart data={rows} outerRadius="80%">
        {polarGrid}
        <PolarAngleAxis dataKey="__period"
          tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }} />
        <PolarRadiusAxis tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        <Tooltip />
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          return (
            <Radar key={s.name} isAnimationActive={false} dataKey={s.name}
              stroke={color} strokeWidth={cfg?.thickness ?? 2}
              fill={color}
              fillOpacity={style.radar.fillArea ? style.radar.fillOpacity : 0} />
          );
        })}
      </RadarChart>
    );
  } else if (ct === "histogram") {
    // gather all numeric values across visible series
    const all: number[] = [];
    data.series.forEach((s) => s.values.forEach((v) => { if (isFinite(v)) all.push(v); }));
    const min = all.length ? Math.min(...all) : 0;
    const max = all.length ? Math.max(...all) : 1;
    const bins = Math.max(2, Math.min(100, style.histogram.bins || 10));
    const w = style.histogram.binWidth && style.histogram.binWidth > 0
      ? style.histogram.binWidth
      : ((max - min) / bins) || 1;
    const nBuckets = style.histogram.binWidth ? Math.max(1, Math.ceil((max - min) / w)) : bins;
    const buckets = Array.from({ length: nBuckets }, (_, i) => ({
      bin: `${(min + i * w).toFixed(1)}`,
      count: 0,
      cum: 0,
    }));
    all.forEach((v) => {
      const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor((v - min) / w)));
      buckets[idx].count++;
    });
    let acc = 0;
    buckets.forEach((b) => { acc += b.count; b.cum = acc; });
    chart = (
      <ComposedChart data={buckets} barCategoryGap="2%">
        {renderGrid}
        <XAxis dataKey="bin" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis yAxisId="left" tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        {style.histogram.cumulative && (
          <YAxis yAxisId="right" orientation="right"
            tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        )}
        <Tooltip />
        {renderLegend}
        <Bar yAxisId="left" isAnimationActive={false} dataKey="count" fill={style.histogram.barColor}
          stroke={style.histogram.borderColor} strokeWidth={style.histogram.borderWidth} />
        {style.histogram.cumulative && (
          <Line yAxisId="right" isAnimationActive={false} dataKey="cum" type="monotone"
            stroke={DEFAULT_PALETTE[1]} strokeWidth={2} dot={false} />
        )}
      </ComposedChart>
    );
  } else if (ct === "boxplot") {
    chart = <BoxPlot block={block} style={style} series={data.series} />;
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

// -- Treemap tile renderer ------------------------------------------------
function TreemapTile({ cfg, fmt, ...props }: any) {
  const { x, y, width, height, name, value, fill } = props;
  if (width < 2 || height < 2) return null;
  const showCat = cfg.showCategoryLabel && width > 40 && height > 20;
  const showVal = cfg.showValueLabel && width > 60 && height > 32;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        style={{ fill, stroke: cfg.borderColor, strokeWidth: cfg.borderWidth }} />
      {showCat && (
        <text x={x + 4} y={y + cfg.labelSize + 2}
          fontSize={cfg.labelSize} fill={cfg.labelColor}>{name}</text>
      )}
      {showVal && (
        <text x={x + 4} y={y + cfg.labelSize * 2 + 6}
          fontSize={cfg.labelSize - 1} fill={cfg.labelColor}>
          {formatValue(value ?? 0, fmt, "rol")}
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
function WaterfallChart({
  block, style, series,
}: {
  block: ChartBlock;
  style: ChartStyle;
  rows: Record<string, number | string>[];
  series: { name: string; values: number[] }[];
}) {
  const measureFmt = inferFormat(block.measure);
  const items = useMemo(() => {
    const s0 = series[0];
    if (!s0) return [];
    return s0.values.map((v, i) => ({
      name: String(block.measure),
      label: `P${i + 1}`,
      value: v,
    }));
  }, [series, block.measure]);

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

  const labelPos = style.waterfall.labelPos === "inside" ? "center"
    : style.waterfall.labelPos === "below" ? "bottom" : "top";

  return (
    <BarChart data={wfRows} barCategoryGap={`${style.waterfall.gapPct}%`}>
      {style.grid.show && (
        <CartesianGrid stroke={style.grid.color}
          strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      )}
      <XAxis dataKey="label" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        domain={[style.yAxis.min ?? "auto", style.yAxis.max ?? "auto"]}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip />
      {style.waterfall.connectors && wfRows.slice(0, -1).map((r, i) => (
        <ReferenceLine key={`c-${i}`} segment={[
          { x: r.label, y: r.end }, { x: wfRows[i + 1].label, y: r.end },
        ]} stroke={style.waterfall.connectorColor}
          strokeDasharray={dashArr(style.waterfall.connectorStyle)} />
      ))}
      <Bar isAnimationActive={false} dataKey="base" stackId="wf" fill="transparent" />
      <Bar isAnimationActive={false} dataKey="delta" stackId="wf">
        {wfRows.map((r) => <Cell key={r.label} fill={colorOf(r.cls)} />)}
        {style.dataLabels.show && (
          <LabelList dataKey="end" position={labelPos as never}
            style={{ fontSize: style.dataLabels.size, fill: style.dataLabels.color,
              fontWeight: style.dataLabels.bold ? 700 : 400 }}
            formatter={(v: number) => formatValue(v, measureFmt, "rol")} />
        )}
      </Bar>
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
  const yMin = all.length ? Math.min(...all) : 0;
  const yMax = all.length ? Math.max(...all) : 1;

  return (
    <ComposedChart data={stats}>
      <CartesianGrid stroke={style.grid.color}
        strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      <XAxis dataKey="name" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis domain={[yMin, yMax]}
        tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip />
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
