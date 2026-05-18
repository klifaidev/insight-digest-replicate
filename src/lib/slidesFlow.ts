// Slides Flow — todos os slides são "custom" (canvas livre).
// Os antigos tipos especiais (bridge_pvm, budget_evo, cover) viraram
// blocos dentro do canvas (bridge_pvm_block, budget_evo_block, cover_block).
//
// Este módulo expõe:
//  - SlideKind = "custom" (único tipo válido agora)
//  - BLOCK_CATALOG: catálogo de blocos que podem ser adicionados ao canvas
//  - defaultItem(): cria um novo slide custom
//  - itemToFlow(): converte um SlideItem em SlideFlowItem para o exporter PPTX
//  - Helpers de conveniência para criar slides pré-configurados com cada bloco especial
//
// Tipos legados (BridgePvmSlideConfig, BudgetEvoSlideConfig, CoverSlideConfig)
// permanecem exportados como @deprecated para não quebrar imports antigos.

import type { Filters, PricingRow, Metric } from "./types";
import type { BudgetRow } from "./budget";
import { applyBudgetFilters } from "./budget";
import { monthLabel } from "./format";
import { type SlideFlowItem, type BudgetEvoRow } from "./exportPpt";
import { addCustomSlide } from "./exportCustomSlide";
import {
  defaultCustomSlide,
  newBlock,
  type CustomSlideConfig,
  type BridgePvmBlock,
  type BudgetEvoBlock,
  type CoverBlock,
} from "./customSlide";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
/**
 * O único SlideKind canônico é "custom". Os valores legados
 * ("bridge_pvm" | "budget_evo" | "cover") permanecem no union apenas como
 * compatibilidade para código UI que ainda não foi migrado.
 * @deprecated valores legados — todos os slides novos devem usar "custom".
 */
export type SlideKind = "custom" | "bridge_pvm" | "budget_evo" | "cover";

export interface BaseSlideItem {
  id: string;
  kind: SlideKind;
  label?: string;
}

/** @deprecated Use BridgePvmBlock dentro de um slide custom. */
export interface BridgePvmSlideConfig {
  mode: "fy" | "month";
  base: string | null;
  comp: string | null;
  filters: Filters;
  speakerNotes?: string;
}

/** @deprecated Use BudgetEvoBlock dentro de um slide custom. */
export interface BudgetEvoSlideConfig {
  start: string | null;
  end: string | null;
  filters: Filters;
  speakerNotes?: string;
}

/** @deprecated Use CoverBlock dentro de um slide custom. */
export interface CoverSlideConfig {
  title: string;
  subtitle?: string;
  variant: "cover" | "divider";
  speakerNotes?: string;
}

export type SlideItem =
  | (BaseSlideItem & { kind: "custom"; config: CustomSlideConfig })
  /** @deprecated */ | (BaseSlideItem & { kind: "bridge_pvm"; config: BridgePvmSlideConfig })
  /** @deprecated */ | (BaseSlideItem & { kind: "budget_evo"; config: BudgetEvoSlideConfig })
  /** @deprecated */ | (BaseSlideItem & { kind: "cover"; config: CoverSlideConfig });

// ---------------------------------------------------------------------------
// Catálogo de BLOCOS (substitui o antigo catálogo de slides)
// ---------------------------------------------------------------------------
export type BlockGroup = "analytics" | "content";

export interface BlockCatalogEntry {
  kind:
    | "bridge_pvm_block" | "budget_evo_block" | "cover_block"
    | "title" | "text" | "kpi" | "chart" | "table" | "topSku" | "image" | "shape";
  group: BlockGroup;
  title: string;
  description?: string;
  icon: string;
}

export const BLOCK_CATALOG: readonly BlockCatalogEntry[] = [
  // Análise (ocupam o slide inteiro)
  { kind: "bridge_pvm_block", group: "analytics", title: "Bridge PVM",      description: "Waterfall de variação de margem",        icon: "GitBranch" },
  { kind: "budget_evo_block", group: "analytics", title: "Budget Evolutivo", description: "Real vs Budget ao longo do tempo",       icon: "Target" },
  { kind: "cover_block",      group: "analytics", title: "Capa / Divisor",   description: "Slide de abertura ou seção",             icon: "BookOpen" },
  // Conteúdo (posicionados livremente)
  { kind: "title",  group: "content", title: "Título",  icon: "Type" },
  { kind: "text",   group: "content", title: "Texto",   icon: "AlignLeft" },
  { kind: "kpi",    group: "content", title: "KPI",     icon: "Hash" },
  { kind: "chart",  group: "content", title: "Gráfico", icon: "BarChart3" },
  { kind: "table",  group: "content", title: "Tabela",  icon: "Table" },
  { kind: "topSku", group: "content", title: "Ranking", icon: "Trophy" },
  { kind: "image",  group: "content", title: "Imagem",  icon: "Image" },
  { kind: "shape",  group: "content", title: "Forma",   icon: "Square" },
] as const;

/** @deprecated Catálogo legado de slides (pré-refatoração canvas-only).
 *  Use BLOCK_CATALOG. Mantido apenas para compatibilidade com UI antiga. */
export const SLIDE_CATALOG: readonly SlideTypeMeta[] = [
  { kind: "bridge_pvm", title: "Bridge",           description: "Decomposição de variação de margem.",       icon: "GitBranch",      accent: "blue",    supportsFilters: true  },
  { kind: "budget_evo", title: "Budget Evolutivo", description: "Real vs Budget mês a mês.",                 icon: "Target",         accent: "amber",   supportsFilters: true  },
  { kind: "cover",      title: "Capa / Divisor",   description: "Slide de abertura ou divisor.",             icon: "BookOpen",       accent: "neutral", supportsFilters: false },
  { kind: "custom",     title: "Personalizado",    description: "Monte seu próprio slide com blocos.",       icon: "LayoutTemplate", accent: "neutral", supportsFilters: false },
];

export interface SlideTypeMeta {
  kind: SlideKind;
  title: string;
  description: string;
  icon: string;
  accent: "blue" | "amber" | "neutral";
  supportsFilters: boolean;
}

/** Metadata único — todos os slides são "custom". */
export function metaOf(kind: SlideKind = "custom"): SlideTypeMeta {
  const found = SLIDE_CATALOG.find((s) => s.kind === kind);
  if (found) return found;
  return {
    kind: "custom",
    title: "Slide",
    description: "Slide montado com blocos no canvas.",
    icon: "LayoutTemplate",
    accent: "neutral",
    supportsFilters: false,
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultItem(_kind: SlideKind = "custom"): SlideItem {
  return {
    id: newId(),
    kind: "custom",
    label: "Slide personalizado",
    config: defaultCustomSlide(),
  };
}

// ---------------------------------------------------------------------------
// Conveniência: cria slides custom já com um bloco especial ocupando o canvas
// ---------------------------------------------------------------------------
type CustomSlideItem = BaseSlideItem & { kind: "custom"; config: CustomSlideConfig };

function blankCustomSlide(label: string): CustomSlideItem {
  return {
    id: newId(),
    kind: "custom",
    label,
    config: {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [],
    },
  };
}

export function createBridgePvmSlide(): SlideItem {
  const slide = blankCustomSlide("Bridge PVM");
  const block = newBlock("bridge_pvm_block", 0) as BridgePvmBlock;
  slide.config.blocks = [block];
  return slide;
}

export function createBudgetEvoSlide(): SlideItem {
  const slide = blankCustomSlide("Budget Evolutivo");
  const block = newBlock("budget_evo_block", 0) as BudgetEvoBlock;
  slide.config.blocks = [block];
  return slide;
}

export function createCoverSlide(
  title: string,
  subtitle?: string,
  variant: "cover" | "divider" = "cover",
): SlideItem {
  const slide = blankCustomSlide(variant === "divider" ? "Divisor" : "Capa");
  const block = newBlock("cover_block", 0) as CoverBlock;
  block.title = title;
  block.subtitle = subtitle;
  block.variant = variant;
  slide.config.blocks = [block];
  return slide;
}

// ---------------------------------------------------------------------------
// Conversão item → SlideFlowItem (único caminho: custom)
// ---------------------------------------------------------------------------
export interface BuildContext {
  pricingRows: PricingRow[];
  budgetRows: BudgetRow[];
  metric: Metric;
}

export function itemToFlow(item: SlideItem, _ctx: BuildContext): SlideFlowItem {
  const id = item.id;
  // Apenas slides "custom" são exportados pelo novo caminho.
  // Itens legados (bridge_pvm/budget_evo/cover) ficam vazios — devem ser
  // migrados via createBridgePvmSlide/createBudgetEvoSlide/createCoverSlide.
  if (item.kind !== "custom") {
    return { build: async () => { /* legacy item — no-op */ } };
  }
  const cfg = item.config;
  return {
    build: async (pptx) => {
      await addCustomSlide(pptx, cfg, { slideId: id });
    },
  };
}

// ---------------------------------------------------------------------------
// Budget evo helper (mantido — usado por BudgetEvoBlock renderer)
// ---------------------------------------------------------------------------
export function computeBudgetEvoMonthly(
  budgetRows: BudgetRow[],
  filters: Filters,
  start: string | null,
  end: string | null,
): BudgetEvoRow[] {
  const filtered = applyBudgetFilters(budgetRows, filters, null);

  type Acc = {
    periodo: string; mes: number; ano: number; label: string;
    realRol: number; budRol: number;
    realCm: number; budCm: number;
    realVol: number; budVol: number;
  };
  const map = new Map<string, Acc>();
  const ensure = (r: BudgetRow) => {
    let x = map.get(r.periodo);
    if (!x) {
      x = {
        periodo: r.periodo, mes: r.mes, ano: r.ano,
        label: monthLabel(r.mes, r.ano),
        realRol: 0, budRol: 0, realCm: 0, budCm: 0, realVol: 0, budVol: 0,
      };
      map.set(r.periodo, x);
    }
    return x;
  };
  for (const r of filtered) {
    const x = ensure(r);
    if (r.kind === "real") { x.realRol += r.receita; x.realCm += r.cm; x.realVol += r.volumeKg; }
    else { x.budRol += r.receita; x.budCm += r.cm; x.budVol += r.volumeKg; }
  }

  let monthly = Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  if (start || end) {
    const periods = monthly.map((m) => m.periodo);
    const si = start ? periods.indexOf(start) : 0;
    const ei = end ? periods.indexOf(end) : periods.length - 1;
    if (si >= 0 && ei >= 0) {
      const [a, b] = si <= ei ? [si, ei] : [ei, si];
      monthly = monthly.slice(a, b + 1);
    }
  }

  return monthly.map((x) => ({
    label: x.label,
    periodo: x.periodo,
    realCm: x.realCm, budCm: x.budCm,
    realCmPct: x.realRol ? x.realCm / x.realRol : null,
    budCmPct: x.budRol ? x.budCm / x.budRol : null,
    realCmKg: x.realVol ? x.realCm / x.realVol : null,
    budCmKg: x.budVol ? x.budCm / x.budVol : null,
    realVol: x.realVol, budVol: x.budVol,
  }));
}

// ---------------------------------------------------------------------------
// Validação leve
// ---------------------------------------------------------------------------
export function isItemReady(item: SlideItem): { ok: boolean; reason?: string } {
  if (item.config.blocks.length === 0) return { ok: false, reason: "Adicione ao menos um bloco." };
  return { ok: true };
}

