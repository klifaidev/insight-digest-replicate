import { Topbar } from "@/components/pricing/Topbar";
import { FilterGrid } from "@/components/pricing/FilterGrid";
import { GlassCard } from "@/components/pricing/GlassCard";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { applyFilters, computeKPIs, computeKPIComparison, getKpiComparisonContext } from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkles, BarChart3, TrendingUp, Database, ArrowRight, Upload as UploadIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

export default function Index() {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const metric = usePricing((s) => s.metric);
  const months = useMonthsInfo();

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const kpis = useMemo(() => computeKPIs(filtered, metric), [filtered, metric]);

  const comparison = useMemo(() => {
    const ctx = getKpiComparisonContext(rows, filters, selected);
    if (!ctx) return null;
    const cmp = computeKPIComparison(filtered, ctx.previousRows, metric);
    return { ...cmp, label: ctx.label };
  }, [rows, filters, selected, filtered, metric]);

  const empty = rows.length === 0;

  return (
    <>
      <Topbar
        title="Pricing Analytics — Harald"
        subtitle="Análise de pricing e lucratividade B2B"
      />

      <div className="space-y-6 px-8 py-6 animate-fade-up">
        {empty ? (
          <>
            <GlassCard className="relative overflow-hidden p-10 glow-blue">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" /> Bem-vindo
                </div>
                <h2 className="text-3xl font-light tracking-tight">
                  Comece carregando seus <span className="text-primary">CSVs mensais</span>.
                </h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Detectamos automaticamente os meses, alertamos duplicidades e geramos análises completas:
                  KPIs, Bridge PVM, ABC de SKUs e tabela detalhada.
                </p>
              </div>
            </GlassCard>

            <Link
              to="/upload"
              className="group relative block overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/40 to-accent/10 p-6 transition-all hover:border-primary/60 hover:shadow-glow"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl transition-opacity group-hover:opacity-80" />
              <div className="relative flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 text-primary shadow-glow">
                    <UploadIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                      Comece por aqui
                    </div>
                    <h3 className="mt-1 text-xl font-light tracking-tight">
                      Ir para <span className="text-primary">Upload / Bases</span>
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Carregue seus CSVs mensais, planilha de Budget e gerencie suas bases.
                    </p>
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-transform group-hover:translate-x-1">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { icon: BarChart3, title: "KPIs em tempo real", text: "ROL, margem, volume e SKUs ativos." },
                { icon: TrendingUp, title: "Bridge PVM", text: "Decomponha variação por Volume, Preço, Custo, Mix." },
                { icon: Database, title: "Filtros dinâmicos", text: "Marca, canal, categoria, região e mais." },
              ].map((c) => (
                <GlassCard key={c.title} hoverable className="space-y-2">
                  <c.icon className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-medium">{c.title}</h3>
                  <p className="text-xs text-muted-foreground">{c.text}</p>
                </GlassCard>
              ))}
            </div>
          </>
        ) : (
          <>
            <GlassCard className="grid grid-cols-2 gap-6 p-6 md:grid-cols-4">
              <Stat label="ROL Total" value={formatBRL(kpis.rol, { compact: true })} accent="text-primary" />
              <Stat
                label={metric === "cm" ? "Contrib. Marginal" : "Margem Bruta"}
                value={formatBRL(kpis.margem, { compact: true })}
                sub={formatPct(kpis.margemPct)}
                accent="text-success"
              />
              <Stat label="Volume" value={formatTon(kpis.volumeKg)} accent="text-warning" />
              <Stat label="SKUs ativos" value={formatNum(kpis.skus)} sub={`${months.length} mês(es)`} accent="text-accent" />
            </GlassCard>

            <GlassCard>
              <FilterGrid />
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-3xl font-light tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
