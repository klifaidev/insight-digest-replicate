// Renderer dos blocos do slide personalizado.

import { useMemo } from "react";
import type {
  CustomBlock, TitleBlock, TextBlock, KpiBlock, ImageBlock,
  ShapeBlock, BridgeBlock, TableBlock, ChartBlock, TopSkuBlock,
} from "@/lib/customSlide";
import { applyFilters, calcPVM } from "@/lib/analytics";
import { Waterfall } from "@/components/pricing/Waterfall";
import { computePivot, type PivotConfig, type PivotMeasure } from "@/lib/pivot";
import { buildUnifiedRows, ALL_DIMENSIONS } from "@/lib/pivotData";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { monthLabel, formatBRL } from "@/lib/format";
import {
  computeKpiBlock, computeTopRanking, formatValue, inferFormat,
} from "@/lib/customKpi";
import { KPI_MEASURES } from "@/lib/customSlide";
import { resolveTableFit, resolveTopSkuFit } from "@/lib/customCapacity";
import { budgetRowsAsPricing } from "@/lib/budgetAdapter";
import { ShapeRenderer } from "./ShapeRenderer";

export const CUSTOM_TABLE_MEASURES: PivotMeasure[] = [
  { id: "rol_real",  label: "ROL",            field: "rol_real",         agg: "sum", format: "currency", tone: "real" },
  { id: "vol_real",  label: "Volume (Kg)",    field: "volumeKg_real",    agg: "sum", format: "tons",     tone: "real" },
  { id: "cm_real",   label: "Contrib. Marg.", field: "cm_real",          agg: "sum", format: "currency", tone: "real" },
  { id: "cv_real",   label: "Custo Variável", field: "custoVariavel_real", agg: "sum", format: "currency", tone: "real" },
  { id: "frete_real",label: "Frete",          field: "frete_real",       agg: "sum", format: "currency", tone: "real" },
  { id: "com_real",  label: "Comissão",       field: "comissao_real",    agg: "sum", format: "currency", tone: "real" },
  { id: "mb_real",   label: "Margem Bruta",   field: "mb_real",          agg: "sum", format: "currency", tone: "real" },
];

export const CUSTOM_TABLE_DIMS = ALL_DIMENSIONS;

function fmtMeasure(m: PivotMeasure, v: number): string {
  if (!isFinite(v)) return "—";
  if (m.format === "currency") return formatBRL(v);
  if (m.format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (m.format === "tons") return Math.round(v).toLocaleString("pt-BR");
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function BlockRenderer({ block, readOnly: _readOnly }: { block: CustomBlock; readOnly?: boolean }) {
  switch (block.kind) {
    case "title":  return <TitleRender block={block} />;
    case "text":   return <TextRender block={block} />;
    case "kpi":    return <KpiRender block={block} />;
    case "image":  return <ImageRender block={block} />;
    case "shape":  return <ShapeRender block={block} />;
    case "bridge": return <BridgeRender block={block} />;
    case "table":  return <TableRender block={block} />;
    case "chart":  return <ChartRender block={block} />;
    case "topSku": return <TopSkuRender block={block} />;
  }
}

function TitleRender({ block: b }: { block: TitleBlock }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: b.align,
      fontFamily: "Calibri, sans-serif", fontSize: b.size,
      fontWeight: b.bold ? 700 : 400, color: `#${b.color}`,
      lineHeight: 1.1, textAlign: b.align,
      padding: 0, overflow: "hidden",
    }}>
      {b.text}
    </div>
  );
}

function TextRender({ block: b }: { block: TextBlock }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "flex-start", justifyContent: b.align,
      fontFamily: "Calibri, sans-serif", fontSize: b.size,
      color: `#${b.color}`, textAlign: b.align,
      whiteSpace: "pre-wrap", overflow: "hidden", lineHeight: 1.3,
    }}>
      {b.text}
    </div>
  );
}

function KpiRender({ block: b }: { block: KpiBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const rows = useMemo(
    () => (b.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing),
    [b.dataSource, pricing, budget],
  );
  const value = useMemo(() => computeKpiBlock(rows, b), [rows, b]);
  const measureLabel = b.source === "dynamic"
    ? KPI_MEASURES.find((m) => m.id === b.measure)?.label
    : null;

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: 12, borderRadius: 12,
      background: "#F8FAFC", border: "1px solid #E2E8F0",
      fontFamily: "Calibri, sans-serif",
    }}>
      <div style={{ fontSize: 14, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>
        {b.label || measureLabel || "KPI"}
      </div>
      <div style={{
        fontSize: b.valueSize, fontWeight: 700, color: `#${b.color}`,
        marginTop: 4, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </div>
      {b.source === "dynamic" && (
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
          {measureLabel}
          {b.periodMode && b.periodMode !== "all" && b.periodValue
            ? ` · ${b.periodValue}`
            : b.periodMode === "all" ? " · Todos os períodos" : ""}
        </div>
      )}
    </div>
  );
}

function ImageRender({ block: b }: { block: ImageBlock }) {
  if (!b.src) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "#F1F5F9", border: "1px dashed #94A3B8",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        Faça upload de uma imagem
      </div>
    );
  }
  return (
    <img src={b.src} alt=""
      style={{ width: "100%", height: "100%", objectFit: b.fit, display: "block" }}
    />
  );
}

function ShapeRender({ block: b }: { block: ShapeBlock }) {
  return <ShapeRenderer block={b} />;
}

function BridgeRender({ block: b }: { block: BridgeBlock }) {
  const pricing = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const pvm = useMemo(() => {
    if (!b.base || !b.comp || b.base === b.comp) return null;
    const filtered = applyFilters(pricing, b.filters, null);
    const labels = b.mode === "month" ? {
      base: (() => { const r = filtered.find((x) => x.periodo === b.base); return r ? monthLabel(r.mes, r.ano) : b.base!; })(),
      comp: (() => { const r = filtered.find((x) => x.periodo === b.comp); return r ? monthLabel(r.mes, r.ano) : b.comp!; })(),
    } : undefined;
    try { return calcPVM(filtered, metric, b.base, b.comp, b.mode, labels); }
    catch { return null; }
  }, [pricing, metric, b.base, b.comp, b.mode, b.filters]);

  if (!pvm) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F8FAFC", border: "1px dashed #CBD5E1",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        Configure base e comparação para a Bridge
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Waterfall data={pvm} height={Math.max(220, b.h - 4)} />
    </div>
  );
}

function TableRender({ block: b }: { block: TableBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);

  const data = useMemo(() => {
    const isBudget = b.dataSource === "budget";
    const realRows = isBudget ? budgetRowsAsPricing(budget) : pricing;
    const unified = buildUnifiedRows(realRows, [], "real");
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => b.measures.includes(m.id));
    if (measures.length === 0) return null;
    const cfg: PivotConfig = {
      rows: b.rowDims,
      cols: b.colDim ? [b.colDim] : [],
      values: measures,
      filters: Object.fromEntries(Object.entries(b.filters).map(([k, v]) => [k, new Set(v ?? [])])),
    };
    const result = computePivot(unified as unknown as Record<string, unknown>[], cfg);

    // Ordena rowHeaders pela sortMeasure (ou primeira measure) desc
    const sortKey = b.sortMeasure && measures.find((m) => m.id === b.sortMeasure)
      ? b.sortMeasure
      : measures[0].id;
    const sortedHeaders = [...result.rowHeaders].sort((a, z) => {
      const va = result.rowTotals.get(a.key)?.[sortKey] ?? 0;
      const vz = result.rowTotals.get(z.key)?.[sortKey] ?? 0;
      return vz - va;
    });
    return { result, measures, sortedHeaders };
  }, [pricing, budget, b.dataSource, b.rowDims, b.colDim, b.measures, b.filters, b.sortMeasure]);

  if (!data || data.sortedHeaders.length === 0) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F8FAFC", border: "1px dashed #CBD5E1",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        Configure dimensões e medidas da tabela
      </div>
    );
  }

  const { result, measures, sortedHeaders } = data;
  const fit = resolveTableFit(b, sortedHeaders.length);
  const visibleHeaders = sortedHeaders.slice(0, fit.shown);
  const hiddenHeaders = sortedHeaders.slice(fit.shown);
  const showOthers = !!b.showOthers && hiddenHeaders.length > 0;
  const cols = result.colHeaders;
  const showCols = cols.length > 0 && cols[0].values.length > 0;

  // Agrega "Outros" cell-by-cell
  const othersRow: Record<string, Record<string, number>> | null = showOthers ? (() => {
    const acc: Record<string, Record<string, number>> = { __row__: {} };
    for (const m of measures) acc.__row__[m.id] = 0;
    if (showCols) for (const c of cols) {
      acc[c.key] = {};
      for (const m of measures) acc[c.key][m.id] = 0;
    }
    for (const rh of hiddenHeaders) {
      for (const m of measures) acc.__row__[m.id] += result.rowTotals.get(rh.key)?.[m.id] ?? 0;
      if (showCols) for (const c of cols) for (const m of measures) {
        acc[c.key][m.id] += result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
      }
    }
    return acc;
  })() : null;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellHead}>{b.rowDims.map((d) => labelOfDim(d)).join(" / ") || "Total"}</th>
            {showCols
              ? cols.flatMap((c) => measures.map((m) => (
                  <th key={`${c.key}-${m.id}`} style={cellHead}>{c.values.join(" / ")} · {m.label}</th>
                )))
              : measures.map((m) => <th key={m.id} style={cellHead}>{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleHeaders.map((rh) => (
            <tr key={rh.key}>
              <td style={cellLabel}>{rh.values.join(" / ") || "Total"}</td>
              {showCols
                ? cols.flatMap((c) => measures.map((m) => {
                    const v = result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
                    return <td key={`${c.key}-${m.id}`} style={cellVal}>{fmtMeasure(m, v)}</td>;
                  }))
                : measures.map((m) => {
                    const v = result.rowTotals.get(rh.key)?.[m.id] ?? 0;
                    return <td key={m.id} style={cellVal}>{fmtMeasure(m, v)}</td>;
                  })}
            </tr>
          ))}
          {othersRow && (
            <tr style={{ background: "#F1F5F9" }}>
              <td style={{ ...cellLabel, fontStyle: "italic" }}>
                Outros ({hiddenHeaders.length})
              </td>
              {showCols
                ? cols.flatMap((c) => measures.map((m) => (
                    <td key={`oth-${c.key}-${m.id}`} style={{ ...cellVal, fontStyle: "italic" }}>
                      {fmtMeasure(m, othersRow[c.key][m.id])}
                    </td>
                  )))
                : measures.map((m) => (
                    <td key={`oth-${m.id}`} style={{ ...cellVal, fontStyle: "italic" }}>
                      {fmtMeasure(m, othersRow.__row__[m.id])}
                    </td>
                  ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart — delegates to the unified ChartCanvas (Recharts + ChartStyle)
// ---------------------------------------------------------------------------
import { ChartCanvas } from "./chart/ChartCanvas";

function ChartRender({ block }: { block: ChartBlock }) {
  return <ChartCanvas block={block} />;
}

// ---------------------------------------------------------------------------
// Top SKU / Top Ranking
// ---------------------------------------------------------------------------
function TopSkuRender({ block: b }: { block: TopSkuBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const rows = useMemo(
    () => (b.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing),
    [b.dataSource, pricing, budget],
  );
  // Sempre busca todos para podermos calcular o efetivo + Outros
  const allItems = useMemo(
    () => computeTopRanking(rows, b.filters, b.dim, b.measure, 9999, b.periodMode, b.periodValue),
    [rows, b.filters, b.dim, b.measure, b.periodMode, b.periodValue],
  );
  const fit = resolveTopSkuFit(b, allItems.length);
  const visible = allItems.slice(0, fit.shown);
  const hidden = allItems.slice(fit.shown);
  const items = b.showOthers && hidden.length > 0
    ? [...visible, {
        name: `Outros (${hidden.length})`,
        value: hidden.reduce((s, x) => s + x.value, 0),
        share: hidden.reduce((s, x) => s + x.share, 0),
      }]
    : visible;
  const fmt = (v: number) => formatValue(v, inferFormat(b.measure), b.measure);
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: "Calibri" }}>
      {b.title && (
        <div style={{ fontSize: 16, fontWeight: 700, color: "#C8102E", padding: "4px 8px" }}>
          {b.title}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#C8102E", color: "#fff" }}>
              <th style={topHead}>#</th>
              <th style={{ ...topHead, textAlign: "left" }}>Item</th>
              <th style={{ ...topHead, textAlign: "right" }}>Valor</th>
              {b.showShare && <th style={{ ...topHead, textAlign: "right" }}>%</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const isOthers = b.showOthers && i === items.length - 1 && hidden.length > 0;
              return (
                <tr key={it.name} style={{ borderBottom: "1px solid #E2E8F0", background: isOthers ? "#F1F5F9" : undefined }}>
                  <td style={{ padding: "4px 6px", color: "#64748B", fontWeight: 600 }}>{isOthers ? "—" : i + 1}</td>
                  <td style={{ padding: "4px 6px", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: isOthers ? "italic" : undefined }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${(it.value / max) * 100}%`,
                        background: "rgba(200,16,46,0.08)", zIndex: 0,
                      }} />
                      <span style={{ position: "relative", zIndex: 1 }}>{it.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, fontStyle: isOthers ? "italic" : undefined }}>{fmt(it.value)}</td>
                  {b.showShare && (
                    <td style={{ padding: "4px 6px", textAlign: "right", color: "#64748B" }}>
                      {(it.share * 100).toFixed(1)}%
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const topHead: React.CSSProperties = {
  padding: "5px 6px", fontSize: 11, fontWeight: 700, textAlign: "center",
};

const cellHead: React.CSSProperties = {
  background: "#C8102E", color: "#fff", padding: "6px 8px", textAlign: "center",
  fontWeight: 700, fontSize: 11, border: "1px solid #fff",
};
const cellLabel: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  color: "#1C2430", borderBottom: "1px solid #E2E8F0", background: "#fff",
};
const cellVal: React.CSSProperties = {
  padding: "5px 8px", textAlign: "right", color: "#1C2430",
  borderBottom: "1px solid #E2E8F0", background: "#fff",
};

function labelOfDim(id: string): string {
  return ALL_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}
