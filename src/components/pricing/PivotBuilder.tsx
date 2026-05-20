import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  Filter as FilterIcon,
  Flame,
  GripVertical,
  Hash,
  Layers,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Sigma,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import {
  buildUnifiedRows,
  dimensionsForMode,
  type PivotMode,
} from "@/lib/pivotData";
import { computePivot, type PivotMeasure } from "@/lib/pivot";
import type { PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type Zone = "rows" | "cols" | "values" | "filters";
type VizMode = "heatmap" | "plain";
type SortState = { col: string; measure: string; dir: "asc" | "desc" } | null;

const DIM_GROUPS = ["Tempo", "Produto", "Inovação", "Comercial"] as const;

// ---------- Catálogo de medidas por modo ----------
function measuresFor(mode: PivotMode): PivotMeasure[] {
  const real: PivotMeasure[] = [
    { id: "rol_real", label: "ROL", field: "rol_real", agg: "sum", format: "currency", tone: "real" },
    { id: "vol_real", label: "Volume", field: "volumeKg_real", agg: "sum", format: "tons", tone: "real" },
    { id: "cogs_real", label: "CPV", field: "cogs_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cvar_real", label: "Custo Variável", field: "custoVariavel_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cfix_real", label: "Custo Fixo", field: "custoFixo_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mp_real", label: "Matéria Prima", field: "materiaPrima_real", agg: "sum", format: "currency", tone: "real" },
    { id: "emb_real", label: "Embalagem", field: "embalagem_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mod_real", label: "MOD", field: "mod_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cif_real", label: "CIF", field: "cif_real", agg: "sum", format: "currency", tone: "real" },
    { id: "frete_real", label: "Frete s/ Vendas", field: "frete_real", agg: "sum", format: "currency", tone: "real" },
    { id: "com_real", label: "Comissão", field: "comissao_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mb_real", label: "MB", field: "mb_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cm_real", label: "CM", field: "cm_real", agg: "sum", format: "currency", tone: "real" },
    {
      id: "cm_pct_real",
      label: "CM %",
      field: "cm_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      derive: (a) => (a.rol_real > 0 ? a.cm_real / a.rol_real : 0),
    },
    {
      id: "mb_pct_real",
      label: "MB %",
      field: "mb_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      derive: (a) => (a.rol_real > 0 ? a.mb_real / a.rol_real : 0),
    },
    {
      id: "rol_kg_real",
      label: "ROL R$/Kg",
      field: "rol_real",
      agg: "sum",
      format: "number",
      tone: "real",
      derive: (a) => (a.vol_real > 0 ? a.rol_real / a.vol_real : 0),
    },
    {
      id: "cm_kg_real",
      label: "CM R$/Kg",
      field: "cm_real",
      agg: "sum",
      format: "number",
      tone: "real",
      derive: (a) => (a.vol_real > 0 ? a.cm_real / a.vol_real : 0),
    },
    {
      id: "com_pct_real",
      label: "Comissão %/ROL",
      field: "comissao_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      derive: (a) => (a.rol_real > 0 ? a.com_real / a.rol_real : 0),
    },
  ];
  const budget: PivotMeasure[] = [
    { id: "rol_budget", label: "ROL", field: "rol_budget", agg: "sum", format: "currency", tone: "budget" },
    { id: "vol_budget", label: "Volume", field: "volumeKg_budget", agg: "sum", format: "tons", tone: "budget" },
    { id: "cm_budget", label: "CM", field: "cm_budget", agg: "sum", format: "currency", tone: "budget" },
    { id: "cpv_budget", label: "CPV", field: "cpv_budget", agg: "sum", format: "currency", tone: "budget" },
    {
      id: "cm_pct_budget",
      label: "CM %",
      field: "cm_budget",
      agg: "sum",
      format: "percent",
      tone: "budget",
      derive: (a) => (a.rol_budget > 0 ? a.cm_budget / a.rol_budget : 0),
    },
  ];
  return mode === "real" ? real : budget;
}

function defaultConfig(mode: PivotMode) {
  return {
    rows: ["marca"],
    cols: ["fy"],
    values:
      mode === "real"
        ? ["rol_real", "cm_real", "cm_pct_real"]
        : ["rol_budget", "cm_budget", "cm_pct_budget"],
  };
}

// Quick start presets
type Preset = {
  id: string;
  label: string;
  hint: string;
  modes: PivotMode[];
  build: (mode: PivotMode) => { rows: string[]; cols: string[]; values: string[] };
};
const PRESETS: Preset[] = [
  {
    id: "marca-fy",
    label: "Marca × FY",
    hint: "Visão por marca em cada ano fiscal",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["marca"],
      cols: ["fy"],
      values:
        m === "real"
          ? ["rol_real", "cm_real", "cm_pct_real"]
          : ["rol_budget", "cm_budget", "cm_pct_budget"],
    }),
  },
  {
    id: "canal-mes",
    label: "Canal × Mês",
    hint: "Evolução mensal por canal",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["canalAjustado"],
      cols: ["mesLabel"],
      values: m === "real" ? ["rol_real"] : ["rol_budget"],
    }),
  },
  {
    id: "categoria-marca",
    label: "Categoria · Marca",
    hint: "Hierarquia categoria → marca",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["categoria", "marca"],
      cols: ["fy"],
      values: m === "real" ? ["rol_real", "cm_real"] : ["rol_budget", "cm_budget"],
    }),
  },
  {
    id: "regiao-uf",
    label: "Região × UF",
    hint: "Geografia comercial",
    modes: ["real"],
    build: () => ({
      rows: ["regiao", "uf"],
      cols: ["fy"],
      values: ["rol_real", "vol_real"],
    }),
  },
  {
    id: "inovacao",
    label: "Inovação vs Regular",
    hint: "Quebra por classificação",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["inovacao"],
      cols: ["mesLabel"],
      values: m === "real" ? ["rol_real", "cm_pct_real"] : ["rol_budget", "cm_pct_budget"],
    }),
  },
];

function fmtValue(measure: PivotMeasure, val: number) {
  if (!isFinite(val) || val === 0) return "—";
  switch (measure.format) {
    case "currency": return formatBRL(val, { compact: true });
    case "percent": return formatPct(val);
    case "tons": return `${formatNum(val / 1000, 1)} t`;
    default: return formatNum(val, 0, true);
  }
}

function toneClass(tone?: PivotMeasure["tone"], val?: number) {
  if (tone === "delta") {
    if (val == null || !isFinite(val) || val === 0) return "text-muted-foreground";
    return val > 0 ? "text-emerald-300" : "text-rose-300";
  }
  if (tone === "budget") return "text-accent-foreground/90";
  return "text-foreground";
}

function cellBg(viz: VizMode, m: PivotMeasure, v: number, max: number): React.CSSProperties | undefined {
  if (viz === "plain" || max === 0 || !isFinite(v) || v === 0) return undefined;
  const pct = Math.min(100, (Math.abs(v) / max) * 100);
  const isDelta = m.tone === "delta";
  const baseHsl = isDelta
    ? v >= 0
      ? "158 64% 52%"
      : "0 84% 65%"
    : m.tone === "budget"
      ? "263 70% 65%"
      : "217 91% 60%";
  const alpha = 0.06 + (pct / 100) * 0.42;
  return { backgroundColor: `hsl(${baseHsl} / ${alpha})` };
}

const MODE_LABEL: Record<PivotMode, string> = {
  real: "KE30",
  budget: "SuperBase",
  compare: "Comparativo",
};

// ============================================================
//                        COMPONENT
// ============================================================
export function PivotBuilder({
  realRows,
  budgetRows,
  onExportReady,
}: {
  realRows: PricingRow[];
  budgetRows: BudgetRow[];
  onExportReady?: (fn: () => void) => void;
}) {
  const [mode, setMode] = useState<PivotMode>("real");
  const [rowsDims, setRowsDims] = useState<string[]>(["marca"]);
  const [colsDims, setColsDims] = useState<string[]>(["fy"]);
  const [valueIds, setValueIds] = useState<string[]>(["rol_real", "cm_real", "cm_pct_real"]);
  const [filterDims, setFilterDims] = useState<string[]>([]);
  const [filterVals, setFilterVals] = useState<Record<string, string[]>>({});
  const [paletteQuery, setPaletteQuery] = useState("");

  // UX state
  const [viz, setViz] = useState<VizMode>("heatmap");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [sort, setSort] = useState<SortState>(null);
  const [highlightRow, setHighlightRow] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const def = defaultConfig(mode);
    setRowsDims(def.rows);
    setColsDims(def.cols);
    setValueIds(def.values);
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
  }, [mode]);

  const measureCatalog = useMemo(() => measuresFor(mode), [mode]);
  const measureMap = useMemo(
    () => new Map(measureCatalog.map((m) => [m.id, m])),
    [measureCatalog],
  );
  const dims = useMemo(() => dimensionsForMode(mode), [mode]);
  const dimMap = useMemo(() => new Map(dims.map((d) => [d.id as string, d])), [dims]);

  const unified = useMemo(
    () => buildUnifiedRows(realRows, budgetRows, mode),
    [realRows, budgetRows, mode],
  );

  const selectedMeasures = useMemo(
    () => valueIds.map((id) => measureMap.get(id)).filter(Boolean) as PivotMeasure[],
    [valueIds, measureMap],
  );

  // converter filterVals (ordem preservada) → Set para o engine
  const filterValsForEngine = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const [k, arr] of Object.entries(filterVals)) {
      if (arr && arr.length) out[k] = new Set(arr);
    }
    return out;
  }, [filterVals]);

  const pivot = useMemo(
    () =>
      computePivot(unified as unknown as Record<string, unknown>[], {
        rows: rowsDims,
        cols: colsDims,
        values: selectedMeasures,
        filters: filterValsForEngine,
      }),
    [unified, rowsDims, colsDims, selectedMeasures, filterValsForEngine],
  );

  // ----- Drag & Drop (HTML5) -----
  const [dragging, setDragging] = useState<{ id: string; from: Zone | "palette" } | null>(null);
  const [dragOver, setDragOver] = useState<Zone | null>(null);

  function isDimension(id: string) {
    return dimMap.has(id);
  }

  function removeFromZone(id: string, zone: Zone) {
    if (zone === "rows") setRowsDims((p) => p.filter((x) => x !== id));
    else if (zone === "cols") setColsDims((p) => p.filter((x) => x !== id));
    else if (zone === "values") setValueIds((p) => p.filter((x) => x !== id));
    else if (zone === "filters") {
      setFilterDims((p) => p.filter((x) => x !== id));
      setFilterVals((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  }

  function addToZone(id: string, zone: Zone) {
    if (zone === "values") {
      if (!measureMap.has(id)) return;
      setValueIds((p) => (p.includes(id) ? p : [...p, id]));
      return;
    }
    if (!isDimension(id)) return;
    if (zone !== "rows") setRowsDims((p) => p.filter((x) => x !== id));
    if (zone !== "cols") setColsDims((p) => p.filter((x) => x !== id));
    if (zone !== "filters") setFilterDims((p) => p.filter((x) => x !== id));
    if (zone === "rows") setRowsDims((p) => (p.includes(id) ? p : [...p, id]));
    else if (zone === "cols") setColsDims((p) => (p.includes(id) ? p : [...p, id]));
    else if (zone === "filters") setFilterDims((p) => (p.includes(id) ? p : [...p, id]));
  }

  function quickAdd(id: string) {
    if (measureMap.has(id)) addToZone(id, "values");
    else if (isDimension(id)) addToZone(id, "rows");
  }

  function reorderInZone(zone: Zone, fromId: string, toId: string) {
    const apply = (arr: string[]) => {
      const fromIdx = arr.indexOf(fromId);
      const toIdx = arr.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return arr;
      const next = arr.slice();
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    };
    if (zone === "rows") setRowsDims((p) => apply(p));
    else if (zone === "cols") setColsDims((p) => apply(p));
    else if (zone === "values") setValueIds((p) => apply(p));
    else if (zone === "filters") setFilterDims((p) => apply(p));
  }

  function handleDrop(zone: Zone) {
    if (!dragging) return;
    if (dragging.from !== "palette" && dragging.from !== zone) {
      removeFromZone(dragging.id, dragging.from);
    }
    addToZone(dragging.id, zone);
    setDragging(null);
    setDragOver(null);
  }

  function applyPreset(p: Preset) {
    const cfg = p.build(mode);
    setRowsDims(cfg.rows.filter((d) => dimMap.has(d)));
    setColsDims(cfg.cols.filter((d) => dimMap.has(d)));
    setValueIds(cfg.values.filter((v) => measureMap.has(v)));
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
  }

  function resetAll() {
    const def = defaultConfig(mode);
    setRowsDims(def.rows);
    setColsDims(def.cols);
    setValueIds(def.values);
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
  }

  const usedItems = new Set([...rowsDims, ...colsDims, ...filterDims, ...valueIds]);
  const activeFiltersCount = Object.values(filterVals).reduce((acc, s) => acc + (s?.length ?? 0), 0);

  const matchesQuery = (label: string) =>
    paletteQuery.trim() === "" ||
    label.toLowerCase().includes(paletteQuery.trim().toLowerCase());

  const modeMeta = {
    real: { chip: "bg-primary text-primary-foreground", glow: "shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)]" },
    budget: { chip: "bg-accent text-accent-foreground", glow: "shadow-[0_0_24px_-4px_hsl(var(--accent)/0.6)]" },
    compare: { chip: "bg-foreground text-background", glow: "" },
  } as const;

  return (
    <div className="space-y-4">
      {/* ═════════════════ COMMAND BAR ═════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/70 via-card/40 to-card/20 p-4">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary", modeMeta[mode].glow)}>
              <Sigma className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">Pivot Studio</h2>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", modeMeta[mode].chip)}>
                  {MODE_LABEL[mode]}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {pivot.rowHeaders.length.toLocaleString("pt-BR")} linhas · {selectedMeasures.length} medidas
                {activeFiltersCount > 0 && ` · ${activeFiltersCount} filtros`}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Mode switcher */}
          <div className="inline-flex rounded-xl border border-border/50 bg-secondary/40 p-1">
            {(["real", "budget"] as PivotMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all",
                  mode === m
                    ? m === "real"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {/* Viz mode (Heatmap | Valor) */}
          <div className="inline-flex rounded-xl border border-border/50 bg-secondary/40 p-1">
            {([
              { id: "heatmap" as const, icon: Flame, label: "Heatmap" },
              { id: "plain" as const, icon: Hash, label: "Valor" },
            ]).map((v) => (
              <button
                key={v.id}
                onClick={() => setViz(v.id)}
                title={v.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                  viz === v.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>

          {/* Hide empty */}
          <button
            onClick={() => setHideEmpty((h) => !h)}
            title={hideEmpty ? "Mostrar linhas vazias" : "Ocultar linhas vazias"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground",
              hideEmpty ? "bg-primary/10 text-primary" : "bg-secondary/40",
            )}
          >
            {hideEmpty ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>

          {/* Export */}
          <ExportMenu
            pivot={pivot}
            measures={selectedMeasures}
            rowDims={rowsDims}
            colDims={colsDims}
            dimMap={dimMap}
            tableRef={tableRef}
            modeLabel={MODE_LABEL[mode]}
          />

          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="h-8 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>

        {/* Presets row */}
        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Wand2 className="h-3 w-3" /> Presets
          </div>
          {PRESETS.filter((p) => p.modes.includes(mode)).map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              title={p.hint}
              className="group inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              <Zap className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═════════════════ MAIN GRID ═════════════════ */}
      <div className={cn("grid grid-cols-1 gap-4", paletteOpen ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-[44px_1fr]")}>
        {/* PALETTE */}
        <aside className="relative space-y-3 rounded-2xl border border-border/40 bg-card/30 p-3">
          <button
            onClick={() => setPaletteOpen((o) => !o)}
            className="absolute -right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground"
            title={paletteOpen ? "Fechar paleta" : "Abrir paleta"}
          >
            {paletteOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>

          {!paletteOpen && (
            <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
            </div>
          )}

          {paletteOpen && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> Campos
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={paletteQuery}
                    onChange={(e) => setPaletteQuery(e.target.value)}
                    placeholder="Buscar…"
                    className="h-8 border-border/40 bg-secondary/40 pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <Sparkles className="h-3 w-3" />
                  Clique para adicionar · arraste p/ outra zona
                </div>
              </div>

              {DIM_GROUPS.map((g) => {
                const items = dims.filter((d) => d.group === g && matchesQuery(d.label));
                if (items.length === 0) return null;
                return (
                  <div key={g} className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {g}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {items.map((d) => (
                        <Chip
                          key={d.id as string}
                          label={d.label}
                          faded={usedItems.has(d.id as string)}
                          draggable
                          onClick={() => quickAdd(d.id as string)}
                          onDragStart={() => setDragging({ id: d.id as string, from: "palette" })}
                          onDragEnd={() => setDragging(null)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1.5 border-t border-border/30 pt-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Medidas
                </div>
                <div className="flex flex-wrap gap-1">
                  {measureCatalog.filter((m) => matchesQuery(m.label)).map((m) => (
                    <Chip
                      key={m.id}
                      label={m.label}
                      tone={m.tone}
                      faded={usedItems.has(m.id)}
                      draggable
                      onClick={() => quickAdd(m.id)}
                      onDragStart={() => setDragging({ id: m.id, from: "palette" })}
                      onDragEnd={() => setDragging(null)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* CONFIG ZONES + TABLE */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <DropZone
              label="Filtros"
              icon={<FilterIcon className="h-3.5 w-3.5" />}
              accent="muted"
              zone="filters"
              count={filterDims.length}
              dragOver={dragOver === "filters"}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("filters")}
            >
              {filterDims.length === 0 && <Hint>Arraste uma dimensão</Hint>}
              {filterDims.map((id) => {
                const allValues = [...new Set(unified.map((u) => String((u as unknown as Record<string, unknown>)[id] ?? "—")))]
                  .filter(Boolean)
                  .sort();
                const selected = filterVals[id] ?? [];
                return (
                  <FilterChip
                    key={id}
                    label={dimMap.get(id)?.label ?? id}
                    values={allValues}
                    selected={selected}
                    onChange={(s) => setFilterVals((prev) => ({ ...prev, [id]: s }))}
                    onRemove={() => removeFromZone(id, "filters")}
                    draggable
                    onDragStart={() => setDragging({ id, from: "filters" })}
                    onDragOver={(e) => {
                      if (dragging && dragging.from === "filters" && dragging.id !== id) {
                        e.preventDefault();
                      }
                    }}
                    onDropOnChip={() => {
                      if (dragging && dragging.from === "filters" && dragging.id !== id) {
                        reorderInZone("filters", dragging.id, id);
                        setDragging(null);
                      }
                    }}
                    onDragEnd={() => setDragging(null)}
                  />
                );
              })}
            </DropZone>

            <DropZone
              label="Colunas"
              icon={<Columns3 className="h-3.5 w-3.5" />}
              accent="primary"
              zone="cols"
              count={colsDims.length}
              dragOver={dragOver === "cols"}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("cols")}
            >
              {colsDims.length === 0 && <Hint>Sem colunas</Hint>}
              {colsDims.map((id) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "cols")}
                  draggable
                  onDragStart={() => setDragging({ id, from: "cols" })}
                  onDragOverChip={(e) => {
                    if (dragging && dragging.from === "cols" && dragging.id !== id) e.preventDefault();
                  }}
                  onDropOnChip={() => {
                    if (dragging && dragging.from === "cols" && dragging.id !== id) {
                      reorderInZone("cols", dragging.id, id);
                      setDragging(null);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </DropZone>

            <DropZone
              label="Linhas"
              icon={<Rows3 className="h-3.5 w-3.5" />}
              accent="primary"
              zone="rows"
              count={rowsDims.length}
              dragOver={dragOver === "rows"}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("rows")}
            >
              {rowsDims.length === 0 && <Hint>Sem linhas</Hint>}
              {rowsDims.map((id) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "rows")}
                  draggable
                  onDragStart={() => setDragging({ id, from: "rows" })}
                  onDragOverChip={(e) => {
                    if (dragging && dragging.from === "rows" && dragging.id !== id) e.preventDefault();
                  }}
                  onDropOnChip={() => {
                    if (dragging && dragging.from === "rows" && dragging.id !== id) {
                      reorderInZone("rows", dragging.id, id);
                      setDragging(null);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </DropZone>

            <DropZone
              label="Valores"
              icon={<Sigma className="h-3.5 w-3.5" />}
              accent="accent"
              zone="values"
              count={valueIds.length}
              dragOver={dragOver === "values"}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("values")}
            >
              {valueIds.length === 0 && <Hint>Arraste medidas</Hint>}
              {valueIds.map((id) => {
                const m = measureMap.get(id);
                return (
                  <Chip
                    key={id}
                    label={m?.label ?? id}
                    tone={m?.tone}
                    closable
                    onRemove={() => removeFromZone(id, "values")}
                    draggable
                    onDragStart={() => setDragging({ id, from: "values" })}
                    onDragOverChip={(e) => {
                      if (dragging && dragging.from === "values" && dragging.id !== id) e.preventDefault();
                    }}
                    onDropOnChip={() => {
                      if (dragging && dragging.from === "values" && dragging.id !== id) {
                        reorderInZone("values", dragging.id, id);
                        setDragging(null);
                      }
                    }}
                    onDragEnd={() => setDragging(null)}
                  />
                );
              })}
            </DropZone>
          </div>

          <div ref={tableRef}>
            <PivotTable
              pivot={pivot}
              measures={selectedMeasures}
              rowDims={rowsDims}
              colDims={colsDims}
              dimMap={dimMap}
              viz={viz}
              hideEmpty={hideEmpty}
              sort={sort}
              setSort={setSort}
              highlightRow={highlightRow}
              setHighlightRow={setHighlightRow}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//                       SUB-COMPONENTS
// ============================================================
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] italic text-muted-foreground/60">{children}</span>;
}

function Chip({
  label,
  tone,
  closable,
  faded,
  onRemove,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOverChip,
  onDropOnChip,
}: {
  label: string;
  tone?: PivotMeasure["tone"];
  closable?: boolean;
  faded?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOverChip?: (e: React.DragEvent) => void;
  onDropOnChip?: () => void;
}) {
  const toneRing =
    tone === "budget"
      ? "border-accent/40 bg-accent/10 text-accent-foreground hover:bg-accent/20"
      : tone === "delta"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
        : tone === "real"
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border/60 bg-secondary/60 text-foreground hover:bg-secondary";

  return (
    <span
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        onDragOverChip?.(e);
      }}
      onDrop={(e) => {
        if (onDropOnChip) {
          e.preventDefault();
          e.stopPropagation();
          onDropOnChip();
        }
      }}
      onClick={onClick}
      className={cn(
        "group inline-flex cursor-grab select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition-all hover:-translate-y-px hover:shadow active:cursor-grabbing",
        toneRing,
        faded && "opacity-50",
      )}
    >
      <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-80" />
      {label}
      {closable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 rounded-full p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
          aria-label="Remover"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function FilterChip({
  label,
  values,
  selected,
  onChange,
  onRemove,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnChip,
}: {
  label: string;
  values: string[];
  /** ordem definida pelo usuário */
  selected: string[];
  onChange: (next: string[]) => void;
  onRemove: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDropOnChip?: () => void;
}) {
  const [q, setQ] = useState("");
  const count = selected.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));

  // drag-reorder dentro do popover
  const [internalDrag, setInternalDrag] = useState<string | null>(null);

  function moveItem(from: string, to: string) {
    if (from === to) return;
    const next = selected.slice();
    const fi = next.indexOf(from);
    const ti = next.indexOf(to);
    if (fi < 0 || ti < 0) return;
    next.splice(fi, 1);
    next.splice(ti, 0, from);
    onChange(next);
  }

  return (
    <span
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (onDropOnChip) {
          e.preventDefault();
          e.stopPropagation();
          onDropOnChip();
        }
      }}
      className="inline-flex items-center"
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex cursor-grab items-center gap-1 rounded-l-full border border-r-0 px-2 py-0.5 text-[11px] font-medium transition-all hover:-translate-y-px active:cursor-grabbing",
              count > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-secondary/60 text-foreground",
            )}
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            {label}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px]">{count}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-[11px] font-semibold">
            <span>{label}</span>
            <span className="text-muted-foreground font-normal">{values.length} valores</span>
          </div>

          {/* Lista ordenável dos selecionados */}
          {selected.length > 0 && (
            <div className="border-b border-border/30 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Ordem (arraste)
              </div>
              <div className="space-y-1">
                {selected.map((v) => (
                  <div
                    key={`sel-${v}`}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setInternalDrag(v);
                    }}
                    onDragOver={(e) => {
                      if (internalDrag && internalDrag !== v) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (internalDrag) moveItem(internalDrag, v);
                      setInternalDrag(null);
                    }}
                    onDragEnd={() => setInternalDrag(null)}
                    className={cn(
                      "flex cursor-grab items-center gap-2 rounded border border-border/40 bg-secondary/40 px-2 py-1 text-xs transition-colors hover:bg-secondary/70 active:cursor-grabbing",
                      internalDrag === v && "opacity-50",
                    )}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1 truncate">{v}</span>
                    <button
                      onClick={() => onChange(selected.filter((x) => x !== v))}
                      className="rounded p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-border/30 p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar valor…" className="h-7 text-xs" />
          </div>
          <div className="max-h-56 overflow-auto p-1">
            {filtered.map((v) => {
              const checked = selectedSet.has(v);
              return (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-secondary/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      if (c) {
                        if (!selectedSet.has(v)) onChange([...selected, v]);
                      } else {
                        onChange(selected.filter((x) => x !== v));
                      }
                    }}
                  />
                  <span className="truncate">{v}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">Nenhum valor</div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/40 p-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange([])}>
              Limpar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange(values.slice())}>
              Todos
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={onRemove}
        className="rounded-r-full border border-l-0 border-border/60 bg-secondary/60 px-1.5 py-0.5 hover:bg-secondary"
        aria-label="Remover filtro"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function DropZone({
  label,
  icon,
  zone,
  count,
  accent,
  dragOver,
  setDragOver,
  onDrop,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  zone: Zone;
  count: number;
  accent: "primary" | "accent" | "muted";
  dragOver: boolean;
  setDragOver: (z: Zone | null) => void;
  onDrop: () => void;
  children: React.ReactNode;
}) {
  const accentRing =
    accent === "primary"
      ? "before:bg-primary/70"
      : accent === "accent"
        ? "before:bg-accent/70"
        : "before:bg-muted-foreground/40";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(zone);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "relative min-h-[78px] overflow-hidden rounded-xl border bg-card/30 p-2.5 transition-all",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-xl",
        accentRing,
        dragOver
          ? "scale-[1.01] border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border/40",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        {count > 0 && (
          <span className="rounded-full bg-secondary/80 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

// ============================================================
//                         TABLE
// ============================================================
interface DimMeta { id: string; label: string; group: string }

function PivotTable({
  pivot,
  measures,
  rowDims,
  colDims,
  dimMap,
  viz,
  hideEmpty,
  sort,
  setSort,
  highlightRow,
  setHighlightRow,
}: {
  pivot: ReturnType<typeof computePivot>;
  measures: PivotMeasure[];
  rowDims: string[];
  colDims: string[];
  dimMap: Map<string, DimMeta>;
  viz: VizMode;
  hideEmpty: boolean;
  sort: SortState;
  setSort: (s: SortState) => void;
  highlightRow: string | null;
  setHighlightRow: (k: string | null) => void;
}) {
  if (measures.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 bg-card/20 text-sm">
        <Sigma className="h-10 w-10 text-muted-foreground/40" />
        <div className="text-muted-foreground">
          Adicione ao menos uma medida em <span className="font-semibold text-foreground">Valores</span>
        </div>
        <div className="text-[11px] text-muted-foreground/60">
          Clique em uma medida da paleta ou use um preset acima
        </div>
      </div>
    );
  }

  const hasCols = colDims.length > 0 && pivot.colHeaders.length > 0;
  const cols = hasCols ? pivot.colHeaders : [{ key: "__all__", values: [], depth: 0, isLeaf: true }];

  // Sort row headers
  const sortedRows = useMemo(() => {
    let rows = pivot.rowHeaders;
    if (hideEmpty) {
      rows = rows.filter((rh) => {
        const tot = pivot.rowTotals.get(rh.key);
        if (!tot) return false;
        return measures.some((m) => Math.abs(tot[m.id] ?? 0) > 0);
      });
    }
    if (sort) {
      const getter = (k: string) => pivot.cells.get(k)?.get(sort.col)?.[sort.measure] ?? 0;
      rows = [...rows].sort((a, b) => {
        const va = getter(a.key);
        const vb = getter(b.key);
        return sort.dir === "asc" ? va - vb : vb - va;
      });
    }
    return rows;
  }, [pivot, measures, sort, hideEmpty]);

  const maxByMeasure = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of measures) {
      let max = 0;
      for (const rh of sortedRows) {
        for (const c of cols) {
          const v = pivot.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
          if (isFinite(v)) max = Math.max(max, Math.abs(v));
        }
      }
      map.set(m.id, max);
    }
    return map;
  }, [measures, sortedRows, cols, pivot]);

  function toggleSort(colKey: string, measureId: string) {
    if (sort && sort.col === colKey && sort.measure === measureId) {
      if (sort.dir === "desc") setSort({ col: colKey, measure: measureId, dir: "asc" });
      else setSort(null);
    } else {
      setSort({ col: colKey, measure: measureId, dir: "desc" });
    }
  }

  const cellPad = "py-1 px-2";
  const headerPad = "py-1.5 px-2";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30 shadow-sm">
      <div className="relative max-h-[68vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            {hasCols && (
              <tr>
                {rowDims.map((d, i) => (
                  <th
                    key={`rh-${d}`}
                    className={cn(
                      "border-b border-border/40 bg-card/95 backdrop-blur text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                      headerPad,
                      i === 0 && "sticky left-0 z-10",
                    )}
                  >
                    {dimMap.get(d)?.label ?? d}
                  </th>
                ))}
                {rowDims.length === 0 && (
                  <th className={cn("sticky left-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur", headerPad)} />
                )}
                {cols.map((c) => (
                  <th
                    key={`ch-${c.key}`}
                    colSpan={measures.length}
                    className={cn(
                      "border-b border-l border-border/40 bg-card/95 backdrop-blur text-center text-[11px] font-semibold",
                      headerPad,
                    )}
                  >
                    {c.values.join(" · ") || ""}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {rowDims.map((d, idx) => (
                <th
                  key={`rh2-${d}`}
                  className={cn(
                    "border-b border-border/40 bg-card/95 backdrop-blur text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                    headerPad,
                    idx === 0 && "sticky left-0 z-10",
                  )}
                >
                  {!hasCols && (dimMap.get(d)?.label ?? d)}
                </th>
              ))}
              {rowDims.length === 0 && !hasCols && (
                <th className={cn("sticky left-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur", headerPad)} />
              )}
              {cols.map((c) =>
                measures.map((m) => {
                  const isSorted = sort && sort.col === c.key && sort.measure === m.id;
                  return (
                    <th
                      key={`mh-${c.key}-${m.id}`}
                      onClick={() => toggleSort(c.key, m.id)}
                      className={cn(
                        "cursor-pointer select-none border-b border-l border-border/40 bg-card/95 backdrop-blur text-right text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-secondary/80",
                        headerPad,
                        toneClass(m.tone),
                        isSorted && "text-primary",
                      )}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {m.label}
                        {isSorted ? (
                          sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-20" />
                        )}
                      </span>
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(1, rowDims.length) + cols.length * measures.length}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Sem dados para exibir. Ajuste filtros ou desative "ocultar linhas vazias".
                </td>
              </tr>
            )}
            {sortedRows.map((rh, i) => {
              const isHL = highlightRow === rh.key;
              return (
                <tr
                  key={rh.key}
                  onMouseEnter={() => setHighlightRow(rh.key)}
                  onMouseLeave={() => setHighlightRow(null)}
                  className={cn(
                    "group border-b border-border/15 transition-colors",
                    i % 2 === 0 && "bg-background/30",
                    isHL && "bg-primary/[0.06]",
                  )}
                >
                  {rowDims.map((_, idx) => (
                    <td
                      key={`rv-${rh.key}-${idx}`}
                      className={cn(
                        "text-foreground",
                        cellPad,
                        idx === 0 && "sticky left-0 z-[1] bg-card/85 backdrop-blur font-medium group-hover:bg-card",
                      )}
                    >
                      {rh.values[idx] ?? ""}
                    </td>
                  ))}
                  {rowDims.length === 0 && (
                    <td className={cn("sticky left-0 z-[1] bg-card/85 backdrop-blur font-semibold text-muted-foreground", cellPad)}>—</td>
                  )}
                  {cols.map((c) => {
                    const cell = pivot.cells.get(rh.key)?.get(c.key) ?? {};
                    return measures.map((m) => {
                      const v = cell[m.id] ?? 0;
                      const max = maxByMeasure.get(m.id) ?? 0;
                      return (
                        <td
                          key={`v-${rh.key}-${c.key}-${m.id}`}
                          style={cellBg(viz, m, v, max)}
                          className={cn(
                            "border-l border-border/10 text-right tabular-nums transition-colors",
                            cellPad,
                            toneClass(m.tone, v),
                          )}
                        >
                          {fmtValue(m, v)}
                        </td>
                      );
                    });
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//                       EXPORT MENU
// ============================================================
function ExportMenu({
  pivot,
  measures,
  rowDims,
  colDims,
  dimMap,
  tableRef,
  modeLabel,
}: {
  pivot: ReturnType<typeof computePivot>;
  measures: PivotMeasure[];
  rowDims: string[];
  colDims: string[];
  dimMap: Map<string, DimMeta>;
  tableRef: React.RefObject<HTMLDivElement>;
  modeLabel: string;
}) {
  const exportXlsx = () => {
    const cols = colDims.length > 0 && pivot.colHeaders.length > 0
      ? pivot.colHeaders
      : [{ key: "__all__", values: [], depth: 0, isLeaf: true }];
    const header: string[] = [
      ...rowDims.map((d) => dimMap.get(d)?.label ?? d),
      ...cols.flatMap((c) =>
        measures.map((m) => `${c.values.join(" · ") || "Total"} | ${m.label}`),
      ),
    ];
    const rows: (string | number)[][] = [];
    for (const rh of pivot.rowHeaders) {
      const row: (string | number)[] = [];
      rowDims.forEach((_, i) => row.push(rh.values[i] ?? ""));
      for (const c of cols) {
        const cell = pivot.cells.get(rh.key)?.get(c.key) ?? {};
        for (const m of measures) {
          const v = cell[m.id] ?? 0;
          row.push(isFinite(v) ? Number(v) : "");
        }
      }
      rows.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot");
    XLSX.writeFile(wb, `pivot_${modeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPng = async () => {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b0b0f",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pivot_${modeLabel}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error("PNG export failed", err);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Exportar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        <button
          onClick={exportXlsx}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/60"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
        </button>
        <button
          onClick={exportPng}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/60"
        >
          <FileImage className="h-3.5 w-3.5" /> Imagem (.png)
        </button>
      </PopoverContent>
    </Popover>
  );
}
