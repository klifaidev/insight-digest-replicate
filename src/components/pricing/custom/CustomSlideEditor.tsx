// CustomSlideEditor — canvas WYSIWYG para o slide "Personalizado".
// Drag + resize via react-rnd. Snap-to-grid de 10px com guias de alinhamento
// dinâmicas. Atalhos de teclado, registro do canvas para o exporter, menu
// de templates built-in / do usuário.

import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown, ArrowUp, Copy as CopyIcon, GitBranch, Image as ImageIcon,
  Layers as LayersIcon, Plus, Square, Table as TableIcon,
  Trash2, Type as TypeIcon, AlignLeft, ZoomIn, ZoomOut, Maximize2,
  BarChart3, Trophy, BookOpen, Save, X, ChevronDown,
  LineChart as LineChartIcon, BarChart as BarIcon, BarChartHorizontal,
  AreaChart as AreaIcon, PieChart as PieIcon, CircleDot,
  ScatterChart as ScatterIcon, Circle, Filter as FunnelIcon,
  Combine, Network, Radar as RadarIcon, Box as BoxIcon,
  BarChart2, Hash,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

import {
  CANVAS_W, CANVAS_H, FOOTER_H,
  newBlock, newChartBlock, BLOCK_LABELS, KPI_MEASURES,
  BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
  type CustomBlock, type CustomBlockKind, type CustomChartType, type CustomSlideConfig,
  type KpiBlock, type ChartBlock, type TopSkuBlock,
} from "@/lib/customSlide";
import { BlockRenderer, CUSTOM_TABLE_MEASURES, CUSTOM_TABLE_DIMS } from "./BlockRenderer";
import { useMonthsInfo, useFyList } from "@/store/selectors";
import { cn } from "@/lib/utils";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { registerCustomCanvas } from "@/lib/customCanvasRegistry";
import {
  BUILTIN_TEMPLATES, applyTemplate, loadUserTemplates,
  saveUserTemplate, deleteUserTemplate, type CustomTemplate,
} from "@/lib/customTemplates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveTableFit, type FitInfo } from "@/lib/customCapacity";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { computePivot, type PivotConfig } from "@/lib/pivot";
import { buildUnifiedRows } from "@/lib/pivotData";
import type { Filters } from "@/lib/types";
import { BlockFilters } from "./BlockFilters";

type Icon = React.ComponentType<{ className?: string }>;

// Group 1 — Charts (and chart-like data viz: KPI Card + Table + Bridge)
const CHART_PALETTE: ({ id: string; label: string; icon: Icon } & (
  | { kind: "chart"; chartType: CustomChartType }
  | { kind: Exclude<CustomBlockKind, "chart"> }
))[] = [
  { id: "line",          kind: "chart", chartType: "line",          label: "Linha",            icon: LineChartIcon },
  { id: "column",        kind: "chart", chartType: "column",        label: "Coluna",           icon: BarChart3 },
  { id: "stackedColumn", kind: "chart", chartType: "stackedColumn", label: "Coluna Empilhada", icon: BarChart3 },
  { id: "hbar",          kind: "chart", chartType: "hbar",          label: "Barra",            icon: BarChartHorizontal },
  { id: "stackedBar",    kind: "chart", chartType: "stackedBar",    label: "Barra Empilhada",  icon: BarChartHorizontal },
  { id: "area",          kind: "chart", chartType: "area",          label: "Área",             icon: AreaIcon },
  { id: "stackedArea",   kind: "chart", chartType: "stackedArea",   label: "Área Empilhada",   icon: AreaIcon },
  { id: "pie",           kind: "chart", chartType: "pie",           label: "Pizza",            icon: PieIcon },
  { id: "donut",         kind: "chart", chartType: "donut",         label: "Rosca",            icon: CircleDot },
  { id: "scatter",       kind: "chart", chartType: "scatter",       label: "Dispersão",        icon: ScatterIcon },
  { id: "bubble",        kind: "chart", chartType: "bubble",        label: "Bolha",            icon: Circle },
  { id: "funnel",        kind: "chart", chartType: "funnel",        label: "Funil",            icon: FunnelIcon },
  { id: "combo",         kind: "chart", chartType: "combo",         label: "Combinado",        icon: Combine },
  { id: "treemap",       kind: "chart", chartType: "treemap",       label: "Mapa de Árvore",   icon: Network },
  { id: "radar",         kind: "chart", chartType: "radar",         label: "Radar",            icon: RadarIcon },
  { id: "boxplot",       kind: "chart", chartType: "boxplot",       label: "Caixa",            icon: BoxIcon },
  { id: "histogram",     kind: "chart", chartType: "histogram",     label: "Histograma",       icon: BarChart2 },
  { id: "waterfall",     kind: "chart", chartType: "waterfall",     label: "Bridge",           icon: GitBranch },
  { id: "table",         kind: "table", label: "Tabela",                                       icon: TableIcon },
  { id: "kpi",           kind: "kpi",   label: "KPI Card",                                     icon: Hash },
];

// Group 2 — Visual elements
const ELEMENT_PALETTE: { id: string; kind: CustomBlockKind; label: string; icon: Icon }[] = [
  { id: "title",  kind: "title",  label: "Título",      icon: TypeIcon },
  { id: "text",   kind: "text",   label: "Texto",       icon: AlignLeft },
  { id: "image",  kind: "image",  label: "Imagem",      icon: ImageIcon },
  { id: "shape",  kind: "shape",  label: "Forma",       icon: Square },
  { id: "topSku", kind: "topSku", label: "Top Ranking", icon: Trophy },
];

interface Props {
  /** ID estável do slide — usado para registrar o canvas no exporter */
  slideId?: string;
  config: CustomSlideConfig;
  onChange: (next: CustomSlideConfig) => void;
}

export function CustomSlideEditor({ slideId, config, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [manualScale, setManualScale] = useState(1);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Calcula a escala para caber no contêiner mantendo a proporção 16:9
  useEffect(() => {
    function compute() {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const availW = Math.max(rect.width - 24, 100);
      const availH = Math.max(rect.height - 24, 100);
      const s = Math.min(availW / CANVAS_W, availH / CANVAS_H);
      setFitScale(s > 0 ? s : 0.1);
    }
    compute();
    const ro = new ResizeObserver(compute);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Registra o canvas para o exporter capturar
  useEffect(() => {
    if (!slideId) return;
    registerCustomCanvas(slideId, canvasRef.current);
    return () => registerCustomCanvas(slideId, null);
  }, [slideId]);

  const scale = zoomMode === "fit" ? fitScale : manualScale;
  const setZoom = (s: number) => {
    setZoomMode("manual");
    setManualScale(Math.max(0.1, Math.min(3, s)));
  };

  const selected = config.blocks.find((b) => b.id === selectedId) ?? null;
  const zTop = config.blocks.reduce((m, b) => Math.max(m, b.z), 0);

  const update = (next: CustomBlock[]) => onChange({ ...config, blocks: next });
  const updateBlock = (id: string, patch: Partial<CustomBlock>) =>
    update(config.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as CustomBlock) : b)));
  const addBlock = (kind: CustomBlockKind) => {
    const blk = newBlock(kind, zTop);
    update([...config.blocks, blk]);
    setSelectedId(blk.id);
  };
  const addChart = (chartType: CustomChartType) => {
    const blk = newChartBlock(chartType, zTop);
    update([...config.blocks, blk]);
    setSelectedId(blk.id);
  };
  const removeBlock = (id: string) => {
    update(config.blocks.filter((b) => b.id !== id));
    setSelectedId(null);
  };
  const duplicateBlock = (id: string) => {
    const orig = config.blocks.find((b) => b.id === id);
    if (!orig) return;
    const clone = { ...JSON.parse(JSON.stringify(orig)), id: crypto.randomUUID(),
      x: orig.x + 20, y: orig.y + 20, z: zTop + 1 } as CustomBlock;
    update([...config.blocks, clone]);
    setSelectedId(clone.id);
  };
  const bringForward = (id: string) =>
    updateBlock(id, { z: zTop + 1 } as Partial<CustomBlock>);
  const sendBack = (id: string) => {
    const minZ = config.blocks.reduce((m, b) => Math.min(m, b.z), 0);
    updateBlock(id, { z: minZ - 1 } as Partial<CustomBlock>);
  };

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!selectedId) return;
      const cur = config.blocks.find((b) => b.id === selectedId);
      if (!cur) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeBlock(selectedId); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateBlock(selectedId); return; }
      if (e.key === "Escape") { setSelectedId(null); return; }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowUp")    { e.preventDefault(); updateBlock(selectedId, { y: Math.max(0, cur.y - step) }); }
      if (e.key === "ArrowDown")  { e.preventDefault(); updateBlock(selectedId, { y: Math.min(CANVAS_H - cur.h, cur.y + step) }); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); updateBlock(selectedId, { x: Math.max(0, cur.x - step) }); }
      if (e.key === "ArrowRight") { e.preventDefault(); updateBlock(selectedId, { x: Math.min(CANVAS_W - cur.w, cur.x + step) }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, config.blocks]);

  // Snap guides — calcula linhas vermelhas quando alinhamento ≤ 6px
  function computeGuides(activeId: string, x: number, y: number, w: number, h: number) {
    const others = config.blocks.filter((b) => b.id !== activeId);
    const TH = 6;
    const v: number[] = [], hh: number[] = [];
    const candidatesX = [0, CANVAS_W / 2, CANVAS_W];
    const candidatesY = [0, CANVAS_H / 2, CANVAS_H];
    others.forEach((b) => {
      candidatesX.push(b.x, b.x + b.w / 2, b.x + b.w);
      candidatesY.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    const checks = [x, x + w / 2, x + w];
    const checksY = [y, y + h / 2, y + h];
    for (const cx of candidatesX) for (const c of checks) if (Math.abs(cx - c) <= TH) v.push(cx);
    for (const cy of candidatesY) for (const c of checksY) if (Math.abs(cy - c) <= TH) hh.push(cy);
    setGuides({ v: Array.from(new Set(v)), h: Array.from(new Set(hh)) });
  }

  // Templates
  const [tplOpen, setTplOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [userTpls, setUserTpls] = useState<CustomTemplate[]>(() => loadUserTemplates());
  const refreshUserTpls = () => setUserTpls(loadUserTemplates());

  return (
    <div className="grid h-full min-h-0 grid-cols-[180px_minmax(0,1fr)_300px] gap-3">
      {/* ====== Paleta ====== */}
      <ScrollArea className="rounded-lg border border-border/40 bg-card/40">
        <div className="flex flex-col gap-1 p-2">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Modelos
          </div>
          <Button size="sm" variant="outline" className="h-7 justify-start gap-2 text-xs"
            onClick={() => setTplOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Aplicar modelo
          </Button>
          <Button size="sm" variant="ghost" className="h-7 justify-start gap-2 text-xs"
            onClick={() => setSaveTplOpen(true)}
            disabled={config.blocks.length === 0}>
            <Save className="h-3.5 w-3.5" /> Salvar como modelo
          </Button>
          <Separator className="my-2" />

          <PaletteGroup title="Gráficos" defaultOpen>
            {CHART_PALETTE.map((it) => (
              <PaletteButton
                key={it.id}
                icon={it.icon}
                label={it.label}
                onClick={() => it.kind === "chart" ? addChart(it.chartType) : addBlock(it.kind)}
              />
            ))}
          </PaletteGroup>

          <Separator className="my-2" />

          <PaletteGroup title="Elementos" defaultOpen>
            {ELEMENT_PALETTE.map((it) => (
              <PaletteButton
                key={it.id}
                icon={it.icon}
                label={it.label}
                onClick={() => addBlock(it.kind)}
              />
            ))}
          </PaletteGroup>

          <Separator className="my-2" />
          <div className="flex items-center justify-between px-2 text-[11px]">
            <span className="text-muted-foreground">Faixa Harald</span>
            <Switch
              checked={config.showHaraldFooter}
              onCheckedChange={(v) => onChange({ ...config, showHaraldFooter: v })}
            />
          </div>
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-muted-foreground">
            Atalhos: <kbd>Del</kbd> excluir · <kbd>⌘D</kbd> duplicar · <kbd>setas</kbd> mover (Shift = 10px)
          </p>
        </div>
      </ScrollArea>

      {/* ====== Canvas ====== */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <div
          ref={wrapperRef}
          className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border/40 bg-secondary/20"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="relative"
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              margin: "12px auto",
            }}
          >
            {/* Wrapper escala visualmente o canvas. O canvas em si NÃO recebe
                transform — assim o export captura o DOM em 1:1 sem distorção. */}
            <div
              style={{
                position: "absolute", top: 0, left: 0,
                width: CANVAS_W, height: CANVAS_H,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                boxShadow: "0 10px 40px hsl(0 0% 0% / 0.25)",
              }}
            >
            <div
              ref={canvasRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                background: `#${config.background}`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {[...config.blocks].sort((a, b) => a.z - b.z).map((blk) => (
                <Rnd
                  key={blk.id}
                  size={{ width: blk.w, height: blk.h }}
                  position={{ x: blk.x, y: blk.y }}
                  bounds="parent"
                  dragGrid={[5, 5]}
                  resizeGrid={[5, 5]}
                  scale={scale}
                  onDrag={(_, d) => computeGuides(blk.id, d.x, d.y, blk.w, blk.h)}
                  onResize={(_, __, refEl, ___, pos) =>
                    computeGuides(blk.id, pos.x, pos.y, parseInt(refEl.style.width, 10), parseInt(refEl.style.height, 10))
                  }
                  onDragStop={(_, d) => { setGuides({ v: [], h: [] }); updateBlock(blk.id, { x: d.x, y: d.y }); }}
                  onResizeStop={(_, __, refEl, ___, pos) => {
                    setGuides({ v: [], h: [] });
                    updateBlock(blk.id, {
                      w: parseInt(refEl.style.width, 10),
                      h: parseInt(refEl.style.height, 10),
                      x: pos.x, y: pos.y,
                    });
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedId(blk.id); }}
                  style={{ zIndex: blk.z }}
                  className={cn(
                    "group/block",
                    selectedId === blk.id
                      ? "outline outline-2 outline-offset-1 outline-primary"
                      : "outline outline-1 outline-transparent hover:outline-primary/40",
                  )}
                >
                  <div data-block-id={blk.id} data-block-kind={blk.kind} style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
                    <BlockRenderer block={blk} />
                  </div>
                  <DataSourceBadge block={blk} />
                </Rnd>
              ))}

              {/* Snap guides overlay */}
              {guides.v.map((x, i) => (
                <div key={`gv-${i}`} style={{
                  position: "absolute", left: x, top: 0, width: 1, height: CANVAS_H,
                  background: "#C8102E", pointerEvents: "none", zIndex: 999998,
                }} />
              ))}
              {guides.h.map((y, i) => (
                <div key={`gh-${i}`} style={{
                  position: "absolute", top: y, left: 0, height: 1, width: CANVAS_W,
                  background: "#C8102E", pointerEvents: "none", zIndex: 999998,
                }} />
              ))}

              {/* Faixa Harald (não editável, sempre por cima) */}
              {config.showHaraldFooter && (
                <img
                  src={haraldFooterPng}
                  alt=""
                  style={{
                    position: "absolute", left: 0, bottom: 0,
                    width: CANVAS_W, height: FOOTER_H,
                    pointerEvents: "none", zIndex: 99999,
                  }}
                />
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Barra de zoom */}
        <div className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => setZoom(scale - 0.1)} title="Diminuir zoom">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range" min={10} max={300} step={5}
            value={Math.round(scale * 100)}
            onChange={(e) => setZoom(parseInt(e.target.value, 10) / 100)}
            className="h-1 w-40 cursor-pointer accent-primary"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => setZoom(scale + 0.1)} title="Aumentar zoom">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <button
            className="ml-1 min-w-[48px] rounded px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground hover:bg-secondary"
            onClick={() => { setZoomMode("manual"); setManualScale(1); }}
            title="100%"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setZoomMode("fit")} title="Ajustar à tela">
            <Maximize2 className="h-3 w-3" /> Ajustar
          </Button>
          <Badge variant="secondary" className="ml-2 text-[9px] uppercase">16:9</Badge>
        </div>
      </div>

      {/* ====== Inspector ====== */}
      <ScrollArea className="rounded-lg border border-border/40 bg-card/40">
        <div className="space-y-3 p-3">
          {!selected ? (
            <div className="space-y-2 px-1 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">Slide personalizado</p>
              <p>Adicione blocos pela paleta à esquerda. Clique em um bloco para editar suas propriedades aqui.</p>
              <p>Arraste pelas bordas para mover, use os cantos para redimensionar. Linhas vermelhas mostram alinhamento com outros blocos.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px]">{BLOCK_LABELS[selected.kind]}</Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => bringForward(selected.id)} title="Trazer pra frente">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => sendBack(selected.id)} title="Enviar pra trás">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateBlock(selected.id)} title="Duplicar">
                    <CopyIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => removeBlock(selected.id)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <PositionInputs block={selected} onChange={(p) => updateBlock(selected.id, p)} />
              <Separator />
              <BlockSpecificEditor block={selected} onChange={(p) => updateBlock(selected.id, p)} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Templates dialog */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Aplicar modelo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {[...BUILTIN_TEMPLATES, ...userTpls].map((t) => (
              <div key={t.id} className="group relative rounded-lg border border-border/40 bg-card/60 p-3 hover:border-primary/60">
                <button className="block w-full text-left"
                  onClick={() => { onChange(applyTemplate(t)); setTplOpen(false); toast.success(`Modelo "${t.name}" aplicado`); }}>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.description ?? `${t.config.blocks.length} blocos`}</div>
                  {t.builtin && <Badge variant="secondary" className="mt-2 text-[9px]">Built-in</Badge>}
                </button>
                {!t.builtin && (
                  <Button size="icon" variant="ghost"
                    className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteUserTemplate(t.id); refreshUserTpls(); toast.success("Modelo removido"); }}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salvar modelo</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)}
              placeholder="Ex.: Resumo mensal" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTplOpen(false)}>Cancelar</Button>
            <Button disabled={!tplName.trim()}
              onClick={() => {
                saveUserTemplate(tplName.trim(), config);
                refreshUserTpls();
                setSaveTplOpen(false);
                setTplName("");
                toast.success("Modelo salvo");
              }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PositionInputs({ block, onChange }: {
  block: CustomBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {(["x", "y", "w", "h"] as const).map((k) => (
        <div key={k}>
          <Label className="text-[9px] uppercase text-muted-foreground">{k}</Label>
          <Input
            type="number"
            className="h-7 px-1.5 text-[11px]"
            value={block[k]}
            onChange={(e) => onChange({ [k]: parseInt(e.target.value, 10) || 0 } as never)}
          />
        </div>
      ))}
    </div>
  );
}

function BlockSpecificEditor({ block, onChange }: {
  block: CustomBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  switch (block.kind) {
    case "title":
    case "text": {
      const isTitle = block.kind === "title";
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Conteúdo</Label>
            <Textarea
              rows={isTitle ? 2 : 4}
              value={block.text}
              onChange={(e) => onChange({ text: e.target.value } as never)}
              className="text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Tamanho</Label>
              <Input type="number" className="h-7 text-xs"
                value={block.size}
                onChange={(e) => onChange({ size: parseInt(e.target.value, 10) || 14 } as never)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Cor (hex)</Label>
              <Input className="h-7 text-xs" value={block.color}
                onChange={(e) => onChange({ color: e.target.value.replace("#", "") } as never)}
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Alinhamento</Label>
            <Select value={block.align}
              onValueChange={(v) => onChange({ align: v as "left"|"center"|"right" } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isTitle && (
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase text-muted-foreground">Negrito</Label>
              <Switch checked={(block as { bold: boolean }).bold}
                onCheckedChange={(v) => onChange({ bold: v } as never)} />
            </div>
          )}
        </div>
      );
    }

    case "kpi":
      return <FilteredInspector
        block={block}
        design={<KpiInspector block={block} onChange={onChange} />}
        filters={block.filters ?? {}}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "image":
      return (
        <div className="space-y-2">
          <Label className="text-[10px] uppercase text-muted-foreground">Upload</Label>
          <input type="file" accept="image/*"
            className="text-[11px]"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => onChange({ src: String(reader.result) } as never);
              reader.readAsDataURL(f);
            }}
          />
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Ajuste</Label>
            <Select value={block.fit} onValueChange={(v) => onChange({ fit: v as "contain"|"cover" } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Conter</SelectItem>
                <SelectItem value="cover">Cobrir</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "shape":
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Forma</Label>
            <Select value={block.shape} onValueChange={(v) => onChange({ shape: v as "rect"|"line" } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rect">Retângulo</SelectItem>
                <SelectItem value="line">Linha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cor (hex)" value={block.fill}
              onChange={(v) => onChange({ fill: v.replace("#", "") } as never)} />
            <NumField label="Raio" value={block.radius}
              onChange={(v) => onChange({ radius: v } as never)} />
          </div>
        </div>
      );

    case "bridge":
      return <FilteredInspector
        block={block}
        design={<BridgeBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "table":
      return <FilteredInspector
        block={block}
        design={<TableBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "chart":
      return <FilteredInspector
        block={block}
        design={<ChartBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "topSku":
      return <FilteredInspector
        block={block}
        design={<TopSkuBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;
  }
}

// Wrapper com abas Design / Filtros — dá aos blocos de dados a UX
// próxima do PowerPoint (painel de formatação à direita).
// Inclui o seletor de Fonte de Dados PINADO no topo (não-colapsável).
function FilteredInspector({
  block, design, filters, onFiltersChange, onChange,
}: {
  block: CustomBlock;
  design: React.ReactNode;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const ds = (block as { dataSource?: "ke30" | "budget" }).dataSource ?? "ke30";
  const [pendingSource, setPendingSource] = useState<"ke30" | "budget" | null>(null);

  // Bridge não tem fonte selecionável (sempre KE30 — usa cálculo PVM).
  const showPicker = block.kind !== "bridge";

  const applySwitch = (next: "ke30" | "budget") => {
    if (next === ds) return;
    setPendingSource(next);
  };

  const confirmSwitch = () => {
    if (!pendingSource) return;
    // Reset filtros + medida quando a fonte muda — campos podem não existir.
    const patch: Partial<CustomBlock> = {
      dataSource: pendingSource,
      filters: {},
    } as never;
    if (block.kind === "kpi" && pendingSource === "budget") {
      // mb/mbPct/frete/comissao não existem no Budget
      const m = (block as KpiBlock).measure;
      if (m === "mb" || m === "mbPct" || m === "frete" || m === "comissao") {
        (patch as Partial<KpiBlock>).measure = "rol";
      }
    }
    if (block.kind === "chart" && pendingSource === "budget") {
      const m = (block as ChartBlock).measure;
      if (m === "mb" || m === "mbPct" || m === "frete" || m === "comissao") {
        (patch as Partial<ChartBlock>).measure = "rol";
      }
    }
    if (block.kind === "topSku" && pendingSource === "budget") {
      const m = (block as TopSkuBlock).measure;
      if (m === "mb" || m === "mbPct" || m === "frete" || m === "comissao") {
        (patch as Partial<TopSkuBlock>).measure = "rol";
      }
    }
    onChange(patch);
    setPendingSource(null);
  };

  return (
    <div className="space-y-2">
      {showPicker && (
        <div className="rounded-md border border-border/60 bg-secondary/30 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
              Fonte de Dados
            </Label>
            <Badge
              variant="secondary"
              className={cn(
                "text-[9px]",
                ds === "ke30"
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                  : "bg-purple-500/15 text-purple-600 dark:text-purple-300",
              )}
            >
              {ds === "ke30" ? "KE30" : "Budget"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => applySwitch("ke30")}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                ds === "ke30"
                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-200"
                  : "bg-card hover:bg-secondary text-muted-foreground",
              )}
            >KE30</button>
            <button
              type="button"
              onClick={() => applySwitch("budget")}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                ds === "budget"
                  ? "bg-purple-500/20 text-purple-700 dark:text-purple-200"
                  : "bg-card hover:bg-secondary text-muted-foreground",
              )}
            >Budget</button>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
            {ds === "ke30"
              ? "Detalhada (KE30): receita, custos, margens, frete, comissão."
              : "Agregada (Budget): receita, volume, CM, CPV. Sem MB/Frete/Comissão."}
          </p>
        </div>
      )}

      <Tabs defaultValue="design" className="w-full">
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="design" className="text-[11px]">Design</TabsTrigger>
          <TabsTrigger value="filters" className="text-[11px]">Filtros</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="mt-2 space-y-2">
          {design}
        </TabsContent>
        <TabsContent value="filters" className="mt-2">
          <BlockFilters filters={filters} onChange={onFiltersChange} dataSource={ds} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingSource} onOpenChange={(v) => !v && setPendingSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar fonte de dados?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Trocar a fonte de dados irá redefinir os filtros deste bloco
            (e a medida, se ela não existir na nova base). Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSource(null)}>Cancelar</Button>
            <Button onClick={confirmSwitch}>Trocar para {pendingSource === "budget" ? "Budget" : "KE30"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input className="h-7 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input type="number" className="h-7 text-xs" value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI inspector — Manual ou Dinâmico
// ---------------------------------------------------------------------------
function KpiInspector({ block, onChange }: {
  block: KpiBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodMode = block.periodMode ?? "all";
  const periodOpts = periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];

  return (
    <div className="space-y-2">
      <Field label="Rótulo" value={block.label}
        onChange={(v) => onChange({ label: v } as never)} />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Origem do valor</Label>
        <Select value={block.source}
          onValueChange={(v) => onChange({ source: v as "manual"|"dynamic" } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dynamic">Dinâmico (calcular da base)</SelectItem>
            <SelectItem value="manual">Manual (digitar valor)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {block.source === "manual" ? (
        <Field label="Valor" value={block.manualValue ?? ""}
          onChange={(v) => onChange({ manualValue: v } as never)} />
      ) : (
        <>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Medida</Label>
            <Select value={block.measure ?? "rol"}
              onValueChange={(v) => onChange({ measure: v as never } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KPI_MEASURES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Período</Label>
              <Select value={periodMode}
                onValueChange={(v) => onChange({ periodMode: v as never, periodValue: null } as never)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="fy">Ano fiscal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodMode !== "all" && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Valor</Label>
                <Select value={block.periodValue ?? ""}
                  onValueChange={(v) => onChange({ periodValue: v } as never)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
                  <SelectContent>
                    {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Formato</Label>
            <Select value={block.format ?? "auto"}
              onValueChange={(v) => onChange({ format: v as never } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="currency">Moeda (R$)</SelectItem>
                <SelectItem value="percent">Percentual</SelectItem>
                <SelectItem value="tons">Toneladas</SelectItem>
                <SelectItem value="number">Número</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Tamanho do valor" value={block.valueSize}
          onChange={(v) => onChange({ valueSize: v } as never)} />
        <Field label="Cor (hex)" value={block.color}
          onChange={(v) => onChange({ color: v.replace("#", "") } as never)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function BridgeBlockEditor({ block, onChange }: {
  block: Extract<CustomBlock, { kind: "bridge" }>;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.mode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Modo</Label>
        <Select value={block.mode}
          onValueChange={(v) => onChange({ mode: v as "fy"|"month", base: null, comp: null } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês a mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Base</Label>
          <Select value={block.base ?? ""} onValueChange={(v) => onChange({ base: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Comparação</Label>
          <Select value={block.comp ?? ""} onValueChange={(v) => onChange({ comp: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function TableBlockEditor({ block, onChange }: {
  block: Extract<CustomBlock, { kind: "table" }>;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const dims = CUSTOM_TABLE_DIMS;
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const totalRows = useMemo(() => {
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id));
    if (!measures.length) return 0;
    const unified = buildUnifiedRows(pricing, budget, "real");
    const cfg: PivotConfig = {
      rows: block.rowDims, cols: block.colDim ? [block.colDim] : [],
      values: measures,
      filters: Object.fromEntries(Object.entries(block.filters).map(([k, v]) => [k, new Set(v ?? [])])),
    };
    return computePivot(unified as unknown as Record<string, unknown>[], cfg).rowHeaders.length;
  }, [pricing, budget, block.rowDims, block.colDim, block.measures, block.filters]);
  const fit = resolveTableFit(block, totalRows);
  const toggleMeasure = (id: string) => {
    const next = block.measures.includes(id)
      ? block.measures.filter((m) => m !== id)
      : [...block.measures, id];
    onChange({ measures: next } as never);
  };
  const toggleRowDim = (id: string) => {
    const next = block.rowDims.includes(id)
      ? block.rowDims.filter((d) => d !== id)
      : [...block.rowDims, id];
    onChange({ rowDims: next } as never);
  };

  // Quando o usuário liga "Outros" e a tabela está truncada,
  // crescemos a altura para garantir que a linha apareça no canvas.
  const handleShowOthers = (v: boolean) => {
    const patch: Partial<typeof block> = { showOthers: v };
    if (v && fit.truncated) {
      const extraRows = 1; // linha "Outros"
      const ROW_H = 26;
      const needed = block.h + extraRows * ROW_H + 4;
      const maxH = CANVAS_H - block.y;
      patch.h = Math.min(maxH, needed);
    }
    onChange(patch as never);
  };

  return (
    <div className="space-y-3">
      <TruncationAlert blockId={block.id} fit={fit} unitPlural="linhas" />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Linhas (dimensões)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-full justify-start text-xs">
              {block.rowDims.length ? block.rowDims.map((d) => dims.find((x) => x.id === d)?.label).join(", ") : "Selecionar..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-64 overflow-auto p-2" align="start">
            {dims.map((d) => (
              <button key={d.id as string}
                onClick={() => toggleRowDim(d.id as string)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-secondary",
                  block.rowDims.includes(d.id as string) && "bg-primary/10 text-primary",
                )}
              >
                <span>{d.label}</span>
                <span className="text-[9px] text-muted-foreground">{d.group}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Coluna (opcional)</Label>
        <Select value={block.colDim ?? "__none__"}
          onValueChange={(v) => onChange({ colDim: v === "__none__" ? null : v } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Sem coluna —</SelectItem>
            {dims.map((d) => <SelectItem key={d.id as string} value={d.id as string}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Medidas</Label>
        <div className="space-y-1">
          {CUSTOM_TABLE_MEASURES.map((m) => (
            <button key={m.id}
              onClick={() => toggleMeasure(m.id)}
              className={cn(
                "flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-secondary",
                block.measures.includes(m.id) && "bg-primary/10 text-primary",
              )}
            >
              <span>{m.label}</span>
              {block.measures.includes(m.id) && <span className="text-[9px]">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {block.measures.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Ordenar por</Label>
          <Select value={block.sortMeasure ?? block.measures[0]}
            onValueChange={(v) => onChange({ sortMeasure: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id))
                .map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator />
      <div className="space-y-1.5">
        <ToggleRow label="Auto-ajustar ao tamanho"
          value={block.autoFit !== false}
          onChange={(v) => onChange({ autoFit: v } as never)} />
        {block.autoFit === false && (
          <NumField label="Máx. linhas" value={block.maxRows ?? fit.shown}
            onChange={(v) => onChange({ maxRows: v } as never)} />
        )}
        <ToggleRow label="Linha “Outros”" value={!!block.showOthers}
          onChange={handleShowOthers} />
        <ToggleRow label="Nota no slide exportado" value={!!block.exportNote}
          onChange={(v) => onChange({ exportNote: v } as never)} />
        <p className="text-[10px] text-muted-foreground">
          Mostrando {fit.shown} de {fit.total}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
import { ChartInspector } from "./chart/ChartInspector";
function ChartBlockEditor({ block, onChange }: {
  block: ChartBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  return <ChartInspector block={block} onChange={onChange as never} />;
}

function TopSkuBlockEditor({ block, onChange }: {
  block: TopSkuBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodOpts = block.periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : block.periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];
  return (
    <div className="space-y-2">
      <Field label="Título" value={block.title ?? ""}
        onChange={(v) => onChange({ title: v } as never)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Ranquear por</Label>
          <Select value={block.dim}
            onValueChange={(v) => onChange({ dim: v as never } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skuDesc">Descrição SKU</SelectItem>
              <SelectItem value="sku">SKU</SelectItem>
              <SelectItem value="cliente">Cliente</SelectItem>
              <SelectItem value="marca">Marca</SelectItem>
              <SelectItem value="categoria">Categoria</SelectItem>
              <SelectItem value="canalAjustado">Canal Ajustado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Medida</Label>
          <Select value={block.measure}
            onValueChange={(v) => onChange({ measure: v as never } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_MEASURES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Período</Label>
        <Select value={block.periodMode}
          onValueChange={(v) => onChange({ periodMode: v as never, periodValue: null } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {block.periodMode !== "all" && (
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Valor do período</Label>
          <Select value={block.periodValue ?? ""}
            onValueChange={(v) => onChange({ periodValue: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <NumField label="Top N" value={block.topN}
        onChange={(v) => onChange({ topN: Math.max(1, Math.min(50, v)) } as never)} />
      <ToggleRow label="Mostrar % do total" value={block.showShare}
        onChange={(v) => onChange({ showShare: v } as never)} />
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// (FitControls compartilhado removido — apenas tabela usa estes toggles agora,
// inlined em TableBlockEditor.)

// Alerta dismissível mostrado quando o conteúdo está sendo cortado.
// Reaparece quando capacidade muda (ex.: usuário redimensiona o bloco).
const dismissedTruncations = new Map<string, string>();
function TruncationAlert({ blockId, fit, unitPlural }: {
  blockId: string; fit: FitInfo; unitPlural: string;
}) {
  const key = `${fit.shown}/${fit.total}`;
  const [, force] = useState(0);
  if (!fit.truncated) return null;
  if (dismissedTruncations.get(blockId) === key) return null;
  return (
    <Alert className="relative border-amber-300 bg-amber-50 py-2 pr-7 dark:bg-amber-950/30">
      <Info className="h-3.5 w-3.5 text-amber-600" />
      <AlertDescription className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
        Mostrando {fit.shown} de {fit.total} {unitPlural} — aumente a altura do bloco para ver mais
        {" ou ative “Linha Outros” para agregar o restante."}
      </AlertDescription>
      <button
        onClick={() => { dismissedTruncations.set(blockId, key); force((n) => n + 1); }}
        className="absolute right-1 top-1 rounded p-0.5 hover:bg-amber-100"
        aria-label="Fechar"
      >
        <X className="h-3 w-3 text-amber-700" />
      </button>
    </Alert>
  );
}

function PaletteGroup({
  title, defaultOpen = true, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{title}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PaletteButton({
  icon: Icon, label, onClick,
}: { icon: Icon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-left hover:bg-secondary"
    >
      <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Badge "KE30" / "Budget" mostrado no canto superior-esquerdo de cada bloco
// de dados durante a edição. Marcado data-edit-only para o exporter remover.
function DataSourceBadge({ block }: { block: CustomBlock }) {
  const kinds: CustomBlockKind[] = ["chart", "kpi", "table", "topSku"];
  if (!kinds.includes(block.kind)) return null;
  const ds = (block as { dataSource?: "ke30" | "budget" }).dataSource ?? "ke30";
  const isKe30 = ds === "ke30";
  return (
    <div
      data-edit-only="true"
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        zIndex: 50,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: "#fff",
        background: isKe30 ? "rgba(37,99,235,0.92)" : "rgba(147,51,234,0.92)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }}
    >
      {isKe30 ? "KE30" : "Budget"}
    </div>
  );
}
