import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { Waterfall } from "@/components/pricing/Waterfall";
import { EmptyState } from "@/components/pricing/EmptyState";
import { usePricing } from "@/store/pricing";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import { applyFilters, calcPVM, type PVMResult, type PVMSkuDetail } from "@/lib/analytics";
import { exportPvmCsv } from "@/lib/exportCsv";
import { exportBridgePvmPpt } from "@/lib/exportPpt";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, BookOpen, Calendar, CalendarDays, Download, Info, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const EFFECTS: Array<{
  key: keyof Pick<PVMSkuDetail, "volumeEffect" | "priceEffect" | "costEffect">;
  label: string;
  subtitle: string;
}> = [
  {
    key: "volumeEffect",
    label: "Efeito Volume",
    subtitle: "Impacto da variação de volume sobre a margem.",
  },
  {
    key: "priceEffect",
    label: "Efeito Preço",
    subtitle: "Impacto da realização de preço no período comparado.",
  },
  {
    key: "costEffect",
    label: "Efeito Custo Variável",
    subtitle: "Ganhos e pressões vindos do custo variável unitário.",
  },
];

export default function BridgePvm() {
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const fyList = useFyList();
  const months = useMonthsInfo();
  const pvmMode = usePricing((s) => s.pvmMode);
  const pvmBase = usePricing((s) => s.pvmBase);
  const pvmComp = usePricing((s) => s.pvmComp);
  const setPvm = usePricing((s) => s.setPvm);
  const setPvmMode = usePricing((s) => s.setPvmMode);
  const [exportingPpt, setExportingPpt] = useState(false);

  const options = useMemo(
    () =>
      pvmMode === "fy"
        ? fyList.map((fy) => ({ value: fy, label: fy }))
        : months.map((m) => ({ value: m.periodo, label: m.label })),
    [pvmMode, fyList, months],
  );

  // Defaults: pick first and last available option whenever mode/data changes
  // and current values are invalid.
  useEffect(() => {
    if (options.length < 2) return;
    const values = new Set(options.map((o) => o.value));
    const baseOk = pvmBase && values.has(pvmBase);
    const compOk = pvmComp && values.has(pvmComp);
    if (!baseOk || !compOk) {
      setPvm(options[0].value, options[options.length - 1].value);
    }
  }, [options, pvmBase, pvmComp, setPvm]);

  const filtered = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);

  const result = useMemo(() => {
    if (!pvmBase || !pvmComp || pvmBase === pvmComp) return null;
    const labels =
      pvmMode === "month"
        ? {
            base: months.find((m) => m.periodo === pvmBase)?.label ?? pvmBase,
            comp: months.find((m) => m.periodo === pvmComp)?.label ?? pvmComp,
          }
        : undefined;
    return calcPVM(filtered, metric, pvmBase, pvmComp, pvmMode, labels);
  }, [filtered, metric, pvmBase, pvmComp, pvmMode, months]);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Bridge PVM" />
        <div className="px-8 py-6"><EmptyState
          title="Configure os períodos para comparar"
          message="Carregue ao menos dois meses de dados para calcular a decomposição de variação de margem por Volume, Preço e Custo."
          actionLabel="Ir para Upload"
          actionTo="/upload"
        /></div>
      </>
    );
  }

  const notEnough =
    (pvmMode === "fy" && fyList.length < 2) || (pvmMode === "month" && months.length < 2);

  return (
    <>
      <Topbar title="Bridge PVM" subtitle="Decomposição da variação de Contribuição Marginal" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comparar por
              </div>
              <ToggleGroup
                type="single"
                value={pvmMode}
                onValueChange={(v) => v && setPvmMode(v as "fy" | "month")}
                className="mt-1.5 inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
              >
                <ToggleGroupItem
                  value="fy"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ano Fiscal
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="month"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Mês
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {notEnough ? (
            <p className="text-sm text-muted-foreground">
              {pvmMode === "fy"
                ? `Carregue ao menos dois anos fiscais. Você tem: ${fyList.join(", ") || "—"}`
                : `Carregue ao menos dois meses para comparar.`}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <PeriodSelect
                label={pvmMode === "fy" ? "Base (FY)" : "Mês base"}
                value={pvmBase}
                onChange={(v) => setPvm(v, pvmComp)}
                options={options}
              />
              <div className="flex h-10 items-center text-primary/60">
                <ArrowRight className="h-5 w-5" />
              </div>
              <PeriodSelect
                label={pvmMode === "fy" ? "Comparação (FY)" : "Mês de comparação"}
                value={pvmComp}
                onChange={(v) => setPvm(pvmBase, v)}
                options={options}
                excludeValue={pvmBase}
              />
              {pvmBase && pvmComp && pvmBase === pvmComp && (
                <p className="pb-2.5 text-xs text-warning">Selecione períodos diferentes.</p>
              )}
            </div>
          )}
        </GlassCard>

        {result && (
          <>
            <EffectKpis result={result} />


            <GlassCard glow="blue">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">
                    Bridge {result.baseLabel} → {result.currentLabel}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Variação total: {formatBRL(result.current - result.base, { compact: true })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      setExportingPpt(true);
                      await exportBridgePvmPpt(result, filtered);
                      toast.success("PPTX exportado com gráficos e tabelas editáveis.");
                    } catch (error) {
                      console.error(error);
                      toast.error("Não foi possível gerar o PPTX da Bridge PVM.");
                    } finally {
                      setExportingPpt(false);
                    }
                  }}
                  className="gap-2"
                  disabled={exportingPpt}
                >
                  <Download className="h-4 w-4" />
                  {exportingPpt ? "Gerando PPTX..." : "Exportar PPTX"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportPvmCsv(result)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV (auditoria)
                </Button>
              </header>
              <Waterfall data={result} />
            </GlassCard>

            <PvmReadingCard result={result} />

            <div className="grid gap-4 xl:grid-cols-3">
              {EFFECTS.map((effect) => (
                <EffectRankingCard
                  key={effect.key}
                  title={effect.label}
                  subtitle={effect.subtitle}
                  details={result.skuDetails}
                  effectKey={effect.key}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PeriodSelect({
  label,
  value,
  onChange,
  options,
  excludeValue,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  excludeValue?: string | null;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-48 border-border/50 bg-secondary/40 text-sm">
          <SelectValue placeholder="Escolha..." />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.value === excludeValue}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EffectRankingCard({
  title,
  subtitle,
  details,
  effectKey,
}: {
  title: string;
  subtitle: string;
  details: PVMSkuDetail[];
  effectKey: keyof Pick<PVMSkuDetail, "volumeEffect" | "priceEffect" | "costEffect">;
}) {
  const heroes = [...details]
    .filter((item) => item[effectKey] > 0)
    .sort((a, b) => b[effectKey] - a[effectKey])
    .slice(0, 5);

  const offenders = [...details]
    .filter((item) => item[effectKey] < 0)
    .sort((a, b) => a[effectKey] - b[effectKey])
    .slice(0, 5);

  return (
    <GlassCard className="space-y-4">
      <header>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <EffectList
          title="Heróis"
          icon={TrendingUp}
          items={heroes}
          effectKey={effectKey}
          emptyLabel="Sem impactos positivos relevantes no recorte atual."
          tone="positive"
        />
        <EffectList
          title="Ofensores"
          icon={TrendingDown}
          items={offenders}
          effectKey={effectKey}
          emptyLabel="Sem impactos negativos relevantes no recorte atual."
          tone="negative"
        />
      </div>
    </GlassCard>
  );
}

function EffectList({
  title,
  icon: Icon,
  items,
  effectKey,
  emptyLabel,
  tone,
}: {
  title: string;
  icon: typeof TrendingUp;
  items: PVMSkuDetail[];
  effectKey: keyof Pick<PVMSkuDetail, "volumeEffect" | "priceEffect" | "costEffect">;
  emptyLabel: string;
  tone: "positive" | "negative";
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className={tone === "positive" ? "h-4 w-4 text-primary" : "h-4 w-4 text-destructive"} />
        {title}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-3 py-4 text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const displayName = item.skuDesc?.trim() || item.sku;
            return (
            <div
              key={`${title}-${effectKey}-${item.sku}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  #{index + 1}
                </div>
                <div className="truncate text-sm font-medium text-foreground" title={displayName}>{displayName}</div>
                {item.skuDesc && item.skuDesc.trim() && (
                  <div className="truncate text-[10px] text-muted-foreground">{item.sku}</div>
                )}
              </div>
              <div className={tone === "positive" ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}>
                {formatBRL(item[effectKey], { compact: true })}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------- Leitura do resultado ----------



const EFFECT_LABELS: Record<keyof Pick<PVMResult, "volume" | "price" | "cost" | "freight" | "commission" | "others">, string> = {
  volume: "Volume",
  price: "Preço",
  cost: "Custo Variável",
  freight: "Frete",
  commission: "Comissão",
  others: "Mix/Outros",
};

type EffectKey = keyof typeof EFFECT_LABELS;

function buildPvmReading(result: PVMResult): React.ReactNode[] {
  const sentences: React.ReactNode[] = [];
  const delta = result.current - result.base;
  const deltaPct = result.base !== 0 ? delta / Math.abs(result.base) : 0;

  const fmt = (v: number) => formatBRL(v, { compact: true });
  const strong = (children: React.ReactNode, tone: "neutral" | "pos" | "neg" = "neutral") => (
    <span
      className={
        tone === "pos"
          ? "font-semibold text-success"
          : tone === "neg"
          ? "font-semibold text-destructive"
          : "font-semibold text-primary"
      }
    >
      {children}
    </span>
  );

  // Sentence 1: saldo geral
  if (delta >= 0) {
    sentences.push(
      <>
        A margem cresceu {strong(fmt(delta), "pos")} ({strong(`${(deltaPct * 100).toFixed(1)}%`, "pos")}) de{" "}
        {strong(result.baseLabel)} para {strong(result.currentLabel)}.
      </>,
    );
  } else {
    sentences.push(
      <>
        A margem recuou {strong(fmt(Math.abs(delta)), "neg")} ({strong(`${(deltaPct * 100).toFixed(1)}%`, "neg")}) de{" "}
        {strong(result.baseLabel)} para {strong(result.currentLabel)}.
      </>,
    );
  }

  const effects: Array<{ key: EffectKey; value: number }> = (
    ["volume", "price", "cost", "freight", "commission", "others"] as EffectKey[]
  ).map((k) => ({ key: k, value: result[k] }));

  const positives = effects.filter((e) => e.value > 0);
  const negatives = effects.filter((e) => e.value < 0);
  const sumPos = positives.reduce((s, e) => s + e.value, 0);
  const sumNeg = negatives.reduce((s, e) => s + e.value, 0); // negative number

  // Sentence 2: maior driver positivo
  if (positives.length > 0) {
    const top = [...positives].sort((a, b) => b.value - a.value)[0];
    const share = sumPos > 0 ? top.value / sumPos : 0;
    sentences.push(
      <>
        O principal fator de ganho foi {strong(EFFECT_LABELS[top.key], "pos")} ({strong(`+${fmt(top.value)}`, "pos")}),
        representando {strong(`${(share * 100).toFixed(0)}%`)} da variação total positiva.
      </>,
    );
  }

  // Sentence 3: maior driver negativo
  let topNegKey: EffectKey | null = null;
  if (negatives.length > 0) {
    const top = [...negatives].sort((a, b) => a.value - b.value)[0];
    topNegKey = top.key;
    const share = sumNeg < 0 ? top.value / sumNeg : 0;
    sentences.push(
      <>
        A maior pressão veio de {strong(EFFECT_LABELS[top.key], "neg")} ({strong(fmt(top.value), "neg")}), representando{" "}
        {strong(`${(share * 100).toFixed(0)}%`)} da variação negativa.
      </>,
    );
  }

  // Sentence 4: SKU mais impactante positivo (preço + volume)
  const skuScored = result.skuDetails.map((d) => ({
    sku: d.sku,
    name: d.skuDesc?.trim() || d.sku,
    pos: d.priceEffect + d.volumeEffect,
    neg: d.priceEffect + d.volumeEffect + d.costEffect + d.freightEffect + d.commissionEffect + d.othersEffect,
  }));
  const topSkuPos = [...skuScored].filter((s) => s.pos > 0).sort((a, b) => b.pos - a.pos)[0];
  if (topSkuPos) {
    sentences.push(
      <>
        O SKU mais impactante positivamente foi {strong(topSkuPos.name)} com {strong(`+${fmt(topSkuPos.pos)}`, "pos")} de
        contribuição líquida.
      </>,
    );
  }

  // Sentence 5: SKU com maior pressão negativa (soma total)
  const topSkuNeg = [...skuScored].filter((s) => s.neg < 0).sort((a, b) => a.neg - b.neg)[0];
  if (topSkuNeg) {
    sentences.push(
      <>
        O SKU com maior pressão negativa foi {strong(topSkuNeg.name)} com {strong(fmt(topSkuNeg.neg), "neg")} — avaliar
        pricing ou mix.
      </>,
    );
  }

  // Sentence 6: conclusão acionável
  const allPositive = effects.every((e) => e.value >= 0);
  if (result.price < 0 && result.volume > 0) {
    sentences.push(
      <>
        <strong className="text-warning">Atenção:</strong> o crescimento de volume está mascarando deterioração de preço — revisar
        política comercial.
      </>,
    );
  } else if (topNegKey === "cost") {
    sentences.push(
      <>
        A pressão de {strong("custo variável", "neg")} é o principal detrator — priorizar revisão de fornecedores ou
        reformulação.
      </>,
    );
  } else if (allPositive) {
    sentences.push(
      <>
        Resultado equilibrado — ganhos distribuídos entre {strong("preço", "pos")}, {strong("volume", "pos")} e {" "}
        {strong("eficiência de custo", "pos")}.
      </>,
    );
  }

  return sentences;
}

function PvmReadingCard({ result }: { result: PVMResult }) {
  const sentences = useMemo(() => buildPvmReading(result), [result]);
  return (
    <GlassCard>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-medium">Leitura do resultado</h2>
          <p className="text-[11px] text-muted-foreground">Interpretação automática do bridge</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {sentences.map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl border border-border/40 bg-secondary/20 p-3 text-sm leading-relaxed text-foreground/90">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}

// ---------- KpiCards de efeito com tooltip + % do total ----------

const EFFECT_TOOLTIPS: Record<
  "volume" | "price" | "cost" | "freight" | "commission" | "others",
  { label: string; description: string }
> = {
  volume: {
    label: "Δ Volume",
    description:
      "Impacto na margem causado pela variação de volume vendido entre os dois períodos. Positivo = vendeu mais; negativo = vendeu menos.",
  },
  price: {
    label: "Δ Preço",
    description:
      "Impacto causado pela variação no preço médio de realização (ROL/kg). Positivo = preço médio subiu; negativo = preço médio caiu.",
  },
  cost: {
    label: "Δ Custo Var.",
    description:
      "Impacto causado pela variação no custo variável unitário (CV/kg). Positivo = custo caiu (ganho); negativo = custo subiu (pressão).",
  },
  freight: {
    label: "Δ Frete",
    description:
      "Variação no custo de frete unitário entre os períodos. Positivo = frete caiu; negativo = frete subiu.",
  },
  commission: {
    label: "Δ Comissão",
    description:
      "Variação na comissão comercial unitária. Positivo = comissão caiu; negativo = comissão subiu.",
  },
  others: {
    label: "Δ Outros",
    description:
      "Efeitos residuais de mix e outros componentes não capturados nos demais efeitos.",
  },
};

function EffectKpis({ result }: { result: PVMResult }) {
  const order: Array<keyof typeof EFFECT_TOOLTIPS> = [
    "volume",
    "price",
    "cost",
    "freight",
    "commission",
    "others",
  ];
  const totalAbs =
    Math.abs(result.volume) +
    Math.abs(result.price) +
    Math.abs(result.cost) +
    Math.abs(result.freight) +
    Math.abs(result.commission) +
    Math.abs(result.others);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {order.map((k) => {
          const value = result[k];
          const meta = EFFECT_TOOLTIPS[k];
          const share = totalAbs > 0 ? (Math.abs(value) / totalAbs) * 100 : 0;
          return (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <KpiCard
                    label={meta.label}
                    value={formatBRL(value, { compact: true })}
                    subValue={`% do total: ${share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                    accent={value >= 0 ? "green" : "red"}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                <div className="mb-1 flex items-center gap-1 font-medium">
                  <Info className="h-3 w-3" />
                  {meta.label}
                </div>
                {meta.description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
