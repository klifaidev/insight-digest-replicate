// ChartInspector — PowerPoint-grade design panel for ChartBlock.
// Sections shown depend on chartType. Filters live in a separate tab (already
// handled by FilteredInspector wrapper outside).

import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import {
  KPI_MEASURES, BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
} from "@/lib/customSlide";
import {
  ensureChartStyle, defaultChartStyle, DEFAULT_PALETTE,
  type ChartStyle, type SeriesStyle,
  type ConditionalRule, type ReferenceLineCfg, type WaterfallColumn,
} from "./types";
import {
  Section, Row, ToggleField, NumberStepper, ColorField, SelectField,
  Segmented, Slider, ResetButton,
} from "./Inspector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { budgetRowsAsPricing } from "@/lib/budgetAdapter";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import { useMemo } from "react";
import { Trash2, Plus } from "lucide-react";

type Patch = Partial<ChartBlock>;

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Position options per chart family
function positionOptions(ct: ChartBlock["chartType"]) {
  if (ct === "pie" || ct === "donut") {
    return [
      { value: "inside", label: "Dentro" },
      { value: "outside", label: "Fora" },
      { value: "callout", label: "Callout" },
    ];
  }
  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "scatter") {
    return [
      { value: "above", label: "Acima" },
      { value: "below", label: "Abaixo" },
      { value: "left", label: "Esquerda" },
      { value: "right", label: "Direita" },
    ];
  }
  if (ct === "waterfall") {
    return [
      { value: "above", label: "Acima da barra" },
      { value: "inside", label: "Dentro da barra" },
      { value: "below", label: "Abaixo da barra" },
    ];
  }
  // bar/column/combo
  return [
    { value: "above", label: "Acima" },
    { value: "below", label: "Abaixo" },
    { value: "inside-end", label: "Dentro topo" },
    { value: "inside-base", label: "Dentro base" },
    { value: "center", label: "Centro" },
  ];
}

const ALL_TYPES: { value: ChartBlock["chartType"]; label: string }[] = [
  { value: "line", label: "Linha" },
  { value: "area", label: "Área" },
  { value: "stackedArea", label: "Área empilhada" },
  { value: "bar", label: "Coluna (vertical)" },
  { value: "column", label: "Coluna agrupada" },
  { value: "stackedColumn", label: "Coluna empilhada" },
  { value: "hbar", label: "Barra horizontal" },
  { value: "stackedBar", label: "Barra empilhada" },
  { value: "combo", label: "Combo (linha + barra)" },
  { value: "pie", label: "Pizza" },
  { value: "donut", label: "Rosca" },
  { value: "bubble", label: "Bolha" },
  { value: "scatter", label: "Dispersão" },
  { value: "waterfall", label: "Waterfall" },
  { value: "funnel", label: "Funil" },
  { value: "treemap", label: "Mapa de árvore" },
  { value: "radar", label: "Radar" },
  { value: "histogram", label: "Histograma" },
  { value: "boxplot", label: "Caixa (Box)" },
];

// Determines what sections should appear
function sectionsFor(ct: ChartBlock["chartType"]) {
  const isPie = ct === "pie" || ct === "donut";
  const isRadar = ct === "radar";
  const isBarFamily = ["bar", "column", "hbar", "stackedColumn", "stackedBar"].includes(ct);
  const isAreaFamily = ct === "area" || ct === "stackedArea";
  const isComboLineFamily = ct === "line" || ct === "combo";
  const showAxes = !isPie && !isRadar && !["funnel", "treemap"].includes(ct);
  const showGrid = showAxes && ct !== "histogram"
    && !["funnel", "treemap", "boxplot"].includes(ct) ? true : false;
  const showSeries = !["pie", "donut", "bubble", "scatter", "waterfall", "funnel", "treemap", "histogram"].includes(ct);
  return {
    showAxes, showGrid: showAxes,
    showSeries,
    showBar: isBarFamily, showArea: isAreaFamily,
    showLineSeriesProps: isComboLineFamily || isAreaFamily,
    isPie, isRadar, isCombo: ct === "combo",
  };
}

export function ChartInspector({
  block, onChange,
}: { block: ChartBlock; onChange: (p: Patch) => void }) {
  const style = ensureChartStyle(block.style);
  const updStyle = (patch: Partial<ChartStyle>) =>
    onChange({ style: { ...block.style, ...patch } } as Patch);
  const updPath = <K extends keyof ChartStyle>(key: K, patch: Partial<ChartStyle[K]>) =>
    updStyle({ [key]: { ...(style[key] as object), ...patch } } as Partial<ChartStyle>);
  const resetPath = <K extends keyof ChartStyle>(key: K) => {
    const d = defaultChartStyle();
    updStyle({ [key]: d[key] } as Partial<ChartStyle>);
  };

  const ct = block.chartType;
  const S = sectionsFor(ct);

  // Detect actual series/categories present on canvas to drive per-item editors
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const dsRows = block.dataSource === "budget" ? budgetRowsAsPricing(budget) : pricing;
  const detectedSeries = useMemo(() => {
    try {
      const r = computeChartSeries(dsRows, block.filters, block.measure, block.breakdown);
      return r.series.map((s) => s.name);
    } catch { return []; }
  }, [dsRows, block.filters, block.measure, block.breakdown]);
  const detectedCategories = useMemo(() => {
    try {
      const r = computeChartSeries(dsRows, block.filters, block.measure, block.breakdown);
      return r.periodos.map((p) => p.label);
    } catch { return []; }
  }, [dsRows, block.filters, block.measure, block.breakdown]);
  const detectedRanking = useMemo(() => {
    if (!["pie", "donut", "funnel", "treemap"].includes(ct)) return [];
    try {
      return computeTopRanking(dsRows, block.filters, block.breakdown ?? "marca",
        block.measure, 50, "all", null).map((r) => r.name);
    } catch { return []; }
  }, [dsRows, block.filters, block.breakdown, block.measure, ct]);

  const updSeries = (key: string, patch: Partial<SeriesStyle>) => {
    const next = [...style.series];
    const idx = next.findIndex((x) => x.key === key);
    if (idx >= 0) next[idx] = { ...next[idx], ...patch };
    else next.push({ key, ...patch });
    updStyle({ series: next });
  };
  const getSeriesCfg = (key: string): SeriesStyle =>
    style.series.find((x) => x.key === key) ?? { key };

  return (
    <div className="space-y-2">
      {/* ===== Data ===== */}
      <Section title="Dados" defaultOpen>
        <Row label="Tipo">
          <SelectField value={ct as string}
            onChange={(v) => onChange({ chartType: v as ChartBlock["chartType"] })}
            options={ALL_TYPES} />
        </Row>
        <Row label="Medida">
          <SelectField value={block.measure}
            onChange={(v) => onChange({ measure: v as KpiMeasureId })}
            options={KPI_MEASURES.map((m) => ({
              value: m.id,
              label: m.label,
              disabled: block.dataSource === "budget"
                && BUDGET_UNAVAILABLE_MEASURES.includes(m.id),
              title: block.dataSource === "budget"
                && BUDGET_UNAVAILABLE_MEASURES.includes(m.id)
                ? BUDGET_UNAVAILABLE_HINT : undefined,
            }))} />
        </Row>
        {S.isCombo && (
          <Row label="Medida da linha">
            <SelectField value={(style.measureLine ?? "__none__") as string}
              onChange={(v) => updStyle({ measureLine: v === "__none__" ? undefined : v as KpiMeasureId })}
              options={[
                { value: "__none__", label: "— Nenhuma —" },
                ...KPI_MEASURES.map((m) => ({
                  value: m.id, label: m.label,
                  disabled: block.dataSource === "budget"
                    && BUDGET_UNAVAILABLE_MEASURES.includes(m.id),
                })),
              ]} />
          </Row>
        )}
        {(ct === "bubble" || ct === "scatter") && (
          <>
            <Row label="Medida Eixo X">
              <SelectField value={(style.measureX ?? "__none__") as string}
                onChange={(v) => updStyle({ measureX: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: "— Índice —" },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: block.dataSource === "budget"
                      && BUDGET_UNAVAILABLE_MEASURES.includes(m.id),
                  })),
                ]} />
            </Row>
            <Row label="Medida Eixo Y">
              <SelectField value={(style.measureY ?? "__none__") as string}
                onChange={(v) => updStyle({ measureY: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: "— Medida principal —" },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: block.dataSource === "budget"
                      && BUDGET_UNAVAILABLE_MEASURES.includes(m.id),
                  })),
                ]} />
            </Row>
            {ct === "bubble" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                A medida principal acima define o <b>tamanho</b> das bolhas.
              </p>
            )}
          </>
        )}
        {block.dataSource === "budget" && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            {BUDGET_UNAVAILABLE_HINT}
          </p>
        )}
        <Row label="Quebrar por">
          <SelectField value={block.breakdown ?? "__none__"}
            onChange={(v) => onChange({ breakdown: v === "__none__" ? null : v })}
            options={[
              { value: "__none__", label: "— Série única —" },
              { value: "marca", label: "Marca" },
              { value: "canalAjustado", label: "Canal" },
              { value: "categoria", label: "Categoria" },
              { value: "mercado", label: "Mercado" },
              { value: "inovacao", label: "Inovação" },
            ]} />
        </Row>

        {/* B.1 — Field well: Eixo X */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo"].includes(ct) && (
          <Row label="Eixo X">
            <SelectField value={block.fieldWells?.xDim ?? "period"}
              onChange={(v) => onChange({
                fieldWells: { ...(block.fieldWells ?? {}), xDim: v === "period" ? null : v },
              })}
              options={[
                { value: "period", label: "Período" },
                { value: "marca", label: "Marca" },
                { value: "canalAjustado", label: "Canal" },
                { value: "categoria", label: "Categoria" },
                { value: "mercado", label: "Mercado" },
                { value: "inovacao", label: "Inovação" },
              ]} />
          </Row>
        )}

        {/* B.1 — Field wells: Cor / Tooltip / Rótulo */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo", "scatter", "bubble"].includes(ct) && (
          <>
            <Row label="Cor / Legenda">
              <SelectField value={block.fieldWells?.colorDim ?? "__none__"}
                onChange={(v) => onChange({
                  fieldWells: { ...(block.fieldWells ?? {}), colorDim: v === "__none__" ? null : v },
                })}
                options={[
                  { value: "__none__", label: "— Nenhum —" },
                  { value: "marca", label: "Marca" },
                  { value: "canalAjustado", label: "Canal" },
                  { value: "categoria", label: "Categoria" },
                  { value: "mercado", label: "Mercado" },
                  { value: "inovacao", label: "Inovação" },
                ]} />
            </Row>
            <Row label="Tooltip extra">
              <SelectField value={(block.fieldWells?.tooltipMeasure ?? "__none__") as string}
                onChange={(v) => onChange({
                  fieldWells: { ...(block.fieldWells ?? {}),
                    tooltipMeasure: v === "__none__" ? null : v as KpiMeasureId },
                })}
                options={[
                  { value: "__none__", label: "— Nenhuma —" },
                  ...KPI_MEASURES.map((m) => ({ value: m.id, label: m.label })),
                ]} />
            </Row>
            {(ct === "scatter" || ct === "bubble") && (
              <Row label="Rótulo de ponto">
                <SelectField value={block.fieldWells?.labelDim ?? "__none__"}
                  onChange={(v) => onChange({
                    fieldWells: { ...(block.fieldWells ?? {}), labelDim: v === "__none__" ? null : v },
                  })}
                  options={[
                    { value: "__none__", label: "— Nenhum —" },
                    { value: "marca", label: "Marca" },
                    { value: "canalAjustado", label: "Canal" },
                    { value: "categoria", label: "Categoria" },
                    { value: "mercado", label: "Mercado" },
                    { value: "inovacao", label: "Inovação" },
                  ]} />
              </Row>
            )}
          </>
        )}

        {/* B.5 — Sort */}
        <Row label="Ordenar por">
          <SelectField value={block.sortConfig?.field ?? "period"}
            onChange={(v) => onChange({
              sortConfig: { field: v as never, dir: block.sortConfig?.dir ?? "asc" },
            })}
            options={[
              ...(["pie", "donut", "funnel", "treemap"].includes(ct)
                ? [] : [{ value: "period", label: "Período" }]),
              { value: "value", label: "Valor" },
              { value: "name", label: "Nome" },
            ]} />
        </Row>
        <Row label="Direção">
          <Segmented value={block.sortConfig?.dir ?? "asc"}
            onChange={(v) => onChange({
              sortConfig: { field: block.sortConfig?.field ?? "period", dir: v as never },
            })}
            options={[
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" },
            ]} />
        </Row>

        {/* B.4 — Bridge column builder */}
        {ct === "waterfall" && (
          <BridgeColumnBuilder block={block} onChange={onChange}
            value={style.waterfall.columns ?? []}
            setValue={(cols) => updPath("waterfall", { columns: cols })} />
        )}
      </Section>

      {/* ===== General ===== */}
      <Section title="Geral">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Título</Label>
          <Input className="h-7 text-xs" value={block.title ?? ""}
            onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <ToggleField label="Mostrar título" value={style.general.titleShow}
          onChange={(v) => updPath("general", { titleShow: v })} />
        <Row label="Tam. título">
          <NumberStepper value={style.general.titleSize} min={8} max={64}
            onChange={(v) => updPath("general", { titleSize: v })} suffix="pt" />
        </Row>
        <Row label="Cor título">
          <ColorField value={style.general.titleColor}
            onChange={(c) => updPath("general", { titleColor: c })} />
        </Row>
        <ToggleField label="Negrito" value={style.general.titleBold}
          onChange={(v) => updPath("general", { titleBold: v })} />
        <ToggleField label="Itálico" value={style.general.titleItalic}
          onChange={(v) => updPath("general", { titleItalic: v })} />
        <Row label="Fundo">
          <ColorField value={style.general.background}
            onChange={(c) => updPath("general", { background: c })} />
        </Row>
        <Row label="Borda">
          <ColorField value={style.general.borderColor}
            onChange={(c) => updPath("general", { borderColor: c })} />
        </Row>
        <Row label="Esp. borda">
          <NumberStepper value={style.general.borderWidth} min={0} max={8}
            onChange={(v) => updPath("general", { borderWidth: v })} suffix="px" />
        </Row>
        <Row label="Padding">
          <NumberStepper value={style.general.padding} min={0} max={40}
            onChange={(v) => updPath("general", { padding: v })} suffix="px" />
        </Row>
        <ToggleField label="Mostrar legenda" value={style.general.legendShow}
          onChange={(v) => updPath("general", { legendShow: v })} />
        <Row label="Pos. legenda">
          <SelectField value={style.general.legendPos}
            onChange={(v) => updPath("general", { legendPos: v as never })}
            options={[
              { value: "top", label: "Topo" },
              { value: "bottom", label: "Rodapé" },
              { value: "left", label: "Esquerda" },
              { value: "right", label: "Direita" },
            ]} />
        </Row>
        <ResetButton onClick={() => resetPath("general")} />
      </Section>

      {/* ===== Grid ===== */}
      {S.showGrid && (
        <Section title="Grade">
          <ToggleField label="Mostrar grade" value={style.grid.show}
            onChange={(v) => updPath("grid", { show: v })} />
          <Row label="Cor"><ColorField value={style.grid.color}
            onChange={(c) => updPath("grid", { color: c })} /></Row>
          <Row label="Estilo">
            <SelectField value={style.grid.style}
              onChange={(v) => updPath("grid", { style: v as never })}
              options={[{ value: "solid", label: "Sólido" }, { value: "dashed", label: "Tracejado" }]} />
          </Row>
          <ResetButton onClick={() => resetPath("grid")} />
        </Section>
      )}

      {/* ===== Axes ===== */}
      {S.showAxes && (
        <>
          <AxisSection title="Eixo X" axis={style.xAxis}
            onChange={(p) => updPath("xAxis", p)}
            onReset={() => resetPath("xAxis")} />
          <AxisSection title="Eixo Y" axis={style.yAxis}
            onChange={(p) => updPath("yAxis", p)}
            onReset={() => resetPath("yAxis")} />
          {S.isCombo && (
            <AxisSection title="Eixo Y secundário" axis={style.yAxis2!}
              onChange={(p) => updPath("yAxis2", p)}
              onReset={() => resetPath("yAxis2")} />
          )}
        </>
      )}

      {/* ===== Data labels ===== */}
      <Section title="Rótulos de dados">
        <ToggleField label="Mostrar" value={style.dataLabels.show}
          onChange={(v) => updPath("dataLabels", { show: v })} />
        <Row label="Tamanho">
          <NumberStepper value={style.dataLabels.size} min={6} max={24}
            onChange={(v) => updPath("dataLabels", { size: v })} suffix="pt" />
        </Row>
        <Row label="Cor"><ColorField value={style.dataLabels.color}
          onChange={(c) => updPath("dataLabels", { color: c })} /></Row>
        <ToggleField label="Negrito" value={style.dataLabels.bold}
          onChange={(v) => updPath("dataLabels", { bold: v })} />
        <ToggleField label="Itálico" value={style.dataLabels.italic}
          onChange={(v) => updPath("dataLabels", { italic: v })} />
        {/* Cleanup: histogram has fixed "above" position; pie/donut handled below */}
        {ct !== "histogram" && (
          <Row label="Posição">
            <SelectField value={style.dataLabels.position}
              onChange={(v) => updPath("dataLabels", { position: v as never })}
              options={positionOptions(ct) as never} />
          </Row>
        )}
        <Row label="Formato">
          <SelectField value={style.dataLabels.format}
            onChange={(v) => updPath("dataLabels", { format: v as never })}
            options={[
              { value: "auto", label: "Automático" },
              { value: "currency", label: "Moeda" },
              { value: "percent", label: "Percentual" },
              { value: "number", label: "Número" },
              { value: "tons", label: "Toneladas" },
            ]} />
        </Row>
        <Row label="Decimais">
          <NumberStepper value={style.dataLabels.decimals} min={0} max={4}
            onChange={(v) => updPath("dataLabels", { decimals: v })} />
        </Row>
        <ToggleField label="Auto-contraste" value={style.dataLabels.autoContrast}
          onChange={(v) => updPath("dataLabels", { autoContrast: v })} />
        {ct !== "pie" && ct !== "donut" && (
          <ToggleField label="Mostrar nome série" value={style.dataLabels.showSeries}
            onChange={(v) => updPath("dataLabels", { showSeries: v })} />
        )}
        <ToggleField label="Mostrar categoria" value={style.dataLabels.showCategory}
          onChange={(v) => updPath("dataLabels", { showCategory: v })} />
        <Row label="Fundo rótulo">
          <ColorField value={style.dataLabels.bgColor}
            onChange={(c) => updPath("dataLabels", { bgColor: c })} />
        </Row>
        <Row label="Opac. fundo">
          <Slider value={Math.round(style.dataLabels.bgOpacity * 100)}
            onChange={(v) => updPath("dataLabels", { bgOpacity: v / 100 })} />
        </Row>
        <Row label="Cor borda">
          <ColorField value={style.dataLabels.borderColor}
            onChange={(c) => updPath("dataLabels", { borderColor: c })} />
        </Row>
        <Row label="Esp. borda">
          <NumberStepper value={style.dataLabels.borderWidth} min={0} max={5}
            onChange={(v) => updPath("dataLabels", { borderWidth: v })} suffix="px" />
        </Row>
        <ResetButton onClick={() => resetPath("dataLabels")} />
      </Section>

      {/* ===== Type-specific: Bar ===== */}
      {S.showBar && (
        <Section title="Barras">
          <Row label="Modo">
            <SelectField value={style.bar.mode}
              onChange={(v) => updPath("bar", { mode: v as never })}
              options={[
                { value: "grouped", label: "Agrupado" },
                { value: "stacked", label: "Empilhado" },
                { value: "stacked100", label: "100% empilhado" },
              ]} />
          </Row>
          <Row label="Espaçamento">
            <NumberStepper value={style.bar.gapPct} min={0} max={80}
              onChange={(v) => updPath("bar", { gapPct: v })} suffix="%" />
          </Row>
          <Row label="Cantos">
            <NumberStepper value={style.bar.cornerRadius} min={0} max={20}
              onChange={(v) => updPath("bar", { cornerRadius: v })} suffix="px" />
          </Row>
          <Row label="Borda"><ColorField value={style.bar.borderColor}
            onChange={(c) => updPath("bar", { borderColor: c })} /></Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.bar.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bar", { borderWidth: v })} suffix="px" />
          </Row>
          <ResetButton onClick={() => resetPath("bar")} />
        </Section>
      )}

      {/* ===== Type-specific: Pie/Donut ===== */}
      {S.isPie && (
        <Section title="Pizza/Rosca">
          {ct === "donut" && (
            <Row label="Furo">
              <NumberStepper value={style.pie.donutHolePct} min={0} max={80}
                onChange={(v) => updPath("pie", { donutHolePct: v })} suffix="%" />
            </Row>
          )}
          <Row label="Ângulo inicial">
            <NumberStepper value={style.pie.startAngle} min={0} max={360}
              onChange={(v) => updPath("pie", { startAngle: v })} suffix="°" />
          </Row>
          <Row label="Rótulos">
            <SelectField value={style.pie.labelMode}
              onChange={(v) => updPath("pie", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: "Nome + %" },
                { value: "name-value", label: "Nome + valor" },
                { value: "name", label: "Nome" },
                { value: "percent", label: "Percentual" },
                { value: "value", label: "Valor" },
              ]} />
          </Row>
          <Row label="Explosão geral">
            <Slider value={style.pie.explodePct} max={30}
              onChange={(v) => updPath("pie", { explodePct: v })} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Fatias</div>
              {detectedRanking.map((name, i) => {
                const sl = style.pie.slices[name] ?? {};
                return (
                  <div key={name} className="space-y-1 rounded border border-border/30 p-1.5">
                    <div className="text-[10px] font-medium truncate">{name}</div>
                    <Row label="Cor">
                      <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, color: c } },
                        })} />
                    </Row>
                    <Row label="Explosão">
                      <Slider value={sl.explode ?? 0} max={30}
                        onChange={(v) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, explode: v } },
                        })} />
                    </Row>
                  </div>
                );
              })}
            </div>
          )}
          <ResetButton onClick={() => resetPath("pie")} />
        </Section>
      )}

      {/* ===== Type-specific: Bubble ===== */}
      {ct === "bubble" && (
        <Section title="Bolhas">
          <Row label="Tam. mín">
            <NumberStepper value={style.bubble.minSize} min={20} max={500}
              onChange={(v) => updPath("bubble", { minSize: v })} suffix="px" />
          </Row>
          <Row label="Tam. máx">
            <NumberStepper value={style.bubble.maxSize} min={50} max={2000}
              onChange={(v) => updPath("bubble", { maxSize: v })} suffix="px" />
          </Row>
          <Row label="Opacidade">
            <Slider value={Math.round(style.bubble.fillOpacity * 100)}
              onChange={(v) => updPath("bubble", { fillOpacity: v / 100 })} />
          </Row>
          <Row label="Borda"><ColorField value={style.bubble.borderColor}
            onChange={(c) => updPath("bubble", { borderColor: c })} /></Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.bubble.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bubble", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Mostrar tamanho como rótulo"
            value={style.bubble.showSizeLabel}
            onChange={(v) => updPath("bubble", { showSizeLabel: v })} />
          <ResetButton onClick={() => resetPath("bubble")} />
        </Section>
      )}

      {/* ===== Type-specific: Area ===== */}
      {S.showArea && (
        <Section title="Área">
          <ToggleField label="Empilhado" value={style.area.stacked}
            onChange={(v) => updPath("area", { stacked: v })} />
          <ToggleField label="Linha por cima" value={style.area.lineOnTop}
            onChange={(v) => updPath("area", { lineOnTop: v })} />
          <ResetButton onClick={() => resetPath("area")} />
        </Section>
      )}

      {/* ===== Type-specific: Waterfall ===== */}
      {ct === "waterfall" && (
        <Section title="Waterfall">
          <Row label="Cor positiva"><ColorField value={style.waterfall.positiveColor}
            onChange={(c) => updPath("waterfall", { positiveColor: c })} /></Row>
          <Row label="Cor negativa"><ColorField value={style.waterfall.negativeColor}
            onChange={(c) => updPath("waterfall", { negativeColor: c })} /></Row>
          <Row label="Cor total"><ColorField value={style.waterfall.totalColor}
            onChange={(c) => updPath("waterfall", { totalColor: c })} /></Row>
          <ToggleField label="Conectores" value={style.waterfall.connectors}
            onChange={(v) => updPath("waterfall", { connectors: v })} />
          <Row label="Cor conector">
            <ColorField value={style.waterfall.connectorColor}
              onChange={(c) => updPath("waterfall", { connectorColor: c })} />
          </Row>
          <Row label="Estilo conector">
            <Segmented value={style.waterfall.connectorStyle}
              onChange={(v) => updPath("waterfall", { connectorStyle: v as never })}
              options={[
                { value: "solid", label: "Sólido" },
                { value: "dashed", label: "Tracejado" },
              ]} />
          </Row>
          <ToggleField label="Total acumulado" value={style.waterfall.showRunningTotal}
            onChange={(v) => updPath("waterfall", { showRunningTotal: v })} />
          <Row label="Pos. rótulo">
            <SelectField value={style.waterfall.labelPos}
              onChange={(v) => updPath("waterfall", { labelPos: v as never })}
              options={[
                { value: "above", label: "Acima da barra" },
                { value: "inside", label: "Dentro da barra" },
                { value: "below", label: "Abaixo da barra" },
              ]} />
          </Row>
          <Row label="Espaçamento">
            <NumberStepper value={style.waterfall.gapPct} min={0} max={80}
              onChange={(v) => updPath("waterfall", { gapPct: v })} suffix="%" />
          </Row>
          {detectedCategories.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Classificação</div>
              {detectedCategories.map((label, i) => {
                const lbl = `P${i + 1}`;
                const current = style.waterfall.classify[lbl] ?? "positive";
                return (
                  <Row key={lbl} label={label}>
                    <SelectField value={current}
                      onChange={(v) => updPath("waterfall", {
                        classify: { ...style.waterfall.classify, [lbl]: v as never },
                      })}
                      options={[
                        { value: "positive", label: "Positivo" },
                        { value: "negative", label: "Negativo" },
                        { value: "total", label: "Total" },
                      ]} />
                  </Row>
                );
              })}
            </div>
          )}
          <ResetButton onClick={() => resetPath("waterfall")} />
        </Section>
      )}

      {/* ===== Type-specific: Funnel ===== */}
      {ct === "funnel" && (
        <Section title="Funil">
          <Row label="Direção">
            <Segmented value={style.funnel.direction}
              onChange={(v) => updPath("funnel", { direction: v as never })}
              options={[
                { value: "ttb", label: "Topo → Base" },
                { value: "btt", label: "Base → Topo" },
              ]} />
          </Row>
          <Row label="Espaçamento">
            <Slider value={style.funnel.gapPct} max={20}
              onChange={(v) => updPath("funnel", { gapPct: v })} />
          </Row>
          <Row label="Rótulos">
            <SelectField value={style.funnel.labelMode}
              onChange={(v) => updPath("funnel", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: "Nome + %" },
                { value: "name", label: "Nome" },
                { value: "value", label: "Valor" },
                { value: "percent", label: "Percentual" },
              ]} />
          </Row>
          <Row label="Pos. rótulo">
            <SelectField value={style.funnel.labelPos ?? "right"}
              onChange={(v) => updPath("funnel", { labelPos: v as never })}
              options={[
                { value: "left", label: "Esquerda" },
                { value: "right", label: "Direita" },
                { value: "center", label: "Centro" },
                { value: "inside", label: "Dentro" },
              ]} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Estágios</div>
              {detectedRanking.map((name, i) => {
                const sl = style.funnel.slices[name] ?? {};
                return (
                  <Row key={name} label={name}>
                    <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                      onChange={(c) => updPath("funnel", {
                        slices: { ...style.funnel.slices, [name]: { color: c } },
                      })} />
                  </Row>
                );
              })}
            </div>
          )}
          <ResetButton onClick={() => resetPath("funnel")} />
        </Section>
      )}

      {/* ===== Type-specific: Treemap ===== */}
      {ct === "treemap" && (
        <Section title="Mapa de árvore">
          <Row label="Esquema de cor">
            <Segmented value={style.treemap.colorScheme}
              onChange={(v) => updPath("treemap", { colorScheme: v as never })}
              options={[
                { value: "categorical", label: "Por categoria" },
                { value: "gradient", label: "Gradiente" },
              ]} />
          </Row>
          {style.treemap.colorScheme === "gradient" && (
            <>
              <Row label="Cor inicial">
                <ColorField value={style.treemap.gradientFrom}
                  onChange={(c) => updPath("treemap", { gradientFrom: c })} />
              </Row>
              <Row label="Cor final">
                <ColorField value={style.treemap.gradientTo}
                  onChange={(c) => updPath("treemap", { gradientTo: c })} />
              </Row>
            </>
          )}
          <ToggleField label="Mostrar nome" value={style.treemap.showCategoryLabel}
            onChange={(v) => updPath("treemap", { showCategoryLabel: v })} />
          <ToggleField label="Mostrar valor" value={style.treemap.showValueLabel}
            onChange={(v) => updPath("treemap", { showValueLabel: v })} />
          {/* Cleanup: tamanho e cor agora controlados pela seção "Rótulos de dados" */}
          <Row label="Cor borda">
            <ColorField value={style.treemap.borderColor}
              onChange={(c) => updPath("treemap", { borderColor: c })} />
          </Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.treemap.borderWidth} min={0} max={5}
              onChange={(v) => updPath("treemap", { borderWidth: v })} suffix="px" />
          </Row>
          <ResetButton onClick={() => resetPath("treemap")} />
        </Section>
      )}

      {/* ===== Type-specific: Radar ===== */}
      {S.isRadar && (
        <Section title="Radar">
          <ToggleField label="Preencher área" value={style.radar.fillArea}
            onChange={(v) => updPath("radar", { fillArea: v })} />
          <Row label="Opac. preenchimento">
            <Slider value={Math.round(style.radar.fillOpacity * 100)}
              onChange={(v) => updPath("radar", { fillOpacity: v / 100 })} />
          </Row>
          <Row label="Forma da grade">
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: "Polígono" },
                { value: "circle", label: "Círculo" },
              ]} />
          </Row>
          <Row label="Cor grade">
            <ColorField value={style.radar.gridColor}
              onChange={(c) => updPath("radar", { gridColor: c })} />
          </Row>
          <Row label="Tam. rótulo eixo">
            <NumberStepper value={style.radar.axisLabelSize} min={6} max={24}
              onChange={(v) => updPath("radar", { axisLabelSize: v })} suffix="pt" />
          </Row>
          <Row label="Cor rótulo eixo">
            <ColorField value={style.radar.axisLabelColor}
              onChange={(c) => updPath("radar", { axisLabelColor: c })} />
          </Row>
          <ResetButton onClick={() => resetPath("radar")} />
        </Section>
      )}

      {/* ===== Type-specific: Histogram ===== */}
      {ct === "histogram" && (
        <Section title="Histograma">
          <Row label="Nº de bins">
            <NumberStepper value={style.histogram.bins} min={2} max={100}
              onChange={(v) => updPath("histogram", { bins: v })} />
          </Row>
          <Row label="Largura bin">
            <Input type="number" className="h-7 text-[11px]"
              value={style.histogram.binWidth ?? ""} placeholder="auto"
              onChange={(e) => updPath("histogram", {
                binWidth: e.target.value === "" ? null : parseFloat(e.target.value),
              })} />
          </Row>
          <Row label="Cor barra">
            <ColorField value={style.histogram.barColor}
              onChange={(c) => updPath("histogram", { barColor: c })} />
          </Row>
          <Row label="Cor borda">
            <ColorField value={style.histogram.borderColor}
              onChange={(c) => updPath("histogram", { borderColor: c })} />
          </Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.histogram.borderWidth} min={0} max={5}
              onChange={(v) => updPath("histogram", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Linha cumulativa" value={style.histogram.cumulative}
            onChange={(v) => updPath("histogram", { cumulative: v })} />
          <ResetButton onClick={() => resetPath("histogram")} />
        </Section>
      )}

      {/* ===== Type-specific: Boxplot ===== */}
      {ct === "boxplot" && (
        <Section title="Caixa (Box & Whisker)">
          <Row label="Cor caixa">
            <ColorField value={style.boxplot.boxFillColor}
              onChange={(c) => updPath("boxplot", { boxFillColor: c })} />
          </Row>
          <Row label="Cor bigode">
            <ColorField value={style.boxplot.whiskerColor}
              onChange={(c) => updPath("boxplot", { whiskerColor: c })} />
          </Row>
          <Row label="Esp. bigode">
            <NumberStepper value={style.boxplot.whiskerWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { whiskerWidth: v })} suffix="px" />
          </Row>
          <Row label="Cor mediana">
            <ColorField value={style.boxplot.medianColor}
              onChange={(c) => updPath("boxplot", { medianColor: c })} />
          </Row>
          <Row label="Esp. mediana">
            <NumberStepper value={style.boxplot.medianWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { medianWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Mostrar média" value={style.boxplot.showMean}
            onChange={(v) => updPath("boxplot", { showMean: v })} />
          <ToggleField label="Mostrar outliers" value={style.boxplot.showOutliers}
            onChange={(v) => updPath("boxplot", { showOutliers: v })} />
          <ResetButton onClick={() => resetPath("boxplot")} />
        </Section>
      )}

      {/* ===== Series (color overrides + per-series style) ===== */}
      {S.showSeries && (
        <Section title="Séries">
          <p className="text-[10px] text-muted-foreground">
            Cores e estilos por série. {detectedSeries.length === 0 && "(Nenhuma série detectada — usando padrão.)"}
          </p>
          {(detectedSeries.length === 0 ? ["Total"] : detectedSeries).map((name, i) => {
            const cfg = getSeriesCfg(name);
            return (
              <div key={name} className="space-y-1 rounded border border-border/30 p-1.5">
                <div className="text-[10px] font-medium truncate">{name}</div>
                <Row label="Cor">
                  <ColorField value={cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                    onChange={(c) => updSeries(name, { color: c })} />
                </Row>
                {S.showLineSeriesProps && (
                  <>
                    <Row label="Estilo linha">
                      <Segmented value={cfg.lineStyle ?? "solid"}
                        onChange={(v) => updSeries(name, { lineStyle: v as never })}
                        options={[
                          { value: "solid", label: "Sólida" },
                          { value: "dashed", label: "Tracej." },
                          { value: "dotted", label: "Pont." },
                        ]} />
                    </Row>
                    <Row label="Espessura">
                      <NumberStepper value={cfg.thickness ?? 2.5} min={0.5} max={8} step={0.5}
                        onChange={(v) => updSeries(name, { thickness: v })} suffix="px" />
                    </Row>
                    <ToggleField label="Suave" value={cfg.smooth ?? false}
                      onChange={(v) => updSeries(name, { smooth: v })} />
                  </>
                )}
                {S.showArea && (
                  <Row label="Opac. área">
                    <Slider value={Math.round((cfg.areaOpacity ?? 0.35) * 100)}
                      onChange={(v) => updSeries(name, { areaOpacity: v / 100 })} />
                  </Row>
                )}
                {(ct === "line" || ct === "scatter" || ct === "combo") && (
                  <>
                    <Row label="Marcador">
                      <SelectField value={cfg.marker?.shape ?? "circle"}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            shape: v as never },
                        })}
                        options={[
                          { value: "circle", label: "Círculo" },
                          { value: "square", label: "Quadrado" },
                          { value: "diamond", label: "Diamante" },
                          { value: "triangle", label: "Triângulo" },
                        ]} />
                    </Row>
                    <Row label="Tam. marcador">
                      <NumberStepper value={cfg.marker?.size ?? 3} min={0} max={12}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            size: v, show: v > 0 },
                        })} suffix="px" />
                    </Row>
                    <Row label="Cor marcador">
                      <ColorField value={cfg.marker?.fill ?? cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            fill: c },
                        })} />
                    </Row>
                  </>
                )}
                {S.isCombo && (
                  <>
                    <Row label="Renderizar como">
                      <Segmented value={cfg.asLine ? "line" : "bar"}
                        onChange={(v) => updSeries(name, { asLine: v === "line" })}
                        options={[
                          { value: "bar", label: "Barra" },
                          { value: "line", label: "Linha" },
                        ]} />
                    </Row>
                    <ToggleField label="Eixo Y secundário" value={cfg.secondaryAxis ?? false}
                      onChange={(v) => updSeries(name, { secondaryAxis: v })} />
                  </>
                )}
              </div>
            );
          })}
          <ResetButton onClick={() => updStyle({ series: [] })} />
        </Section>
      )}

      {/* B.2 — Conditional formatting */}
      {["bar", "column", "hbar", "waterfall", "treemap"].includes(ct) && (
        <ConditionalSection
          rules={style.conditionalRules ?? []}
          defaultColor={style.conditionalDefault ?? ""}
          onRules={(rules) => updStyle({ conditionalRules: rules })}
          onDefault={(c) => updStyle({ conditionalDefault: c })} />
      )}

      {/* B.1 — Analytics (refLines/trendline/forecast) */}
      {["line", "area", "combo", "bar", "column", "hbar", "scatter", "bubble"].includes(ct) && (
        <AnalyticsSection
          analytics={style.analytics!}
          onChange={(p) => updPath("analytics", p as never)} />
      )}
    </div>
  );
}

// =============================================================
// B.1 Analytics Section — refLines + trendline + forecast
// =============================================================
function AnalyticsSection({ analytics, onChange }: {
  analytics: NonNullable<ChartStyle["analytics"]>;
  onChange: (p: Partial<NonNullable<ChartStyle["analytics"]>>) => void;
}) {
  const refs = analytics.refLines ?? [];
  const trend = analytics.trendline;
  const fc = analytics.forecast;

  const addRef = () => {
    if (refs.length >= 3) return;
    const nrl: ReferenceLineCfg = {
      id: rid(), value: 0, label: `Linha ${refs.length + 1}`,
      color: "#7C3AED", style: "dashed", thickness: 1.5,
    };
    onChange({ refLines: [...refs, nrl] });
  };
  const updRef = (i: number, p: Partial<ReferenceLineCfg>) => {
    const next = [...refs]; next[i] = { ...next[i], ...p };
    onChange({ refLines: next });
  };
  const delRef = (i: number) => {
    onChange({ refLines: refs.filter((_, j) => j !== i) });
  };

  return (
    <Section title="Análises">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase text-muted-foreground">Linhas de referência</Label>
          <button type="button" onClick={addRef} disabled={refs.length >= 3}
            className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {refs.map((rl, i) => (
          <div key={rl.id} className="space-y-1 rounded border border-border/30 p-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium">#{i + 1}</span>
              <button type="button" onClick={() => delRef(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <Row label="Valor Y">
              <Input type="number" className="h-7 text-[11px]" value={rl.value}
                onChange={(e) => updRef(i, { value: parseFloat(e.target.value) || 0 })} />
            </Row>
            <Row label="Rótulo">
              <Input className="h-7 text-[11px]" value={rl.label}
                onChange={(e) => updRef(i, { label: e.target.value })} />
            </Row>
            <Row label="Cor"><ColorField value={rl.color} onChange={(c) => updRef(i, { color: c })} /></Row>
            <Row label="Estilo">
              <Segmented value={rl.style} onChange={(v) => updRef(i, { style: v as never })}
                options={[
                  { value: "solid", label: "Sólida" },
                  { value: "dashed", label: "Tracej." },
                  { value: "dotted", label: "Pont." },
                ]} />
            </Row>
            <Row label="Espessura">
              <NumberStepper value={rl.thickness} min={0.5} max={6} step={0.5}
                onChange={(v) => updRef(i, { thickness: v })} suffix="px" />
            </Row>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-1.5">
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Tendência</div>
        <ToggleField label="Habilitar" value={trend.enabled}
          onChange={(v) => onChange({ trendline: { ...trend, enabled: v } })} />
        <Row label="Tipo">
          <SelectField value={trend.type}
            onChange={(v) => onChange({ trendline: { ...trend, type: v as never } })}
            options={[
              { value: "linear", label: "Linear" },
              { value: "exp", label: "Exponencial" },
              { value: "ma", label: "Média móvel" },
            ]} />
        </Row>
        {trend.type === "ma" && (
          <Row label="Janela (N)">
            <NumberStepper value={trend.maWindow} min={2} max={12}
              onChange={(v) => onChange({ trendline: { ...trend, maWindow: v } })} />
          </Row>
        )}
        <Row label="Cor"><ColorField value={trend.color}
          onChange={(c) => onChange({ trendline: { ...trend, color: c } })} /></Row>
        <Row label="Espessura">
          <NumberStepper value={trend.thickness} min={0.5} max={6} step={0.5}
            onChange={(v) => onChange({ trendline: { ...trend, thickness: v } })} suffix="px" />
        </Row>
        <Row label="Estilo">
          <Segmented value={trend.style}
            onChange={(v) => onChange({ trendline: { ...trend, style: v as never } })}
            options={[
              { value: "solid", label: "Sólida" },
              { value: "dashed", label: "Tracej." },
              { value: "dotted", label: "Pont." },
            ]} />
        </Row>
        <ToggleField label="Mostrar R²" value={trend.showR2}
          onChange={(v) => onChange({ trendline: { ...trend, showR2: v } })} />
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-1.5">
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Previsão</div>
        <ToggleField label="Habilitar" value={fc.enabled}
          onChange={(v) => onChange({ forecast: { ...fc, enabled: v } })} />
        <Row label="Períodos à frente">
          <NumberStepper value={fc.periods} min={1} max={6}
            onChange={(v) => onChange({ forecast: { ...fc, periods: v } })} />
        </Row>
        <ToggleField label="Banda de confiança" value={fc.band}
          onChange={(v) => onChange({ forecast: { ...fc, band: v } })} />
      </div>
    </Section>
  );
}

function ConditionalSection({ rules, defaultColor, onRules, onDefault }: {
  rules: ConditionalRule[];
  defaultColor: string;
  onRules: (r: ConditionalRule[]) => void;
  onDefault: (c: string) => void;
}) {
  const add = () => {
    if (rules.length >= 5) return;
    onRules([...rules, { id: rid(), op: ">", threshold: 0, color: "#16A34A" }]);
  };
  const upd = (i: number, p: Partial<ConditionalRule>) => {
    const next = [...rules]; next[i] = { ...next[i], ...p };
    onRules(next);
  };
  const del = (i: number) => onRules(rules.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules]; [next[i], next[j]] = [next[j], next[i]];
    onRules(next);
  };

  return (
    <Section title="Formatação condicional">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">Regras</Label>
        <button type="button" onClick={add} disabled={rules.length >= 5}
          className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      </div>
      {rules.map((r, i) => (
        <div key={r.id} className="space-y-1 rounded border border-border/30 p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)}
                className="text-[10px] text-muted-foreground hover:text-foreground">↑</button>
              <button type="button" onClick={() => move(i, 1)}
                className="text-[10px] text-muted-foreground hover:text-foreground">↓</button>
              <button type="button" onClick={() => del(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label="Operador">
            <SelectField value={r.op} onChange={(v) => upd(i, { op: v as never })}
              options={[
                { value: ">", label: ">" },
                { value: "<", label: "<" },
                { value: "=", label: "=" },
                { value: "between", label: "Entre" },
              ]} />
          </Row>
          <Row label="Valor">
            <Input type="number" className="h-7 text-[11px]" value={r.threshold}
              onChange={(e) => upd(i, { threshold: parseFloat(e.target.value) || 0 })} />
          </Row>
          {r.op === "between" && (
            <Row label="Valor 2">
              <Input type="number" className="h-7 text-[11px]" value={r.threshold2 ?? 0}
                onChange={(e) => upd(i, { threshold2: parseFloat(e.target.value) || 0 })} />
            </Row>
          )}
          <Row label="Cor"><ColorField value={r.color} onChange={(c) => upd(i, { color: c })} /></Row>
        </div>
      ))}
      <Row label="Cor padrão">
        <ColorField value={defaultColor || "#94A3B8"} onChange={onDefault} />
      </Row>
    </Section>
  );
}

function BridgeColumnBuilder({ block, value, setValue }: {
  block: ChartBlock;
  onChange: (p: Patch) => void;
  value: WaterfallColumn[];
  setValue: (cols: WaterfallColumn[]) => void;
}) {
  const upd = (i: number, p: Partial<WaterfallColumn>) => {
    const next = [...value]; next[i] = { ...next[i], ...p };
    setValue(next);
  };
  const del = (i: number) => setValue(value.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]];
    setValue(next);
  };
  const presets: { label: string; build: () => WaterfallColumn[] }[] = [
    { label: "Por mês", build: () => [] },
    { label: "Por efeito", build: () => [
      { id: rid(), label: "Início", type: "start", measure: block.measure },
      { id: rid(), label: "Volume", type: "positive", measure: "volume" },
      { id: rid(), label: "Preço", type: "positive", measure: "precoMedio" },
      { id: rid(), label: "Mix", type: "negative", measure: block.measure },
      { id: rid(), label: "Final", type: "total", measure: block.measure },
    ]},
    { label: "Por categoria", build: () => [] },
    { label: "Por marca", build: () => [] },
    { label: "Por canal", build: () => [] },
    { label: "Em branco", build: () => [] },
  ];
  const addBlank = () => setValue([...value, {
    id: rid(), label: "Nova coluna", type: "positive", measure: block.measure,
  }]);

  return (
    <div className="mt-2 space-y-1.5 rounded border border-border/30 p-1.5">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">Colunas (Bridge)</div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => setValue(p.build())}
            className="rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary">
            {p.label}
          </button>
        ))}
      </div>
      {value.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Sem colunas — usando o modo automático (uma coluna por período).
        </p>
      )}
      {value.map((c, i) => (
        <div key={c.id} className="space-y-1 rounded border border-border/30 p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)}
                className="text-[10px] text-muted-foreground hover:text-foreground">↑</button>
              <button type="button" onClick={() => move(i, 1)}
                className="text-[10px] text-muted-foreground hover:text-foreground">↓</button>
              <button type="button" onClick={() => del(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label="Rótulo">
            <Input className="h-7 text-[11px]" value={c.label}
              onChange={(e) => upd(i, { label: e.target.value })} />
          </Row>
          <Row label="Tipo">
            <SelectField value={c.type} onChange={(v) => upd(i, { type: v as never })}
              options={[
                { value: "start", label: "Início" },
                { value: "positive", label: "Positivo" },
                { value: "negative", label: "Negativo" },
                { value: "total", label: "Total" },
                { value: "subtotal", label: "Subtotal" },
              ]} />
          </Row>
          <Row label="Medida">
            <SelectField value={c.measure ?? "__manual__"}
              onChange={(v) => upd(i, v === "__manual__"
                ? { measure: undefined }
                : { measure: v as KpiMeasureId, manualValue: undefined })}
              options={[
                { value: "__manual__", label: "— Manual —" },
                ...KPI_MEASURES.map((m) => ({ value: m.id, label: m.label })),
              ]} />
          </Row>
          {c.measure == null && (
            <Row label="Valor">
              <Input type="number" className="h-7 text-[11px]" value={c.manualValue ?? 0}
                onChange={(e) => upd(i, { manualValue: parseFloat(e.target.value) || 0 })} />
            </Row>
          )}
          <Row label="Filtrar dim.">
            <SelectField value={c.filterDim ?? "__none__"}
              onChange={(v) => upd(i, { filterDim: v === "__none__" ? null : v })}
              options={[
                { value: "__none__", label: "— Nenhum —" },
                { value: "marca", label: "Marca" },
                { value: "canalAjustado", label: "Canal" },
                { value: "categoria", label: "Categoria" },
                { value: "mercado", label: "Mercado" },
              ]} />
          </Row>
          {c.filterDim && (
            <Row label="Valor filtro">
              <Input className="h-7 text-[11px]" value={c.filterValue ?? ""}
                onChange={(e) => upd(i, { filterValue: e.target.value })} />
            </Row>
          )}
        </div>
      ))}
      <button type="button" onClick={addBlank}
        className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-input py-1 text-[10px] text-muted-foreground hover:bg-secondary">
        <Plus className="h-3 w-3" /> Adicionar coluna
      </button>
    </div>
  );
}

function AxisSection({ title, axis, onChange, onReset }: {
  title: string;
  axis: ChartStyle["xAxis"];
  onChange: (p: Partial<ChartStyle["xAxis"]>) => void;
  onReset: () => void;
}) {
  return (
    <Section title={title}>
      <ToggleField label="Mostrar eixo" value={axis.show}
        onChange={(v) => onChange({ show: v })} />
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Título do eixo</Label>
        <Input className="h-7 text-xs" value={axis.titleText}
          onChange={(e) => onChange({ titleText: e.target.value })} />
      </div>
      <Row label="Tam. título">
        <NumberStepper value={axis.titleSize} min={6} max={24}
          onChange={(v) => onChange({ titleSize: v })} suffix="pt" />
      </Row>
      <Row label="Cor título">
        <ColorField value={axis.titleColor}
          onChange={(c) => onChange({ titleColor: c })} />
      </Row>
      <Row label="Tam. rótulo">
        <NumberStepper value={axis.labelSize} min={6} max={24}
          onChange={(v) => onChange({ labelSize: v })} suffix="pt" />
      </Row>
      <Row label="Cor rótulo"><ColorField value={axis.labelColor}
        onChange={(c) => onChange({ labelColor: c })} /></Row>
      <Row label="Cor linha"><ColorField value={axis.lineColor}
        onChange={(c) => onChange({ lineColor: c })} /></Row>
      <Row label="Esp. linha">
        <NumberStepper value={axis.lineWidth} min={0} max={5}
          onChange={(v) => onChange({ lineWidth: v })} suffix="px" />
      </Row>
      <ToggleField label="Marcações" value={axis.ticks}
        onChange={(v) => onChange({ ticks: v })} />
      <Row label="Mín">
        <Input type="number" className="h-7 text-[11px]"
          value={axis.min ?? ""} placeholder="auto"
          onChange={(e) => onChange({ min: e.target.value === "" ? null : parseFloat(e.target.value) })} />
      </Row>
      <Row label="Máx">
        <Input type="number" className="h-7 text-[11px]"
          value={axis.max ?? ""} placeholder="auto"
          onChange={(e) => onChange({ max: e.target.value === "" ? null : parseFloat(e.target.value) })} />
      </Row>
      <Row label="Formato">
        <SelectField value={axis.format}
          onChange={(v) => onChange({ format: v as never })}
          options={[
            { value: "auto", label: "Automático" },
            { value: "currency", label: "Moeda" },
            { value: "percent", label: "Percentual" },
            { value: "number", label: "Número" },
            { value: "tons", label: "Toneladas" },
          ]} />
      </Row>
      <Row label="Decimais">
        <NumberStepper value={axis.decimals} min={0} max={4}
          onChange={(v) => onChange({ decimals: v })} />
      </Row>
      <ResetButton onClick={onReset} />
    </Section>
  );
}
