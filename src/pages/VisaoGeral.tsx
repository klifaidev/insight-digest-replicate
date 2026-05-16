import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { AbcBar } from "@/components/pricing/AbcBar";
import { DataTable } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportTableCsv } from "@/lib/exportCsv";
import { usePricing } from "@/store/pricing";
import {
  aggregateBy,
  applyFilters,
  computeKPIs,
  computeKPIComparison,
  getKpiComparisonContext,
  computeCanalTrend,
} from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type PerfBy = "categoria" | "subcategoria" | "sku";
type HeatMetric = "cm" | "mb";

// FY runs April–March; column order:
const FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

const MES_NOMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatPeriodo(p: string): string {
  // Aceita "MM.YYYY", "MMM.YYYY" (ex.: 005.2025), "YYYY-MM", "YYYYMM"
  let mes = 0;
  let ano = 0;
  let m = p.match(/^0*(\d{1,2})[.\/-](\d{4})$/);
  if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10); }
  else if ((m = p.match(/^(\d{4})[-/.]?(\d{2})$/))) { ano = parseInt(m[1], 10); mes = parseInt(m[2], 10); }
  if (!mes || !ano) return p;
  return `${MES_NOMES[mes - 1] ?? mes}/${String(ano).slice(-2)}`;
}

function periodoLabel(selected: string[] | null, allPeriods: string[]): string {
  if (!selected || selected.length === 0 || selected.length === allPeriods.length) {
    if (allPeriods.length === 0) return "Sem períodos";
    const first = formatPeriodo(allPeriods[0]);
    const last = formatPeriodo(allPeriods[allPeriods.length - 1]);
    return `Todos os meses do histórico (${first} – ${last})`;
  }
  if (selected.length === 1) return `Mês selecionado: ${formatPeriodo(selected[0])}`;
  const sorted = [...selected].sort();
  return `${sorted.length} meses selecionados (${formatPeriodo(sorted[0])} – ${formatPeriodo(sorted[sorted.length - 1])})`;
}

export default function VisaoGeral() {
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const [perfBy, setPerfBy] = useState<PerfBy>("categoria");
  const [heatMetric, setHeatMetric] = useState<HeatMetric>(metric);

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const kpis = useMemo(() => computeKPIs(filtered, metric), [filtered, metric]);

  const comparison = useMemo(() => {
    const ctx = getKpiComparisonContext(rows, filters, selected);
    if (!ctx) return null;
    const cmp = computeKPIComparison(filtered, ctx.previousRows, metric);
    return { ...cmp, label: ctx.label };
  }, [rows, filters, selected, filtered, metric]);

  const allPeriods = useMemo(
    () => Array.from(new Set(rows.map((r) => r.periodo))).sort(),
    [rows],
  );
  const periodoInfo = useMemo(() => periodoLabel(selected, allPeriods), [selected, allPeriods]);

  const monthlyTrend = useMemo(
    () =>
      computeCanalTrend(filtered, null, metric).map((p) => ({
        ...p,
        margemPctNum: p.margemPct * 100,
      })),
    [filtered, metric],
  );

  const bySku = useMemo(
    () => aggregateBy(filtered, metric, (r) => r.skuDesc || r.sku || "—"),
    [filtered, metric],
  );

  const byPerf = useMemo(
    () =>
      aggregateBy(filtered, metric, (r) => {
        if (perfBy === "categoria") return r.categoria || "Sem categoria";
        if (perfBy === "subcategoria") return r.subcategoria || "Sem subcategoria";
        return r.skuDesc || r.sku || "—";
      }),
    [filtered, metric, perfBy],
  );

  // Threshold para ranking de margem %: 1% do ROL total (filtra ruído de SKUs minúsculos)
  const minRolForPct = useMemo(() => kpis.rol * 0.01, [kpis.rol]);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Visão Geral" />
        <div className="px-8 py-6">
          <EmptyState
            title="Visão geral do portfólio"
            message="Carregue seus CSVs mensais para ver KPIs, evolução histórica e performance por categoria."
            actionLabel="Carregar dados"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  const perfLabel = perfBy === "categoria" ? "Categoria" : perfBy === "subcategoria" ? "Subcategoria" : "SKU";

  return (
    <>
      <Topbar title="Visão Geral" subtitle="Indicadores e composição agregada" />
      <div className="space-y-6 px-8 py-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            📅 {periodoInfo}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="ROL Total"
            value={formatBRL(kpis.rol, { compact: true })}
            subValue={formatBRL(kpis.rol)}
            accent="blue"
            glow="blue"
            delta={comparison?.deltaPct.rol}
            deltaLabel={comparison?.label}
          />
          <KpiCard
            label={metric === "cm" ? "Contrib. Marginal" : "Margem Bruta"}
            value={formatBRL(kpis.margem, { compact: true })}
            subValue={formatPct(kpis.margemPct)}
            accent="green"
            glow="green"
            delta={comparison?.deltaPct.margem}
            deltaLabel={comparison?.label}
          />
          <KpiCard
            label="Volume"
            value={formatTon(kpis.volumeKg)}
            subValue={`${formatNum(kpis.volumeKg)} t`}
            accent="amber"
            delta={comparison?.deltaPct.volumeKg}
            deltaLabel={comparison?.label}
          />
          <KpiCard
            label="SKUs ativos"
            value={formatNum(kpis.skus)}
            accent="violet"
            delta={comparison?.deltaPct.skus}
            deltaLabel={comparison?.label}
          />
        </div>

        <GlassCard>
          <header className="mb-4">
            <h2 className="text-lg font-medium">Evolução mensal — ROL, Margem % e Volume</h2>
            <p className="text-xs text-muted-foreground">
              Linha do tempo do período carregado — leitura imediata de tendência.
            </p>
          </header>
          {monthlyTrend.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sem dados mensais para exibir.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => formatBRL(Number(v), { compact: true })}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover) / 0.95)",
                    border: "1px solid hsl(var(--border) / 0.6)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "Margem %") return [`${value.toFixed(1)}%`, name];
                    if (name === "Volume (kg)") return [formatTon(value), name];
                    return [formatBRL(value, { compact: true }), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="volumeKg"
                  name="Volume (kg)"
                  fill="hsl(var(--warning) / 0.35)"
                  stroke="hsl(var(--warning) / 0.6)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="rol"
                  name="ROL (R$)"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="margemPctNum"
                  name="Margem %"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GlassCard glow="green">
            <h3 className="mb-1 text-sm font-medium text-success">🏆 Heróis (Top 5 SKUs por Margem %)</h3>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Maior margem % — apenas SKUs com ROL ≥ {formatBRL(minRolForPct, { compact: true })}
            </p>
            <AbcBar rows={bySku} variant="hero" sortBy="margemPct" minRolForPct={minRolForPct} />
          </GlassCard>
          <GlassCard className="border-l-4 border-destructive">
            <h3 className="mb-1 text-sm font-medium text-destructive">⚠️ Ofensores (Top 5 SKUs por Margem %)</h3>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Menor margem % — apenas SKUs com ROL ≥ {formatBRL(minRolForPct, { compact: true })}
            </p>
            <AbcBar rows={bySku} variant="villain" sortBy="margemPct" minRolForPct={minRolForPct} />
          </GlassCard>
        </div>

        <GlassCard>
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Performance por {perfLabel}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={perfBy}
                onValueChange={(v) => v && setPerfBy(v as PerfBy)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="categoria">Categoria</ToggleGroupItem>
                <ToggleGroupItem value="subcategoria">Subcategoria</ToggleGroupItem>
                <ToggleGroupItem value="sku">SKU</ToggleGroupItem>
              </ToggleGroup>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  exportTableCsv(
                    byPerf as unknown as Record<string, unknown>[],
                    [
                      { key: "key", label: perfLabel },
                      { key: "rol", label: "ROL" },
                      { key: "margem", label: metric === "cm" ? "CM" : "MB" },
                      { key: "margemPct", label: "Margem %" },
                      { key: "volumeKg", label: "Volume (kg)" },
                      { key: "rolPorKg", label: "ROL/kg" },
                    ],
                    `performance_${perfBy}`,
                  );
                  toast.success("Arquivo exportado.");
                }}
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </header>
          <DataTable
            rows={byPerf as unknown as Record<string, unknown>[]}
            pageSize={50}
            columns={[
              { key: "key", label: perfLabel, align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
              { key: "rol", label: "ROL", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "margem", label: metric === "cm" ? "CM" : "MB", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "margemPct", label: "Mg %", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "volumeKg", label: "Volume", align: "right", format: (v) => formatTon(Number(v)) },
              { key: "rolPorKg", label: "ROL/kg", align: "right", format: (v) => formatBRL(Number(v), { digits: 2 }) },
            ]}
          />
        </GlassCard>
      </div>
    </>
  );
}
