// Custom Slide — tipos e helpers para slide montado livremente pelo usuário.
// Sistema de coordenadas: 1333 x 750 (espelha SlidePreview e mapeia direto
// para 13.33" x 7.5" do LAYOUT_WIDE do PPT — basta dividir por 100).

import type { Filters } from "./types";

export const CANVAS_W = 1333;
export const CANVAS_H = 750;
// Faixa Harald no rodapé — mesma proporção do export (h ≈ 0.85" = 85 unidades)
export const FOOTER_H = 85;

export type CustomBlockKind =
  | "title"
  | "text"
  | "kpi"
  | "image"
  | "shape"
  | "bridge"
  | "table"
  | "chart"
  | "topSku";

export interface BaseBlock {
  id: string;
  kind: CustomBlockKind;
  x: number; y: number; w: number; h: number;
  z: number;
}

export interface TitleBlock extends BaseBlock {
  kind: "title";
  text: string;
  size: number;
  bold: boolean;
  color: string;
  align: "left" | "center" | "right";
}

export interface TextBlock extends BaseBlock {
  kind: "text";
  text: string;
  size: number;
  color: string;
  align: "left" | "center" | "right";
}

// ---------------------------------------------------------------------------
// KPI — agora suporta valor manual OU cálculo dinâmico a partir da base
// ---------------------------------------------------------------------------
export type KpiMeasureId =
  | "rol" | "volume" | "cm" | "mb" | "cv" | "frete" | "comissao"
  | "cmPct" | "mbPct" | "precoMedio";

export type KpiPeriodMode = "fy" | "month" | "all";
export type KpiFormat = "auto" | "currency" | "percent" | "tons" | "number";

/**
 * Fonte de dados do bloco.
 * - "ke30":   base detalhada (CSV KE30 — usePricing)
 * - "budget": base agregada / orçamentária (Excel Budget — useBudget)
 * Padrão histórico: "ke30".
 */
export type BlockDataSource = "ke30" | "budget";

/** Medidas suportadas pela base Budget (subset do KpiMeasureId). */
export const BUDGET_SUPPORTED_MEASURES: ReadonlyArray<KpiMeasureId> = [
  "rol", "volume", "cm", "cv", "cmPct", "precoMedio",
];

export interface KpiBlock extends BaseBlock {
  kind: "kpi";
  label: string;
  /** Tamanho do texto do valor */
  valueSize: number;
  color: string;
  /** Modo de origem do valor */
  source: "manual" | "dynamic";
  /** Valor manual (usado quando source = manual) */
  manualValue?: string;
  /** Medida (usado quando source = dynamic) */
  measure?: KpiMeasureId;
  /** Período: fy/month/all */
  periodMode?: KpiPeriodMode;
  /** Período específico (FY string ou periodo "005.2025") */
  periodValue?: string | null;
  /** Filtros adicionais aplicados ao bloco */
  filters?: Filters;
  /** Formato; "auto" infere a partir da medida */
  format?: KpiFormat;
  /** Fonte de dados — default "ke30" para retro-compatibilidade. */
  dataSource?: BlockDataSource;
}

export interface ImageBlock extends BaseBlock {
  kind: "image";
  src: string;
  fit: "contain" | "cover";
}

export interface ShapeBlock extends BaseBlock {
  kind: "shape";
  shape: "rect" | "line";
  fill: string;
  radius: number;
}

export interface BridgeBlock extends BaseBlock {
  kind: "bridge";
  base: string | null;
  comp: string | null;
  mode: "fy" | "month";
  filters: Filters;
}

export interface TableBlock extends BaseBlock {
  kind: "table";
  source: "ke30";
  /** Fonte de dados — default "ke30". */
  dataSource?: BlockDataSource;
  measures: string[];
  rowDims: string[];
  colDim: string | null;
  filters: Filters;
  /** Se true, calcula N de linhas a partir da altura. Default: true */
  autoFit?: boolean;
  /** Limite manual de linhas quando autoFit=false. */
  maxRows?: number;
  /** Agrega o restante numa linha "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT exportado. Default: false */
  exportNote?: boolean;
  /** Medida usada para ordenar/ranquear linhas. Default: primeira de measures. */
  sortMeasure?: string;
}

// ---------------------------------------------------------------------------
// Chart — gráfico ao longo do tempo / categorias
// ---------------------------------------------------------------------------
export type CustomChartType =
  | "line" | "bar" | "column" | "hbar"
  | "stackedColumn" | "stackedBar" | "stackedArea"
  | "pie" | "donut" | "bubble" | "area"
  | "scatter" | "combo" | "waterfall"
  | "funnel" | "treemap" | "radar" | "boxplot" | "histogram";

// Importação tardia para evitar ciclo
import type { ChartStyle } from "@/components/pricing/custom/chart/types";

export interface ChartBlock extends BaseBlock {
  kind: "chart";
  chartType: CustomChartType;
  measure: KpiMeasureId;
  /** Quebra opcional por dimensão (ex.: marca, canal). null = série única */
  breakdown: string | null;
  /** @deprecated — usar style.grid.show */
  showGrid: boolean;
  /** @deprecated — usar style.general.legendShow */
  showLegend: boolean;
  /** @deprecated — usar style.dataLabels.show */
  showLabels: boolean;
  filters: Filters;
  title?: string;
  /** Auto-ajustar nº de séries pela altura do bloco. Default: true */
  autoFit?: boolean;
  /** Limite manual de séries quando autoFit=false. */
  maxSeries?: number;
  /** Agrega séries restantes em uma série "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT. Default: false */
  exportNote?: boolean;
  /** Estilo PowerPoint-grade — opcional p/ retro-compatibilidade. */
  style?: Partial<ChartStyle>;
}

// ---------------------------------------------------------------------------
// Top SKUs / Top X — ranking
// ---------------------------------------------------------------------------
export interface TopSkuBlock extends BaseBlock {
  kind: "topSku";
  /** Dimensão a ranquear */
  dim: "sku" | "skuDesc" | "cliente" | "marca" | "categoria" | "canalAjustado";
  measure: KpiMeasureId;
  topN: number;
  periodMode: KpiPeriodMode;
  periodValue?: string | null;
  filters: Filters;
  showShare: boolean;
  title?: string;
  /** Auto-ajustar nº de itens pela altura. Default: true */
  autoFit?: boolean;
  /** Agrega itens restantes em "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT. Default: false */
  exportNote?: boolean;
}

export type CustomBlock =
  | TitleBlock | TextBlock | KpiBlock | ImageBlock
  | ShapeBlock | BridgeBlock | TableBlock | ChartBlock | TopSkuBlock;

export interface CustomSlideConfig {
  blocks: CustomBlock[];
  background: string;
  showHaraldFooter: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultCustomSlide(): CustomSlideConfig {
  return {
    background: "FFFFFF",
    showHaraldFooter: true,
    blocks: [
      {
        id: rid(), kind: "title", z: 1,
        x: 40, y: 30, w: 1240, h: 70,
        text: "Título do slide", size: 44, bold: true,
        color: "C8102E", align: "left",
      } as TitleBlock,
    ],
  };
}

export function newBlock(kind: CustomBlockKind, zTop: number): CustomBlock {
  const id = rid();
  const z = zTop + 1;
  switch (kind) {
    case "title":
      return { id, kind, z, x: 60, y: 60, w: 1200, h: 70,
        text: "Novo título", size: 40, bold: true, color: "C8102E", align: "left" };
    case "text":
      return { id, kind, z, x: 60, y: 150, w: 600, h: 60,
        text: "Clique para editar este texto.", size: 18, color: "1C2430", align: "left" };
    case "kpi":
      return {
        id, kind, z, x: 60, y: 200, w: 280, h: 130,
        label: "ROL", valueSize: 36, color: "C8102E",
        source: "dynamic",
        measure: "rol",
        periodMode: "all",
        periodValue: null,
        filters: {},
        format: "auto",
        manualValue: "",
      };
    case "image":
      return { id, kind, z, x: 80, y: 220, w: 360, h: 220, src: "", fit: "contain" };
    case "shape":
      return { id, kind, z, x: 80, y: 240, w: 240, h: 140,
        shape: "rect", fill: "EEF2F6", radius: 8 };
    case "bridge":
      return { id, kind, z, x: 60, y: 200, w: 1200, h: 380,
        base: null, comp: null, mode: "month", filters: {} };
    case "table":
      return { id, kind, z, x: 60, y: 200, w: 1200, h: 360,
        source: "ke30", measures: ["rol_real", "cm_real"],
        rowDims: ["marca"], colDim: "periodo", filters: {},
        autoFit: true, showOthers: false, exportNote: false };
    case "chart":
      return {
        id, kind, z, x: 60, y: 180, w: 1200, h: 380,
        chartType: "line", measure: "cm", breakdown: null,
        showGrid: true, showLegend: true, showLabels: false,
        filters: {}, title: "Evolução",
        autoFit: true, showOthers: false, exportNote: false,
      };
    case "topSku":
      return {
        id, kind, z, x: 60, y: 180, w: 700, h: 420,
        dim: "skuDesc", measure: "cm", topN: 10,
        periodMode: "all", periodValue: null,
        filters: {}, showShare: true, title: "Top SKUs",
        autoFit: true, showOthers: false, exportNote: false,
      };
  }
}

/** Cria um ChartBlock já com chartType específico (para a paleta de gráficos). */
export function newChartBlock(chartType: CustomChartType, zTop: number): ChartBlock {
  const base = newBlock("chart", zTop) as ChartBlock;
  return { ...base, chartType, title: CHART_TYPE_LABELS[chartType] };
}

export const CHART_TYPE_LABELS: Record<CustomChartType, string> = {
  line: "Linha",
  area: "Área",
  stackedArea: "Área Empilhada",
  bar: "Coluna",
  column: "Coluna Agrupada",
  stackedColumn: "Coluna Empilhada",
  hbar: "Barra",
  stackedBar: "Barra Empilhada",
  combo: "Combinado",
  pie: "Pizza",
  donut: "Rosca",
  bubble: "Bolha",
  scatter: "Dispersão",
  waterfall: "Bridge",
  funnel: "Funil",
  treemap: "Mapa de Árvore",
  radar: "Radar",
  boxplot: "Caixa",
  histogram: "Histograma",
};

export const BLOCK_LABELS: Record<CustomBlockKind, string> = {
  title: "Título",
  text: "Texto",
  kpi: "KPI",
  image: "Imagem",
  shape: "Forma",
  bridge: "Bridge",
  table: "Tabela",
  chart: "Linha",
  topSku: "Top Ranking",
};

// ---------------------------------------------------------------------------
// Catálogo de medidas KPI/chart
// ---------------------------------------------------------------------------
export const KPI_MEASURES: { id: KpiMeasureId; label: string; format: Exclude<KpiFormat, "auto"> }[] = [
  { id: "rol",        label: "ROL",                 format: "currency" },
  { id: "volume",     label: "Volume (Kg)",         format: "tons" },
  { id: "cm",         label: "Contrib. Marginal",   format: "currency" },
  { id: "cv",         label: "Custo Variável",      format: "currency" },
  { id: "mb",         label: "Margem Bruta",        format: "currency" },
  { id: "frete",      label: "Frete",               format: "currency" },
  { id: "comissao",   label: "Comissão",            format: "currency" },
  { id: "cmPct",      label: "CM %",                format: "percent" },
  { id: "mbPct",      label: "MB %",                format: "percent" },
  { id: "precoMedio", label: "Preço Médio (R$/Kg)", format: "currency" },
];
