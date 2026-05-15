import type { Filters, Metric, PricingRow } from "./types";

export const measureOf = (r: PricingRow, m: Metric) =>
  m === "cm" ? r.contribMarginal : r.margemBruta;

export function applyFilters(
  rows: PricingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): PricingRow[] {
  return rows.filter((r) => {
    if (selectedPeriods && selectedPeriods.length && !selectedPeriods.includes(r.periodo)) return false;
    for (const [k, vals] of Object.entries(filters)) {
      if (!vals || vals.length === 0) continue;
      const v = (r as unknown as Record<string, unknown>)[k] as string | undefined;
      if (!v || !vals.includes(v)) return false;
    }
    return true;
  });
}

export interface KPI {
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  skus: number;
}

export function computeKPIs(rows: PricingRow[], metric: Metric): KPI {
  let rol = 0, margem = 0, volumeKg = 0;
  const skuSet = new Set<string>();
  for (const r of rows) {
    rol += r.rol;
    margem += measureOf(r, metric);
    volumeKg += r.volumeKg;
    if (r.sku) skuSet.add(r.sku);
  }
  return {
    rol,
    margem,
    margemPct: rol > 0 ? margem / rol : 0,
    volumeKg,
    skus: skuSet.size,
  };
}

export interface KPIComparison {
  current: KPI;
  previous: KPI;
  delta: KPI;       // absolute deltas (current - previous), margemPct as pp diff
  deltaPct: KPI;    // relative deltas ((c - p) / |p|); 0 when previous is 0
}

export function computeKPIComparison(
  currentRows: PricingRow[],
  previousRows: PricingRow[],
  metric: Metric,
): KPIComparison {
  const current = computeKPIs(currentRows, metric);
  const previous = computeKPIs(previousRows, metric);
  const sub = (a: number, b: number) => a - b;
  const rel = (a: number, b: number) => (b !== 0 ? (a - b) / Math.abs(b) : 0);
  const delta: KPI = {
    rol: sub(current.rol, previous.rol),
    margem: sub(current.margem, previous.margem),
    margemPct: sub(current.margemPct, previous.margemPct),
    volumeKg: sub(current.volumeKg, previous.volumeKg),
    skus: sub(current.skus, previous.skus),
  };
  const deltaPct: KPI = {
    rol: rel(current.rol, previous.rol),
    margem: rel(current.margem, previous.margem),
    margemPct: rel(current.margemPct, previous.margemPct),
    volumeKg: rel(current.volumeKg, previous.volumeKg),
    skus: rel(current.skus, previous.skus),
  };
  return { current, previous, delta, deltaPct };
}

/**
 * Determine the comparison context (previous-period rows + label) for KPI deltas.
 * Returns null when no comparable previous period exists in the data.
 */
export function getKpiComparisonContext(
  rows: PricingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): { previousRows: PricingRow[]; label: string } | null {
  const allPeriods = Array.from(new Set(rows.map((r) => r.periodo))).sort();
  if (allPeriods.length < 2) return null;

  const fyOf = (p: string): string | undefined =>
    rows.find((r) => r.periodo === p)?.fy;

  let previousPeriods: string[] = [];
  let label = "";

  if (selectedPeriods && selectedPeriods.length === 1) {
    const idx = allPeriods.indexOf(selectedPeriods[0]);
    if (idx <= 0) return null;
    previousPeriods = [allPeriods[idx - 1]];
    label = "vs. mês anterior";
  } else {
    const activePeriods = selectedPeriods && selectedPeriods.length
      ? selectedPeriods
      : allPeriods;
    const fys = Array.from(new Set(activePeriods.map(fyOf).filter(Boolean))) as string[];
    if (fys.length !== 1) return null;
    const allFys = Array.from(new Set(rows.map((r) => r.fy))).sort();
    const fyIdx = allFys.indexOf(fys[0]);
    if (fyIdx <= 0) return null;
    const prevFy = allFys[fyIdx - 1];
    previousPeriods = allPeriods.filter((p) => fyOf(p) === prevFy);
    if (previousPeriods.length === 0) return null;
    label = "vs. ano fiscal anterior";
  }

  const previousRows = applyFilters(rows, filters, previousPeriods);
  return { previousRows, label };
}

export interface AggRow {
  key: string;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  rolPorKg: number;
  custoVariavel: number;
  custoFixo: number;
}

export function aggregateBy(
  rows: PricingRow[],
  metric: Metric,
  keyFn: (r: PricingRow) => string,
): AggRow[] {
  const map = new Map<string, { rol: number; margem: number; volumeKg: number; custoVariavel: number; custoFixo: number }>();
  for (const r of rows) {
    const k = keyFn(r) || "—";
    const cur = map.get(k) ?? { rol: 0, margem: 0, volumeKg: 0, custoVariavel: 0, custoFixo: 0 };
    cur.rol += r.rol;
    cur.margem += measureOf(r, metric);
    cur.volumeKg += r.volumeKg;
    cur.custoVariavel += r.custoVariavel ?? 0;
    cur.custoFixo += r.custoFixo ?? 0;
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      rol: v.rol,
      margem: v.margem,
      margemPct: v.rol > 0 ? v.margem / v.rol : 0,
      volumeKg: v.volumeKg,
      rolPorKg: v.volumeKg > 0 ? v.rol / v.volumeKg : 0,
      custoVariavel: v.custoVariavel,
      custoFixo: v.custoFixo,
    }))
    .sort((a, b) => b.rol - a.rol);
}

export interface CostEvolutionRow {
  periodo: string;
  label: string;
  ano: number;
  mes: number;
  rol: number;
  volumeKg: number;
  custoVariavel: number;
  custoFixo: number;
  custoTotal: number;
  custoVariavelPctRol: number;
  custoFixoPctRol: number;
  custoTotalPctRol: number;
  custoVariavelPorKg: number;
  custoFixoPorKg: number;
  custoTotalPorKg: number;
}

export function computeCostEvolution(rows: PricingRow[]): CostEvolutionRow[] {
  const map = new Map<string, CostEvolutionRow>();
  for (const r of rows) {
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo,
      label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      ano: r.ano,
      mes: r.mes,
      rol: 0,
      volumeKg: 0,
      custoVariavel: 0,
      custoFixo: 0,
      custoTotal: 0,
      custoVariavelPctRol: 0,
      custoFixoPctRol: 0,
      custoTotalPctRol: 0,
      custoVariavelPorKg: 0,
      custoFixoPorKg: 0,
      custoTotalPorKg: 0,
    };
    cur.rol += r.rol;
    cur.volumeKg += r.volumeKg;
    cur.custoVariavel += r.custoVariavel ?? 0;
    cur.custoFixo += r.custoFixo ?? 0;
    map.set(r.periodo, cur);
  }

  return Array.from(map.values())
    .map((row) => {
      const custoTotal = row.custoVariavel + row.custoFixo;
      return {
        ...row,
        custoTotal,
        custoVariavelPctRol: row.rol > 0 ? row.custoVariavel / row.rol : 0,
        custoFixoPctRol: row.rol > 0 ? row.custoFixo / row.rol : 0,
        custoTotalPctRol: row.rol > 0 ? custoTotal / row.rol : 0,
        custoVariavelPorKg: row.volumeKg > 0 ? row.custoVariavel / row.volumeKg : 0,
        custoFixoPorKg: row.volumeKg > 0 ? row.custoFixo / row.volumeKg : 0,
        custoTotalPorKg: row.volumeKg > 0 ? custoTotal / row.volumeKg : 0,
      };
    })
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export interface PVMSkuDetail {
  sku: string;
  skuDesc?: string;
  status: "both" | "only_base" | "only_comp";
  volA: number;
  volB: number;
  rolA: number;
  rolB: number;
  cogsA: number;
  cogsB: number;
  freteA: number;
  freteB: number;
  comissaoA: number;
  comissaoB: number;
  margemA: number;
  margemB: number;
  // Effects attributable to this SKU
  volumeEffect: number;
  priceEffect: number;
  costEffect: number;
  freightEffect: number;
  commissionEffect: number;
  othersEffect: number; // for orphan SKUs, full margin impact
}

export interface PVMResult {
  base: number;
  volume: number;
  price: number;
  cost: number;       // Custo variável (CPV)
  freight: number;    // Frete sobre vendas
  commission: number; // Comissão
  others: number;     // Mix + outros (resíduo)
  current: number;
  baseLabel: string;
  currentLabel: string;
  skuDetails: PVMSkuDetail[];
}

/**
 * Detailed PVM bridge between two periods (FY or month).
 * Decomposes CM/MB variation into:
 *   Volume · Preço · Custo Variável · Frete · Comissão · Outros (mix + resíduo)
 *
 * Per-SKU effects use comp-period volumes for unit deltas; volume effect uses
 * base CM unit margin × Δvolume (classic PVM approach).
 *
 * `mode`: "fy" compares by `r.fy`, "month" compares by `r.periodo`.
 */
export function calcPVM(
  rows: PricingRow[],
  metric: Metric,
  base: string,
  comp: string,
  mode: "fy" | "month" = "fy",
  labels?: { base?: string; comp?: string },
): PVMResult {
  const keyOf = (r: PricingRow) => (mode === "fy" ? r.fy : r.periodo);
  const baseRows = rows.filter((r) => keyOf(r) === base);
  const compRows = rows.filter((r) => keyOf(r) === comp);

  interface Agg {
    vol: number;
    rol: number;
    cogs: number;
    frete: number;
    comissao: number;
    margem: number;
  }

  const aggSku = (rs: PricingRow[]) => {
    const m = new Map<string, Agg>();
    for (const r of rs) {
      const k = r.sku || r.skuDesc || "—";
      const c = m.get(k) ?? { vol: 0, rol: 0, cogs: 0, frete: 0, comissao: 0, margem: 0 };
      c.vol += r.volumeKg;
      c.rol += r.rol;
      c.cogs += r.cogs;
      c.frete += r.frete ?? 0;
      c.comissao += r.comissao ?? 0;
      c.margem += measureOf(r, metric);
      m.set(k, c);
    }
    return m;
  };

  const a = aggSku(baseRows);
  const b = aggSku(compRows);

  // Map of sku key → human-readable description (prefer comp period, fallback to base)
  const descMap = new Map<string, string>();
  for (const r of [...baseRows, ...compRows]) {
    const k = r.sku || r.skuDesc || "—";
    if (!descMap.has(k) && r.skuDesc) descMap.set(k, r.skuDesc);
  }

  let baseTotal = 0, currentTotal = 0;
  for (const v of a.values()) { baseTotal += v.margem; }
  for (const v of b.values()) { currentTotal += v.margem; }

  let volEffect = 0;
  let priceEffect = 0;
  let costEffect = 0;
  let freightEffect = 0;
  let commissionEffect = 0;

  const skuDetails: PVMSkuDetail[] = [];
  const allSkus = new Set([...a.keys(), ...b.keys()]);
  for (const sku of allSkus) {
    const ra = a.get(sku);
    const rb = b.get(sku);

    const detail: PVMSkuDetail = {
      sku,
      skuDesc: descMap.get(sku),
      status: ra && rb ? "both" : ra ? "only_base" : "only_comp",
      volA: ra?.vol ?? 0,
      volB: rb?.vol ?? 0,
      rolA: ra?.rol ?? 0,
      rolB: rb?.rol ?? 0,
      cogsA: ra?.cogs ?? 0,
      cogsB: rb?.cogs ?? 0,
      freteA: ra?.frete ?? 0,
      freteB: rb?.frete ?? 0,
      comissaoA: ra?.comissao ?? 0,
      comissaoB: rb?.comissao ?? 0,
      margemA: ra?.margem ?? 0,
      margemB: rb?.margem ?? 0,
      volumeEffect: 0,
      priceEffect: 0,
      costEffect: 0,
      freightEffect: 0,
      commissionEffect: 0,
      othersEffect: 0,
    };

    // SKUs órfãos (só A ou só B) → impacto total cai em Mix/Outros (resíduo).
    if (!ra || !rb || ra.vol === 0 || rb.vol === 0) {
      detail.othersEffect = (rb?.margem ?? 0) - (ra?.margem ?? 0);
      skuDetails.push(detail);
      continue;
    }

    // Efeito Volume no nível do SKU: ΔV × margem unitária base daquele SKU
    const margemUnitA = ra.margem / ra.vol;
    const skuVol = (rb.vol - ra.vol) * margemUnitA;

    // Paasche: efeitos unitários valorizados pelo VOLUME ATUAL (B)
    const priceA = ra.rol / ra.vol;
    const priceB = rb.rol / rb.vol;
    const costA = ra.cogs / ra.vol;
    const costB = rb.cogs / rb.vol;
    const freightA = ra.frete / ra.vol;
    const freightB = rb.frete / rb.vol;
    const commA = ra.comissao / ra.vol;
    const commB = rb.comissao / rb.vol;

    const skuPrice = (priceB - priceA) * rb.vol;
    const skuCost = -(costB - costA) * rb.vol;
    const skuFreight = -(freightB - freightA) * rb.vol;
    const skuComm = -(commB - commA) * rb.vol;

    detail.volumeEffect = skuVol;
    detail.priceEffect = skuPrice;
    detail.costEffect = skuCost;
    detail.freightEffect = skuFreight;
    detail.commissionEffect = skuComm;
    // residual per-SKU (mix puro): ΔMargem - soma dos efeitos calculados
    detail.othersEffect =
      (rb.margem - ra.margem) - skuVol - skuPrice - skuCost - skuFreight - skuComm;

    volEffect += skuVol;
    priceEffect += skuPrice;
    costEffect += skuCost;
    freightEffect += skuFreight;
    commissionEffect += skuComm;

    skuDetails.push(detail);
  }

  const others =
    currentTotal - baseTotal - volEffect - priceEffect - costEffect - freightEffect - commissionEffect;

  return {
    base: baseTotal,
    volume: volEffect,
    price: priceEffect,
    cost: costEffect,
    freight: freightEffect,
    commission: commissionEffect,
    others,
    current: currentTotal,
    baseLabel: labels?.base ?? base,
    currentLabel: labels?.comp ?? comp,
    skuDetails,
  };
}

export function uniqueValues<K extends keyof PricingRow>(rows: PricingRow[], key: K): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return Array.from(set).sort();
}
