// ChartInspector — PowerPoint-grade design panel for ChartBlock.
// Sections shown depend on chartType. Filters live in a separate tab (already
// handled by FilteredInspector wrapper outside).

import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import { KPI_MEASURES } from "@/lib/customSlide";
import { ensureChartStyle, type ChartStyle } from "./types";
import {
  Section, Row, ToggleField, NumberStepper, ColorField, SelectField,
} from "./Inspector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Patch = Partial<ChartBlock>;

export function ChartInspector({
  block, onChange,
}: { block: ChartBlock; onChange: (p: Patch) => void }) {
  const style = ensureChartStyle(block.style);
  const updStyle = (patch: Partial<ChartStyle>) =>
    onChange({ style: { ...block.style, ...patch } } as Patch);
  const updPath = <K extends keyof ChartStyle>(key: K, patch: Partial<ChartStyle[K]>) =>
    updStyle({ [key]: { ...(style[key] as object), ...patch } } as Partial<ChartStyle>);

  const ct = block.chartType;
  const showAxes = !["pie", "donut"].includes(ct);
  const showSeries = !["pie", "donut", "bubble", "scatter", "waterfall"].includes(ct);

  return (
    <div className="space-y-2">
      {/* ===== Data ===== */}
      <Section title="Dados" defaultOpen>
        <Row label="Tipo">
          <SelectField value={ct as string}
            onChange={(v) => onChange({ chartType: v as ChartBlock["chartType"] })}
            options={[
              { value: "line", label: "Linha" },
              { value: "area", label: "Área" },
              { value: "bar", label: "Coluna (vertical)" },
              { value: "column", label: "Coluna agrupada" },
              { value: "hbar", label: "Barra horizontal" },
              { value: "combo", label: "Combo (linha + barra)" },
              { value: "pie", label: "Pizza" },
              { value: "donut", label: "Rosca" },
              { value: "bubble", label: "Bolha" },
              { value: "scatter", label: "Dispersão" },
              { value: "waterfall", label: "Waterfall" },
            ]} />
        </Row>
        <Row label="Medida">
          <SelectField value={block.measure}
            onChange={(v) => onChange({ measure: v as KpiMeasureId })}
            options={KPI_MEASURES.map((m) => ({ value: m.id, label: m.label }))} />
        </Row>
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
      </Section>

      {/* ===== Grid ===== */}
      {showAxes && (
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
        </Section>
      )}

      {/* ===== Axes ===== */}
      {showAxes && (
        <>
          <AxisSection title="Eixo X" axis={style.xAxis}
            onChange={(p) => updPath("xAxis", p)} />
          <AxisSection title="Eixo Y" axis={style.yAxis}
            onChange={(p) => updPath("yAxis", p)} />
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
        <Row label="Posição">
          <SelectField value={style.dataLabels.position}
            onChange={(v) => updPath("dataLabels", { position: v as never })}
            options={[
              { value: "above", label: "Acima" },
              { value: "below", label: "Abaixo" },
              { value: "inside-end", label: "Dentro topo" },
              { value: "inside-base", label: "Dentro base" },
              { value: "center", label: "Centro" },
            ]} />
        </Row>
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
      </Section>

      {/* ===== Type-specific ===== */}
      {(ct === "bar" || ct === "column" || ct === "hbar") && (
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
        </Section>
      )}

      {(ct === "pie" || ct === "donut") && (
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
        </Section>
      )}

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
            <NumberStepper value={Math.round(style.bubble.fillOpacity * 100)}
              min={0} max={100}
              onChange={(v) => updPath("bubble", { fillOpacity: v / 100 })} suffix="%" />
          </Row>
          <Row label="Borda"><ColorField value={style.bubble.borderColor}
            onChange={(c) => updPath("bubble", { borderColor: c })} /></Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.bubble.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bubble", { borderWidth: v })} suffix="px" />
          </Row>
        </Section>
      )}

      {ct === "area" && (
        <Section title="Área">
          <ToggleField label="Empilhado" value={style.area.stacked}
            onChange={(v) => updPath("area", { stacked: v })} />
          <ToggleField label="Linha por cima" value={style.area.lineOnTop}
            onChange={(v) => updPath("area", { lineOnTop: v })} />
        </Section>
      )}

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
          <ToggleField label="Total acumulado" value={style.waterfall.showRunningTotal}
            onChange={(v) => updPath("waterfall", { showRunningTotal: v })} />
          <Row label="Espaçamento">
            <NumberStepper value={style.waterfall.gapPct} min={0} max={80}
              onChange={(v) => updPath("waterfall", { gapPct: v })} suffix="%" />
          </Row>
        </Section>
      )}

      {/* ===== Series (color overrides) ===== */}
      {showSeries && (
        <Section title="Séries">
          <p className="text-[10px] text-muted-foreground">
            Cores e estilos adicionais aplicados na ordem das séries detectadas.
          </p>
          {(style.series.length === 0 ? [{ key: "Total", color: undefined } as never] : style.series)
            .map((s, i) => (
              <div key={i} className="space-y-1 rounded border border-border/30 p-1.5">
                <div className="text-[10px] font-medium">{s.key}</div>
                <Row label="Cor">
                  <ColorField value={s.color ?? "#C8102E"}
                    onChange={(c) => {
                      const next = [...style.series];
                      const existing = next.find((x) => x.key === s.key);
                      if (existing) existing.color = c;
                      else next.push({ key: s.key, color: c });
                      updStyle({ series: next });
                    }} />
                </Row>
              </div>
            ))}
        </Section>
      )}
    </div>
  );
}

function AxisSection({ title, axis, onChange }: {
  title: string;
  axis: ChartStyle["xAxis"];
  onChange: (p: Partial<ChartStyle["xAxis"]>) => void;
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
      <Row label="Tam. rótulo">
        <NumberStepper value={axis.labelSize} min={6} max={24}
          onChange={(v) => onChange({ labelSize: v })} suffix="pt" />
      </Row>
      <Row label="Cor rótulo"><ColorField value={axis.labelColor}
        onChange={(c) => onChange({ labelColor: c })} /></Row>
      <Row label="Cor linha"><ColorField value={axis.lineColor}
        onChange={(c) => onChange({ lineColor: c })} /></Row>
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
    </Section>
  );
}
