// Slide Template Registry — Fase 1 (6 templates principais).
// Os blocos abaixo são *definições* (sem id estável); o id é gerado no apply.

import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";

// Distributive Omit so each member of the discriminated union keeps its own props.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type TemplateBlock = DistributiveTemplateBlock;

export type TemplateCategory =
  | "todos"
  | "visao-geral"
  | "analise-resultado"
  | "causa-efeito"
  | "comparativo"
  | "detalhamento"
  | "deck-completo"
  | "meus-modelos";

export interface TemplateSlide {
  title: string;
  background?: string;
  showHaraldFooter?: boolean;
  blocks: TemplateBlock[];
}

export interface SlideTemplate {
  id: string;
  name: string;
  category: Exclude<TemplateCategory, "todos" | "meus-modelos">;
  description: string;
  tags: string[];
  slides: TemplateSlide[];
  isDeck: boolean;
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  todos: "Todos",
  "visao-geral": "Visão geral",
  "analise-resultado": "Análise de resultado",
  "causa-efeito": "Causa e efeito",
  comparativo: "Comparativo",
  detalhamento: "Detalhamento",
  "deck-completo": "Deck completo",
  "meus-modelos": "Meus modelos",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TITLE = (text: string, z = 1): TemplateBlock => ({
  kind: "title", z, x: 40, y: 30, w: 1240, h: 60,
  text, size: 32, bold: true, color: "C8102E", align: "left",
});

const KPI = (
  label: string, measure: TemplateBlock extends infer _ ? string : never,
  x: number, y: number, w: number, h: number, z: number, color = "1C2430",
): TemplateBlock => ({
  kind: "kpi", z, x, y, w, h,
  label, valueSize: 28, color,
  source: "dynamic", measure: measure as never,
  periodMode: "all", periodValue: null, filters: {},
  format: "auto", manualValue: "", dataSource: "ke30",
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const T01_RESUMO_EXECUTIVO: SlideTemplate = {
  id: "T01", name: "Resumo Executivo", category: "visao-geral",
  description: "Visão consolidada do mês com KPIs principais e evolução em linha.",
  tags: ["KPI", "Linha", "Diretoria"],
  isDeck: false,
  slides: [{
    title: "Resumo Executivo",
    blocks: [
      TITLE("Resumo Executivo"),
      KPI("Receita Líquida", "rol",     40,  100, 410, 110, 2, "C8102E"),
      KPI("Margem Contrib.", "cm",     460,  100, 410, 110, 3),
      KPI("Volume",          "volume", 880,  100, 410, 110, 4),
      KPI("Preço Médio",     "precoMedio", 40, 225, 625, 100, 5),
      KPI("CM %",            "cmPct",      675, 225, 625, 100, 6),
      {
        kind: "chart", z: 7, x: 40, y: 340, w: 1250, h: 380,
        chartType: "line", measure: "rol", breakdown: null,
        showGrid: true, showLegend: true, showLabels: false,
        filters: {}, title: "Evolução de Receita Líquida",
        autoFit: true, dataSource: "ke30",
      },
    ],
  }],
};

const T02_KPIS_BRIDGE: SlideTemplate = {
  id: "T02", name: "KPIs + Bridge PVM", category: "visao-geral",
  description: "4 KPIs no topo e Bridge de decomposição de resultado abaixo.",
  tags: ["KPI", "Bridge", "PVM"],
  isDeck: false,
  slides: [{
    title: "KPIs + Bridge PVM",
    blocks: [
      TITLE("KPIs + Bridge PVM"),
      KPI("Receita", "rol",     40,  100, 305, 110, 2, "C8102E"),
      KPI("Volume",  "volume", 355,  100, 305, 110, 3),
      KPI("Preço",   "precoMedio", 670, 100, 305, 110, 4),
      KPI("Margem",  "cm",     985,  100, 305, 110, 5),
      {
        kind: "bridge", z: 6, x: 40, y: 230, w: 1250, h: 490,
        base: null, comp: null, mode: "month", filters: {},
      },
    ],
  }],
};

const T11_BRIDGE_PVM: SlideTemplate = {
  id: "T11", name: "Bridge de Preço × Volume × Mix", category: "causa-efeito",
  description: "Decomposição clássica PVM do resultado vs. período anterior.",
  tags: ["Bridge", "PVM", "Causa"],
  isDeck: false,
  slides: [{
    title: "Bridge PVM",
    blocks: [
      TITLE("Bridge de Preço × Volume × Mix"),
      {
        kind: "bridge", z: 2, x: 40, y: 100, w: 1250, h: 620,
        base: null, comp: null, mode: "month", filters: {},
      },
    ],
  }],
};

const T15_REAL_VS_BUDGET: SlideTemplate = {
  id: "T15", name: "Realizado vs. Budget", category: "comparativo",
  description: "Comparativo entre resultado realizado e orçamento previsto.",
  tags: ["Budget", "Comparativo", "Realizado"],
  isDeck: false,
  slides: [{
    title: "Realizado vs. Budget",
    blocks: [
      TITLE("Realizado vs. Budget"),
      KPI("Receita (Realizado)", "rol",     40,  100, 410, 110, 2, "C8102E"),
      KPI("Volume (Realizado)",  "volume", 460,  100, 410, 110, 3),
      KPI("Margem (Realizado)",  "cm",     880,  100, 410, 110, 4),
      {
        kind: "chart", z: 5, x: 40, y: 230, w: 1250, h: 490,
        chartType: "column", measure: "rol", breakdown: "marca",
        showGrid: true, showLegend: true, showLabels: false,
        filters: {}, title: "Realizado por marca",
        autoFit: true, dataSource: "ke30",
      },
    ],
  }],
};

const T19_TABELA_COMPLETA: SlideTemplate = {
  id: "T19", name: "Tabela Completa", category: "detalhamento",
  description: "Tabela dinâmica com todos os indicadores por categoria.",
  tags: ["Tabela", "Detalhamento"],
  isDeck: false,
  slides: [{
    title: "Tabela Completa",
    blocks: [
      TITLE("Detalhamento por Categoria"),
      {
        kind: "table", z: 2, x: 40, y: 100, w: 1250, h: 620,
        source: "ke30", dataSource: "ke30",
        measures: ["rol_real", "vol_real", "cm_real", "mb_real"],
        rowDims: ["categoria"], colDim: null, filters: {},
        autoFit: true, showOthers: false, exportNote: false,
      },
    ],
  }],
};

const T20_KPIS_TABELA: SlideTemplate = {
  id: "T20", name: "KPIs + Tabela", category: "detalhamento",
  description: "3 KPIs de destaque e tabela de detalhamento abaixo.",
  tags: ["KPI", "Tabela", "Detalhamento"],
  isDeck: false,
  slides: [{
    title: "KPIs + Tabela",
    blocks: [
      TITLE("KPIs + Tabela"),
      KPI("ROL",    "rol",     40,  100, 410, 110, 2, "C8102E"),
      KPI("Volume", "volume", 460,  100, 410, 110, 3),
      KPI("CM",     "cm",     880,  100, 410, 110, 4),
      {
        kind: "table", z: 5, x: 40, y: 230, w: 1250, h: 490,
        source: "ke30", dataSource: "ke30",
        measures: ["rol_real", "vol_real", "cm_real", "precoMedio_real"],
        rowDims: ["marca"], colDim: null, filters: {},
        autoFit: true, showOthers: false, exportNote: false,
      },
    ],
  }],
};

export const TEMPLATE_REGISTRY: SlideTemplate[] = [
  T01_RESUMO_EXECUTIVO,
  T02_KPIS_BRIDGE,
  T11_BRIDGE_PVM,
  T15_REAL_VS_BUDGET,
  T19_TABELA_COMPLETA,
  T20_KPIS_TABELA,
];

export function templateToSlideConfig(tpl: SlideTemplate): CustomSlideConfig {
  const slide = tpl.slides[0];
  return {
    background: slide.background ?? "FFFFFF",
    showHaraldFooter: slide.showHaraldFooter ?? true,
    blocks: slide.blocks.map((b) => ({
      ...JSON.parse(JSON.stringify(b)),
      id: rid(),
    })) as CustomBlock[],
  };
}

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
