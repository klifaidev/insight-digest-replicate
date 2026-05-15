// CustomSlideEditor — canvas WYSIWYG para o slide "Personalizado".
// Drag + resize via react-rnd. Snap-to-grid de 10px com guias de alinhamento
// dinâmicas. Atalhos de teclado, registro do canvas para o exporter, menu
// de templates built-in / do usuário.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  Undo2, Redo2, Lock, Unlock, ChevronUp, ChevronsUp, ChevronsDown,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  AlignStartHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Group as GroupIcon, Ungroup as UngroupIcon, Grid3x3,
  Play, Paintbrush,
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
  type KpiBlock, type ChartBlock, type TopSkuBlock, type ShapeBlock,
  type TitleBlock, type TextBlock,
  isLineFamily,
} from "@/lib/customSlide";
import { ShapeHandleOverlay } from "./ShapeHandleOverlay";
import { BlockRenderer, CUSTOM_TABLE_MEASURES, CUSTOM_TABLE_DIMS } from "./BlockRenderer";
import { SlideFilterProvider, useSlideFilters, dimensionLabel } from "./SlideFilterContext";
import { useMonthsInfo, useFyList } from "@/store/selectors";
import { cn } from "@/lib/utils";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { registerCustomCanvas } from "@/lib/customCanvasRegistry";
import { saveUserTemplate } from "@/lib/customTemplates";
import { TemplatePicker } from "./templates/TemplatePicker";
import { ShapeInspector } from "./ShapeInspector";
import { useSlidesFlow } from "@/store/slidesFlow";
import { newId } from "@/lib/slidesFlow";
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
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useEditorBinding, useUndoRedoState,
  addBlockAction, addChartBlockAction, deleteBlockAction, duplicateBlockAction,
  patchBlockAction, bringForwardAction, sendBackAction, bringToFrontAction,
  sendToBackAction, toggleLockAction, undo as undoAction, redo as redoAction,
  setShowHaraldFooter as setShowHaraldFooterAction,
  setBackground as setBackgroundAction,
  setThemeAction,
  useSelection, selectBlock, setSelection, clearSelection,
  selectAllOnSlide, enterGroupEdit, exitGroupEdit,
  deleteBlocksAction, duplicateBlocksAction,
  patchBlocksAction, nudgeBlocksAction,
  alignBlocksAction, groupBlocksAction, ungroupBlocksAction,
  resizeGroupAction,
  copyChartStyleAction, pasteChartStyleAction, useCopiedStyle,
  type AlignKind,
} from "./editorStore";
import { useEditorPrefs, snapToGrid, type GridSize } from "./editorPrefs";
import { SLIDE_THEMES, getTheme, DEFAULT_THEME_ID, type SlideTheme } from "@/lib/slideThemes";
import { computeSnap, boundsOf, groupBounds } from "./canvas/alignmentGuides";
import { PresentationMode } from "./PresentationMode";
import { InlineTextEditor, InlineTextToolbar } from "./InlineTextEditor";
import { AssetLibrary } from "./AssetLibrary";
import { Pencil, Images } from "lucide-react";

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
  // Bind the parent's config <-> internal Zustand+temporal store first so
  // selection store reflects the right slide on initial render.
  useEditorBinding(config, onChange, slideId);
  const undoRedo = useUndoRedoState();
  const { selectedIds, groupEditMemberId } = useSelection();
  const prefs = useEditorPrefs();
  const copiedStyle = useCopiedStyle();
  const [presentOpen, setPresentOpen] = useState(false);

  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [manualScale, setManualScale] = useState(1);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Marquee selection rectangle (canvas-space coords).
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Inline text editing (double-click no bloco title/text).
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  // Limpa inline edit se o bloco for excluído ou ficar bloqueado.
  useEffect(() => {
    if (!inlineEditId) return;
    const blk = config.blocks.find((b) => b.id === inlineEditId);
    if (!blk || blk.locked || (blk.kind !== "title" && blk.kind !== "text")) {
      setInlineEditId(null);
    }
  }, [inlineEditId, config.blocks]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

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

  useEffect(() => {
    if (!slideId) return;
    registerCustomCanvas(slideId, canvasRef.current);
    return () => registerCustomCanvas(slideId, null);
  }, [slideId]);

  const scale = zoomMode === "fit" ? fitScale : manualScale;
  scaleRef.current = scale;
  const setZoom = (s: number) => {
    setZoomMode("manual");
    setManualScale(Math.max(0.1, Math.min(3, s)));
  };

  const selected = selectedIds.length === 1
    ? (config.blocks.find((b) => b.id === selectedIds[0]) ?? null)
    : null;
  const multiSelected = selectedIds.length > 1
    ? config.blocks.filter((b) => selectedIds.includes(b.id))
    : [];

  const updateBlock = (id: string, patch: Partial<CustomBlock>) => {
    const keys = Object.keys(patch);
    const isMove = keys.every((k) => k === "x" || k === "y");
    const isResize = keys.some((k) => k === "w" || k === "h");
    const isOrder = keys.length === 1 && keys[0] === "z";
    const isLock = keys.length === 1 && keys[0] === "locked";
    const label = isLock ? "Bloquear / Desbloquear"
      : isOrder ? "Alterar ordem"
      : isResize ? "Redimensionar bloco"
      : isMove ? "Mover bloco"
      : "Alterar dados";
    patchBlockAction(id, patch, label);
  };
  const addBlock = (kind: CustomBlockKind) => {
    const id = addBlockAction(kind);
    if (id) setSelection([id]);
  };
  const addChart = (chartType: CustomChartType) => {
    const id = addChartBlockAction(chartType);
    if (id) setSelection([id]);
  };
  const removeBlock = (id: string) => {
    deleteBlockAction(id);
    if (selectedIds.includes(id)) clearSelection();
  };
  const duplicateBlock = (id: string) => {
    const newId = duplicateBlockAction(id);
    if (newId) setSelection([newId]);
  };
  const bringForward = (id: string) => bringForwardAction(id);
  const sendBack = (id: string) => sendBackAction(id);
  const bringToFront = (id: string) => bringToFrontAction(id);
  const sendToBack = (id: string) => sendToBackAction(id);
  const toggleLock = (id: string) => toggleLockAction(id);

  // Helper: ids that move together when dragging `id`.
  // If id belongs to a group (and we're not in group-edit mode for it),
  // and the selection includes any group member, drag the whole group.
  const draggableSiblings = useCallback((id: string): string[] => {
    if (groupEditMemberId === id) return [id];
    const blk = config.blocks.find((b) => b.id === id);
    if (!blk) return [id];
    if (blk.groupId) {
      const grp = (config.groups ?? []).find((g) => g.id === blk.groupId);
      if (grp) return grp.memberIds;
    }
    // Multi-selection move: if id is in selection and selection > 1, move all selected.
    if (selectedIds.includes(id) && selectedIds.length > 1) return selectedIds;
    return [id];
  }, [config.blocks, config.groups, groupEditMemberId, selectedIds]);

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (!inField && (e.metaKey || e.ctrlKey)) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undoAction(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redoAction(); return; }
        if (k === "a") { e.preventDefault(); selectAllOnSlide(); return; }
        if (k === "g" && !e.shiftKey) {
          e.preventDefault();
          if (selectedIds.length >= 2) { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }
          return;
        }
        if (k === "g" && e.shiftKey) {
          e.preventDefault();
          if (selectedIds.length > 0) { ungroupBlocksAction(selectedIds); toast.success("Grupo desfeito"); }
          return;
        }
      }
      // F5 / Cmd+Shift+P → presentation mode (works even with no selection).
      if (!inField && (e.key === "F5" || ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p"))) {
        e.preventDefault();
        setPresentOpen(true);
        return;
      }
      if (inField) return;
      if (e.key === "Escape") {
        if (groupEditMemberId) exitGroupEdit();
        else clearSelection();
        return;
      }
      if (selectedIds.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.length === 1) removeBlock(selectedIds[0]);
        else deleteBlocksAction(selectedIds);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length === 1) duplicateBlock(selectedIds[0]);
        else duplicateBlocksAction(selectedIds);
        return;
      }
      if (selectedIds.length === 1) {
        if ((e.metaKey || e.ctrlKey) && e.key === "]") { e.preventDefault(); bringForward(selectedIds[0]); return; }
        if ((e.metaKey || e.ctrlKey) && e.key === "[") { e.preventDefault(); sendBack(selectedIds[0]); return; }
      }

      // Arrow nudge — works for single or multi.
      const step = e.shiftKey ? 40 : 4;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        nudgeBlocksAction(
          selectedIds,
          dx, dy,
          selectedIds.length > 1 ? "Mover blocos" : "Mover bloco",
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, groupEditMemberId, config.blocks]);

  // Smart guides — compute lines + snap target for the dragging block.
  // Snap is applied by react-rnd via onDrag's returned coords; we mutate
  // d.x / d.y directly which Rnd respects on next frame.
  const computeGuides = useCallback((activeIds: string[], x: number, y: number, w: number, h: number) => {
    const excl = new Set(activeIds);
    const others = boundsOf(config.blocks, excl);
    const snap = computeSnap({ x, y, w, h }, others);
    setGuides(snap.guides);
    return snap;
  }, [config.blocks]);

  // Templates
  const [tplOpen, setTplOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const refreshUserTpls = () => { /* picker reloads internally */ };

  return (
    <SlideFilterProvider slideKey={slideId}>
    <div className="grid h-full min-h-0 grid-cols-[180px_minmax(0,1fr)_380px] gap-3">
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
          <div className="px-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Tema do slide</Label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {SLIDE_THEMES.map((t) => {
                const active = (config.theme ?? DEFAULT_THEME_ID) === t.id
                  && config.background.toUpperCase() === t.background.toUpperCase();
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeAction(t.id, t.background)}
                    className={cn(
                      "flex items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[10px] transition",
                      active ? "border-primary ring-1 ring-primary" : "border-border/60 hover:border-border",
                    )}
                    title={t.name}
                  >
                    <span className="flex h-4 w-6 shrink-0 overflow-hidden rounded-sm border border-border/40">
                      <span className="flex-1" style={{ background: `#${t.background}` }} />
                      <span className="w-1.5" style={{ background: `#${t.primaryColor}` }} />
                    </span>
                    <span className="truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Separator className="my-2" />
          <div className="px-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Fundo do slide</Label>
            <BgField label="" value={config.background}
              onChange={(v) => setBackgroundAction(v)} />
          </div>
          <div className="mt-2 flex items-center justify-between px-2 text-[11px]">
            <span className="text-muted-foreground">Faixa Harald</span>
            <Switch
              checked={config.showHaraldFooter}
              onCheckedChange={(v) => setShowHaraldFooterAction(v)}
            />
          </div>
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-muted-foreground">
            Atalhos: <kbd>⌘Z</kbd> desfazer · <kbd>⌘⇧Z</kbd> refazer · <kbd>Del</kbd> excluir · <kbd>⌘D</kbd> duplicar · <kbd>⌘]</kbd>/<kbd>⌘[</kbd> ordem · <kbd>setas</kbd> mover (Shift = 10px)
          </p>
        </div>
      </ScrollArea>

      {/* ====== Canvas ====== */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <ClearFiltersToolbar />
        <div
          ref={wrapperRef}
          className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border/40 bg-secondary/20"
          onMouseDown={(e) => {
            // Marquee selection — only if mousedown is on the wrapper itself
            // (i.e. canvas background, not a block / Rnd handle / inspector).
            if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset?.canvasBg) return;
            const isChartElement = (el: Element | null): boolean => {
              while (el && el !== e.currentTarget) {
                if ((el as HTMLElement).dataset?.chartCanvas !== undefined) return true;
                el = el.parentElement;
              }
              return false;
            };
            if (isChartElement(e.target as Element)) return;
            // Begin marquee in canvas-space coords.
            const startCanvas = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
            if (!startCanvas) return;
            const startX = startCanvas.x;
            const startY = startCanvas.y;
            setMarquee({ x: startX, y: startY, w: 0, h: 0 });
            const move = (ev: MouseEvent) => {
              const cur = clientToCanvas(canvasRef.current, ev.clientX, ev.clientY, scaleRef.current);
              if (!cur) return;
              setMarquee({
                x: Math.min(startX, cur.x),
                y: Math.min(startY, cur.y),
                w: Math.abs(cur.x - startX),
                h: Math.abs(cur.y - startY),
              });
            };
            const up = (ev: MouseEvent) => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
              // If mouseup landed inside a chart, do not clear selection.
              let el = ev.target as Element | null;
              while (el) {
                if ((el as HTMLElement).dataset?.chartCanvas !== undefined) {
                  setMarquee(null);
                  return;
                }
                el = el.parentElement;
              }
              const end = clientToCanvas(canvasRef.current, ev.clientX, ev.clientY, scaleRef.current);
              setMarquee(null);
              if (!end) { clearSelection(); return; }
              const rect = {
                x: Math.min(startX, end.x), y: Math.min(startY, end.y),
                w: Math.abs(end.x - startX), h: Math.abs(end.y - startY),
              };
              if (rect.w < 4 && rect.h < 4) { clearSelection(); return; }
              const hitIds = config.blocks
                .filter((b) => b.x < rect.x + rect.w && b.x + b.w > rect.x
                            && b.y < rect.y + rect.h && b.y + b.h > rect.y)
                .map((b) => b.id);
              setSelection(hitIds);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <div
            className="relative"
            data-canvas-bg="true"
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              margin: "12px auto",
            }}
          >
            <div
              data-canvas-bg="true"
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
              data-canvas-bg="true"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                background: config.background === "transparent" ? "#FFFFFF" : `#${config.background}`,
                backgroundImage: config.backgroundImage ? `url(${config.backgroundImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                position: "relative",
                overflow: "hidden",
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-slide-asset")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                const src = e.dataTransfer.getData("application/x-slide-asset");
                if (!src) return;
                e.preventDefault();
                const pos = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
                const id = addBlockAction("image");
                if (id) {
                  const w = 360, h = 220;
                  const x = pos ? Math.max(0, pos.x - w / 2) : 60;
                  const y = pos ? Math.max(0, pos.y - h / 2) : 60;
                  patchBlockAction(id, { src, w, h, x, y } as Partial<CustomBlock>, "Alterar dados");
                  setSelection([id]);
                }
              }}
            >
              {/* Snap-to-grid background — dot pattern, behind blocks. */}
              {prefs.gridEnabled && (
                <svg
                  data-export-hide="true"
                  width={CANVAS_W} height={CANVAS_H}
                  style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
                >
                  <defs>
                    <pattern id="harald-grid-dots" x={0} y={0}
                      width={prefs.gridSize} height={prefs.gridSize}
                      patternUnits="userSpaceOnUse">
                      <circle cx={prefs.gridSize / 2} cy={prefs.gridSize / 2}
                        r={0.75} fill="rgba(0,0,0,0.12)" />
                    </pattern>
                  </defs>
                  <rect width={CANVAS_W} height={CANVAS_H} fill="url(#harald-grid-dots)" />
                </svg>
              )}

              {[...config.blocks].sort((a, b) => a.z - b.z).map((blk) => {
                const isSelected = selectedIds.includes(blk.id);
                const isInlineEditable =
                  (blk.kind === "title" || blk.kind === "text") && !blk.locked;
                const isEditing = inlineEditId === blk.id && isInlineEditable;
                // Shape-specific Rnd config — contextual handles override.
                let shapeResize: boolean | Record<string, boolean> = !blk.locked;
                let shapeDisableDrag = !!blk.locked;
                let shapeLockAspect = false;
                if (blk.kind === "shape" && !blk.locked) {
                  const sb = blk as ShapeBlock;
                  if (isLineFamily(sb.shape)) {
                    shapeResize = false;
                    shapeDisableDrag = true; // overlay owns move
                  } else if (sb.shape === "circle") {
                    shapeLockAspect = true;
                    shapeResize = { top: true, bottom: true, left: true, right: true,
                      topLeft: false, topRight: false, bottomLeft: false, bottomRight: false };
                  } else if (sb.shape === "ellipse") {
                    shapeResize = { top: true, bottom: true, left: true, right: true,
                      topLeft: false, topRight: false, bottomLeft: false, bottomRight: false };
                  } else if (sb.shape === "triangle" || sb.shape === "right-triangle") {
                    shapeResize = false; // overlay vertex handles only
                  }
                }
                if (isEditing) {
                  shapeResize = false;
                  shapeDisableDrag = true;
                }
                return (
                <ContextMenu key={blk.id}>
                  <ContextMenuTrigger asChild>
                    <Rnd
                      size={{ width: blk.w, height: blk.h }}
                      position={{ x: blk.x, y: blk.y }}
                      bounds="parent"
                      scale={scale}
                      lockAspectRatio={shapeLockAspect}
                      disableDragging={shapeDisableDrag}
                      enableResizing={shapeResize}
                      onDragStart={(_e, _d) => {
                        // If shift wasn't held and this block isn't already
                        // selected, select it before drag begins.
                        if (!selectedIds.includes(blk.id)) selectBlock(blk.id);
                      }}
                      onDrag={(_, d) => {
                        const ids = draggableSiblings(blk.id);
                        // Snap to alignment guides (with tolerance).
                        const snap = computeGuides(ids, d.x, d.y, blk.w, blk.h);
                        // If guide didn't fire (no v/h), fall back to grid snap during drag? No — grid snaps on stop only.
                        if (snap.guides.v.length || snap.guides.h.length) {
                          d.x = snap.x; d.y = snap.y;
                        }
                      }}
                      onResize={(_, __, refEl, ___, pos) => {
                        const w = parseInt(refEl.style.width, 10);
                        const h = parseInt(refEl.style.height, 10);
                        const snap = computeGuides([blk.id], pos.x, pos.y, w, h);
                        // For resize we just visualise guides; keep size raw.
                        void snap;
                      }}
                      onDragStop={(_, d) => {
                        setGuides({ v: [], h: [] });
                        const ids = draggableSiblings(blk.id);
                        let dx = d.x - blk.x;
                        let dy = d.y - blk.y;
                        // Snap to grid on mouseup (B8.4) — only if no guides fired.
                        if (prefs.gridEnabled) {
                          const sx = snapToGrid(d.x, prefs.gridSize);
                          const sy = snapToGrid(d.y, prefs.gridSize);
                          dx = sx - blk.x;
                          dy = sy - blk.y;
                        }
                        if (ids.length === 1) {
                          updateBlock(blk.id, { x: blk.x + dx, y: blk.y + dy });
                        } else {
                          const patches = ids
                            .map((id) => config.blocks.find((b) => b.id === id))
                            .filter((b): b is CustomBlock => !!b && !b.locked)
                            .map((b) => ({ id: b.id, patch: { x: b.x + dx, y: b.y + dy } as Partial<CustomBlock> }));
                          patchBlocksAction(patches, "Mover blocos");
                        }
                      }}
                      onResizeStop={(_, __, refEl, ___, pos) => {
                        setGuides({ v: [], h: [] });
                        let w = parseInt(refEl.style.width, 10);
                        let h = parseInt(refEl.style.height, 10);
                        let x = pos.x, y = pos.y;
                        if (prefs.gridEnabled) {
                          x = snapToGrid(x, prefs.gridSize);
                          y = snapToGrid(y, prefs.gridSize);
                          w = Math.max(prefs.gridSize, snapToGrid(w, prefs.gridSize));
                          h = Math.max(prefs.gridSize, snapToGrid(h, prefs.gridSize));
                        }
                        updateBlock(blk.id, { w, h, x, y });
                      }}
                      onMouseDown={(e) => {
                        if (isEditing) {
                          // Permite que o textarea receba o clique.
                          return;
                        }
                        e.stopPropagation();
                        const wasSelected = selectedIds.includes(blk.id);
                        const shift = (e as MouseEvent).shiftKey;
                        // Click on a single member of a group while group is
                        // already selected → keep group selected.
                        selectBlock(blk.id, { additive: shift });
                        // Sai de edição inline ao clicar em outro bloco.
                        if (inlineEditId && inlineEditId !== blk.id) {
                          setInlineEditId(null);
                        }
                        if (blk.locked && wasSelected && !shift && (e as MouseEvent).button === 0) {
                          toast("Bloco bloqueado. Clique com botão direito para desbloquear.", { duration: 1800 });
                        }
                      }}
                      onDoubleClick={(e) => {
                        if (isInlineEditable) {
                          e.stopPropagation();
                          setInlineEditId(blk.id);
                          selectBlock(blk.id);
                          return;
                        }
                        if (blk.groupId) {
                          e.stopPropagation();
                          enterGroupEdit(blk.id);
                        }
                      }}
                      style={{ zIndex: isEditing ? 9999998 : blk.z }}
                      className={cn(
                        "group/block",
                        isSelected
                          ? "outline outline-2 outline-offset-1 outline-primary"
                          : "outline outline-1 outline-transparent hover:outline-primary/40",
                      )}
                    >
                      <div data-block-id={blk.id} data-block-kind={blk.kind} style={{
                        width: "100%", height: "100%",
                        pointerEvents: blk.kind === "chart" ? "auto" : "none",
                      }}>
                        <BlockRenderer block={blk} />
                      </div>
                      {isEditing && (
                        <InlineTextEditor
                          block={blk as TitleBlock | TextBlock}
                          onPatch={(patch) =>
                            patchBlockAction(blk.id, patch, "Alterar estilo")
                          }
                          onExit={() => setInlineEditId(null)}
                        />
                      )}
                      {isInlineEditable && !isEditing && !blk.locked && (
                        <div
                          data-export-hide="true"
                          className="opacity-0 group-hover/block:opacity-100 transition-opacity"
                          style={{
                            position: "absolute", top: 4, right: 4,
                            width: 18, height: 18, borderRadius: 4,
                            background: "hsl(var(--background) / 0.9)",
                            border: "1px solid hsl(var(--border))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 999990, pointerEvents: "none",
                          }}
                          title="Duplo-clique para editar"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <DataSourceBadge block={blk} />
                      {blk.locked && (
                        <div
                          data-export-hide="true"
                          style={{
                            position: "absolute", top: 4, right: 4,
                            width: 18, height: 18, borderRadius: 4,
                            background: "hsl(var(--background) / 0.9)",
                            border: "1px solid hsl(var(--border))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 999990, pointerEvents: "none",
                          }}
                          title="Bloco bloqueado"
                        >
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </Rnd>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => duplicateBlock(blk.id)}>
                      Duplicar <ContextMenuShortcut>⌘D</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => removeBlock(blk.id)} className="text-destructive focus:text-destructive">
                      Excluir <ContextMenuShortcut>Del</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => bringForward(blk.id)}>
                      Trazer para frente <ContextMenuShortcut>⌘]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => bringToFront(blk.id)}>
                      Trazer para a frente de tudo
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => sendBack(blk.id)}>
                      Enviar para trás <ContextMenuShortcut>⌘[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => sendToBack(blk.id)}>
                      Enviar para o fundo
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => toggleLock(blk.id)}>
                      {blk.locked ? "Desbloquear posição" : "Bloquear posição"}
                    </ContextMenuItem>
                    {blk.kind === "chart" && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => {
                          if (copyChartStyleAction(blk.id)) toast.success("Estilo copiado");
                        }}>
                          Copiar estilo
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={!copiedStyle.hasCopy}
                          onSelect={() => {
                            if (pasteChartStyleAction(blk.id)) toast.success("Estilo colado");
                          }}>
                          Colar estilo
                        </ContextMenuItem>
                      </>
                    )}
                    {selectedIds.length >= 2 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }}>
                          Agrupar <ContextMenuShortcut>⌘G</ContextMenuShortcut>
                        </ContextMenuItem>
                      </>
                    )}
                    {blk.groupId && (
                      <ContextMenuItem onSelect={() => { ungroupBlocksAction([blk.id]); toast.success("Grupo desfeito"); }}>
                        Desagrupar <ContextMenuShortcut>⌘⇧G</ContextMenuShortcut>
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
                );
              })}

              {/* Inline text edit toolbar. */}
              {(() => {
                if (!inlineEditId) return null;
                const blk = config.blocks.find((b) => b.id === inlineEditId);
                if (!blk || (blk.kind !== "title" && blk.kind !== "text")) return null;
                return (
                  <InlineTextToolbar
                    block={blk as TitleBlock | TextBlock}
                    scale={scale}
                    onPatch={(patch) =>
                      patchBlockAction(blk.id, patch, "Alterar estilo")
                    }
                  />
                );
              })()}

              {/* Contextual handles for selected shape blocks. */}
              {config.blocks
                .filter((b): b is ShapeBlock =>
                  b.kind === "shape" && selectedIds.includes(b.id) && !b.locked)
                .map((sb) => (
                  <ShapeHandleOverlay key={`sh-${sb.id}`} block={sb}
                    scale={scale} canvasEl={canvasRef.current} />
                ))}

              {/* Group outlines + resize handles. */}
              {(config.groups ?? []).map((g) => {
                const members = g.memberIds
                  .map((id) => config.blocks.find((b) => b.id === id))
                  .filter((b): b is CustomBlock => !!b);
                const bb = groupBounds(members);
                if (!bb) return null;
                const active = members.some((b) => selectedIds.includes(b.id));
                const isGroupEditing = !!groupEditMemberId
                  && members.some((m) => m.id === groupEditMemberId);
                const showHandles = active && !isGroupEditing;
                return (
                  <GroupOverlay
                    key={`grp-${g.id}`}
                    bounds={bb}
                    active={active}
                    showHandles={showHandles}
                    memberIds={members.map((m) => m.id)}
                    scaleRef={scaleRef}
                  />
                );
              })}

              {/* Smart guides overlay (B8.3). */}
              <svg
                data-export-hide="true"
                width={CANVAS_W} height={CANVAS_H}
                style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 999998 }}
              >
                {guides.v.map((x, i) => (
                  <line key={`gv-${i}`} x1={x} x2={x} y1={0} y2={CANVAS_H}
                    stroke="#3B82F6" strokeWidth={1} />
                ))}
                {guides.h.map((y, i) => (
                  <line key={`gh-${i}`} y1={y} y2={y} x1={0} x2={CANVAS_W}
                    stroke="#3B82F6" strokeWidth={1} />
                ))}
              </svg>

              {/* Marquee selection rectangle (B8.2). */}
              {marquee && (
                <div
                  data-export-hide="true"
                  style={{
                    position: "absolute",
                    left: marquee.x, top: marquee.y,
                    width: marquee.w, height: marquee.h,
                    border: "1px dashed #3B82F6",
                    background: "rgba(59,130,246,0.08)",
                    pointerEvents: "none",
                    zIndex: 999999,
                  }}
                />
              )}

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

        {/* Barra de zoom + undo/redo */}
        <div className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={undoAction} disabled={!undoRedo.canUndo}
            title={undoRedo.undoLabel ? `Desfazer: ${undoRedo.undoLabel.toLowerCase()}` : "Desfazer (⌘Z)"}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={redoAction} disabled={!undoRedo.canRedo}
            title={undoRedo.redoLabel ? `Refazer: ${undoRedo.redoLabel.toLowerCase()}` : "Refazer (⌘⇧Z)"}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <PalettePopover
            theme={getTheme(config.theme)}
            blocks={config.blocks}
            selected={selected}
          />
          <Separator orientation="vertical" className="mx-1 h-5" />
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
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="icon" variant={prefs.gridEnabled ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => prefs.setGridEnabled(!prefs.gridEnabled)}
            title={prefs.gridEnabled ? "Grade ligada — clique para desligar" : "Ativar grade"}>
            <Grid3x3 className="h-3.5 w-3.5" />
          </Button>
          {prefs.gridEnabled && (
            <Select value={String(prefs.gridSize)}
              onValueChange={(v) => prefs.setGridSize(parseInt(v, 10) as GridSize)}>
              <SelectTrigger className="h-7 w-[64px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[4, 8, 16, 32].map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} px</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="secondary" className="ml-2 text-[9px] uppercase">16:9</Badge>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setPresentOpen(true)}
            title="Apresentar (F5)">
            <Play className="h-3 w-3" /> Apresentar
          </Button>
        </div>
      </div>

      {/* ====== Inspector ====== */}
      <div className="min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/40 bg-card/40">
        <div className="min-w-0 space-y-3 p-3">
          {multiSelected.length >= 2 ? (
            <MultiSelectInspector
              selectedIds={selectedIds}
              blocks={multiSelected}
              hasGroup={multiSelected.some((b) => !!b.groupId)}
            />
          ) : !selected ? (
            <div className="space-y-2 px-1 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">Slide personalizado</p>
              <p>Adicione blocos pela paleta à esquerda. Clique em um bloco para editar suas propriedades aqui.</p>
              <p>Arraste pelas bordas para mover, use os cantos para redimensionar. Linhas azuis mostram alinhamento com outros blocos.</p>
              <p>Segure <kbd>Shift</kbd> e clique para selecionar vários blocos. Arraste no fundo para selecionar com retângulo.</p>
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
                  {selected.kind === "chart" && (
                    <Button
                      size="icon"
                      variant={copiedStyle.hasCopy && copiedStyle.sourceId === selected.id ? "default" : "ghost"}
                      className="h-7 w-7"
                      onClick={() => {
                        if (copiedStyle.hasCopy && copiedStyle.sourceId !== selected.id) {
                          if (pasteChartStyleAction(selected.id)) toast.success("Estilo colado");
                        } else {
                          if (copyChartStyleAction(selected.id)) toast.success("Estilo copiado");
                        }
                      }}
                      title={copiedStyle.hasCopy && copiedStyle.sourceId !== selected.id
                        ? "Colar estilo neste gráfico"
                        : "Copiar estilo deste gráfico"}>
                      <Paintbrush className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => toggleLock(selected.id)}
                    title={selected.locked ? "Desbloquear posição" : "Bloquear posição"}>
                    {selected.locked
                      ? <Unlock className="h-3.5 w-3.5" />
                      : <Lock className="h-3.5 w-3.5" />}
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
      </div>

      {/* Templates picker */}
      <TemplatePicker
        open={tplOpen}
        onOpenChange={setTplOpen}
        onApply={(cfg) => { onChange(cfg); toast.success("Modelo aplicado"); }}
        onApplyDeck={(configs, mode, name) => {
          const state = useSlidesFlow.getState();
          const items = [...state.items];
          const idx = items.findIndex((i) => i.id === slideId);
          if (idx < 0) return;
          // Build new SlideItems for each deck slide.
          const newItems = configs.map((cfg, i) => ({
            id: newId(),
            kind: "custom" as const,
            label: `${name} · ${i + 1}`,
            config: cfg,
          }));
          if (mode === "replace") {
            // Replace current with first, insert rest after.
            const first = newItems[0];
            const rest = newItems.slice(1);
            items.splice(idx, 1, first, ...rest);
            useSlidesFlow.setState({ items, selectedId: first.id });
            onChange(first.config);
          } else {
            items.splice(idx + 1, 0, ...newItems);
            useSlidesFlow.setState({ items, selectedId: newItems[0].id });
          }
          toast.success(`Deck aplicado — ${configs.length} slides criados`);
        }}
      />

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
    {presentOpen && (
      <PresentationMode
        currentSlideId={slideId}
        currentConfig={config}
        onClose={() => setPresentOpen(false)}
      />
    )}
    </SlideFilterProvider>
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
      return <ShapeInspector block={block} onChange={onChange} />;

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
    if (block.kind === "table" && pendingSource === "budget") {
      const tb = block as Extract<CustomBlock, { kind: "table" }>;
      const filtered = tb.measures.filter((m) => !BUDGET_UNAVAILABLE_MEASURES.includes(m));
      if (filtered.length !== tb.measures.length) {
        (patch as Partial<typeof tb>).measures = filtered;
        if (tb.sortMeasure && BUDGET_UNAVAILABLE_MEASURES.includes(tb.sortMeasure)) {
          (patch as Partial<typeof tb>).sortMeasure = filtered[0] ?? undefined;
        }
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

const CHECKER_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(-45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.08) 75%)," +
    "linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.08) 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
  backgroundColor: "#FFFFFF",
};

/** Background color picker with "Sem fundo" toggle. value: hex sem '#' OR "transparent". */
function BgField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const isT = value === "transparent";
  const v = isT ? "" : (value || "").replace("#", "");
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <label className="mt-1 mb-1 flex cursor-pointer items-center justify-between text-[10px] text-muted-foreground">
        <span>Sem fundo</span>
        <Switch checked={isT} className="scale-75"
          onCheckedChange={(c) => onChange(c ? "transparent" : "FFFFFF")} />
      </label>
      <div className="flex items-center gap-1">
        <input type="color" disabled={isT} value={`#${v || "FFFFFF"}`}
          onChange={(e) => onChange(e.target.value.replace("#", ""))}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
          style={isT ? CHECKER_BG : undefined} />
        <Input className="h-7 text-xs font-mono" value={v} disabled={isT}
          onChange={(e) => onChange(e.target.value.replace("#", ""))} />
      </div>
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
                {KPI_MEASURES.map((m) => {
                  const disabled = block.dataSource === "budget"
                    && BUDGET_UNAVAILABLE_MEASURES.includes(m.id);
                  return (
                    <SelectItem key={m.id} value={m.id} disabled={disabled}
                      title={disabled ? BUDGET_UNAVAILABLE_HINT : undefined}>
                      {m.label}{disabled ? " — indisponível" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {block.dataSource === "budget" && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {BUDGET_UNAVAILABLE_HINT}
              </p>
            )}
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
      <BgField label="Fundo do card"
        value={block.cardBg ?? "F8FAFC"}
        onChange={(v) => onChange({ cardBg: v } as never)} />
      <Separator />
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">
          Reagir a filtros do slide
        </Label>
        <Switch
          checked={block.participatesInCrossFilter !== false}
          onCheckedChange={(v) => onChange({ participatesInCrossFilter: v } as never)}
        />
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
          {CUSTOM_TABLE_MEASURES.map((m) => {
            const disabled = block.dataSource === "budget"
              && BUDGET_UNAVAILABLE_MEASURES.includes(m.id);
            return (
              <button key={m.id}
                onClick={() => { if (!disabled) toggleMeasure(m.id); }}
                disabled={disabled}
                title={disabled ? BUDGET_UNAVAILABLE_HINT : undefined}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-secondary",
                  block.measures.includes(m.id) && "bg-primary/10 text-primary",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <span>{m.label}{disabled ? " — indisponível" : ""}</span>
                {block.measures.includes(m.id) && !disabled && <span className="text-[9px]">✓</span>}
              </button>
            );
          })}
        </div>
        {block.dataSource === "budget" && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            {BUDGET_UNAVAILABLE_HINT}
          </p>
        )}
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
              {KPI_MEASURES.map((m) => {
                const disabled = block.dataSource === "budget"
                  && BUDGET_UNAVAILABLE_MEASURES.includes(m.id);
                return (
                  <SelectItem key={m.id} value={m.id} disabled={disabled}
                    title={disabled ? BUDGET_UNAVAILABLE_HINT : undefined}>
                    {m.label}{disabled ? " — indisponível" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {block.dataSource === "budget" && (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {BUDGET_UNAVAILABLE_HINT}
            </p>
          )}
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

// ---------------------------------------------------------------------------
// ClearFiltersToolbar — slide-level cross-filter clear button (Part B.6)
// ---------------------------------------------------------------------------
function ClearFiltersToolbar() {
  const { filters, clearAll } = useSlideFilters();
  if (filters.length === 0) return null;
  const summary = filters
    .map((f) => `${dimensionLabel(f.dimension)}: ${f.values.join(", ")}`)
    .join(" · ");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5">
      <FunnelIcon className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1 truncate text-[11px] text-foreground/90" title={summary}>
        Filtros cruzados ativos · {summary}
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={clearAll}>
        Limpar filtros ({filters.length})
      </Button>
    </div>
  );
}

// Convert client mouse coords to canvas-space coords (accounting for scale).
function clientToCanvas(
  canvasEl: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  scale: number,
): { x: number; y: number } | null {
  if (!canvasEl) return null;
  const r = canvasEl.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}

// ---------------------------------------------------------------------------
// Multi-selection inspector (B8.2)
// ---------------------------------------------------------------------------
function MultiSelectInspector({ selectedIds, blocks, hasGroup }: {
  selectedIds: string[];
  blocks: CustomBlock[];
  hasGroup: boolean;
}) {
  const align = (k: AlignKind) => alignBlocksAction(selectedIds, k);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-[10px]">
          Multi-seleção ({blocks.length} blocos)
        </Badge>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => duplicateBlocksAction(selectedIds)}
            title="Duplicar todos (⌘D)">
            <CopyIcon className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive"
            onClick={() => deleteBlocksAction(selectedIds)}
            title="Excluir todos (Del)">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Alinhamento</Label>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <Button size="icon" variant="outline" className="h-8" title="Esquerda" onClick={() => align("left")}>
            <AlignStartVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Centro horizontal" onClick={() => align("centerH")}>
            <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Direita" onClick={() => align("right")}>
            <AlignEndVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Topo" onClick={() => align("top")}>
            <AlignStartHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Centro vertical" onClick={() => align("centerV")}>
            <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Base" onClick={() => align("bottom")}>
            <AlignEndHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Distribuir</Label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={blocks.length < 3}
            onClick={() => align("distH")}>
            <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" /> Horizontal
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={blocks.length < 3}
            onClick={() => align("distV")}>
            <AlignVerticalDistributeCenter className="h-3.5 w-3.5" /> Vertical
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          onClick={() => { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }}>
          <GroupIcon className="h-3.5 w-3.5" /> Agrupar
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          disabled={!hasGroup}
          onClick={() => { ungroupBlocksAction(selectedIds); toast.success("Grupo desfeito"); }}>
          <UngroupIcon className="h-3.5 w-3.5" /> Desagrupar
        </Button>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        Atalhos: <kbd>⌘A</kbd> selecionar tudo · <kbd>⌘G</kbd> agrupar · <kbd>⌘⇧G</kbd> desagrupar · <kbd>setas</kbd> mover (Shift = 40px)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupOverlay — dashed bbox + 8 resize handles for the active group (B8 fix).
// Drag preview is local; on mouseup a single labeled action commits the
// proportional scale to every member ("Redimensionar grupo" — undoable).
// ---------------------------------------------------------------------------
function GroupOverlay({
  bounds, active, showHandles, memberIds, scaleRef,
}: {
  bounds: { x: number; y: number; w: number; h: number };
  active: boolean;
  showHandles: boolean;
  memberIds: string[];
  scaleRef: React.MutableRefObject<number>;
}) {
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const bb = preview ?? bounds;

  type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

  const startResize = (dir: HandleDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const origin = { ...bounds };
    const startX = e.clientX;
    const startY = e.clientY;
    const sc = scaleRef.current || 1;
    const move = (ev: MouseEvent) => {
      const rawDx = (ev.clientX - startX) / sc;
      const rawDy = (ev.clientY - startY) / sc;
      let { x, y, w, h } = origin;
      if (dir.includes("e")) w = Math.max(40, origin.w + rawDx);
      if (dir.includes("s")) h = Math.max(40, origin.h + rawDy);
      if (dir.includes("w")) {
        const nw = Math.max(40, origin.w - rawDx);
        x = origin.x + (origin.w - nw);
        w = nw;
      }
      if (dir.includes("n")) {
        const nh = Math.max(40, origin.h - rawDy);
        y = origin.y + (origin.h - nh);
        h = nh;
      }
      setPreview({ x, y, w, h });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPreview((p) => {
        if (p) resizeGroupAction(memberIds, origin, p);
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleStyle = (top: number | string | "auto", left: number | string | "auto", right: number | string | "auto", bottom: number | string | "auto", cursor: string): React.CSSProperties => ({
    position: "absolute",
    top: top === "auto" ? "auto" : top,
    left: left === "auto" ? "auto" : left,
    right: right === "auto" ? "auto" : right,
    bottom: bottom === "auto" ? "auto" : bottom,
    width: 10, height: 10,
    background: "#3B82F6",
    border: "1.5px solid white",
    borderRadius: 2,
    cursor,
    pointerEvents: "auto",
    zIndex: 999997,
  });

  return (
    <>
      {/* dashed bbox */}
      <div
        data-export-hide="true"
        style={{
          position: "absolute",
          left: bb.x - 4, top: bb.y - 4,
          width: bb.w + 8, height: bb.h + 8,
          border: `1px dashed ${active ? "#3B82F6" : "rgba(59,130,246,0.35)"}`,
          borderRadius: 4,
          pointerEvents: "none",
          zIndex: showHandles ? 999996 : 0,
        }}
      />
      {showHandles && (
        <div
          data-export-hide="true"
          style={{
            position: "absolute",
            left: bb.x - 5, top: bb.y - 5,
            width: bb.w + 10, height: bb.h + 10,
            pointerEvents: "none",
            zIndex: 999997,
          }}
        >
          <div onMouseDown={(e) => startResize("nw", e)} style={handleStyle(-5, -5, "auto", "auto", "nwse-resize")} />
          <div onMouseDown={(e) => startResize("n",  e)} style={{ ...handleStyle(-5, "50%", "auto", "auto", "ns-resize"), marginLeft: -5 }} />
          <div onMouseDown={(e) => startResize("ne", e)} style={handleStyle(-5, "auto", -5, "auto", "nesw-resize")} />
          <div onMouseDown={(e) => startResize("e",  e)} style={{ ...handleStyle("50%", "auto", -5, "auto", "ew-resize"), marginTop: -5 }} />
          <div onMouseDown={(e) => startResize("se", e)} style={handleStyle("auto", "auto", -5, -5, "nwse-resize")} />
          <div onMouseDown={(e) => startResize("s",  e)} style={{ ...handleStyle("auto", "50%", "auto", -5, "ns-resize"), marginLeft: -5 }} />
          <div onMouseDown={(e) => startResize("sw", e)} style={handleStyle("auto", -5, "auto", -5, "nesw-resize")} />
          <div onMouseDown={(e) => startResize("w",  e)} style={{ ...handleStyle("50%", -5, "auto", "auto", "ew-resize"), marginTop: -5 }} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PalettePopover — paleta de cores rápidas (cores usadas + cores do tema)
// ---------------------------------------------------------------------------
function collectUsedColors(blocks: CustomBlock[]): string[] {
  const set = new Set<string>();
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "text") set.add(b.color);
    else if (b.kind === "kpi") set.add(b.color);
    else if (b.kind === "shape") set.add(b.fill);
  }
  return Array.from(set).filter(Boolean).slice(0, 7);
}

function PalettePopover({
  theme, blocks, selected,
}: {
  theme: SlideTheme;
  blocks: CustomBlock[];
  selected: CustomBlock | null;
}) {
  const used = collectUsedColors(blocks);
  const canApply = !!selected && (
    selected.kind === "title" || selected.kind === "text" ||
    selected.kind === "kpi" || selected.kind === "shape"
  );

  const apply = (hex: string) => {
    if (!selected) {
      toast.info("Selecione um bloco para aplicar a cor.");
      return;
    }
    if (selected.kind === "shape") {
      patchBlockAction(selected.id, { fill: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else if (
      selected.kind === "title" || selected.kind === "text" || selected.kind === "kpi"
    ) {
      patchBlockAction(selected.id, { color: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else {
      toast.info("Este bloco não suporta cor direta.");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          title="Paleta de cores"
        >
          <Paintbrush className="h-3.5 w-3.5" /> Paleta
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cores deste slide
            </div>
            {used.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhuma cor usada ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {used.map((hex) => (
                  <button
                    key={`u-${hex}`} type="button"
                    onClick={() => apply(hex)}
                    disabled={!canApply}
                    className="h-6 w-6 rounded-md border border-border/50 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: `#${hex}` }}
                    title={`#${hex}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tema · {theme.name}
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {theme.swatches.map((hex, i) => (
                <button
                  key={`t-${i}-${hex}`} type="button"
                  onClick={() => apply(hex)}
                  disabled={!canApply}
                  className="h-6 w-6 rounded-md border border-border/50 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: `#${hex}` }}
                  title={`#${hex}`}
                />
              ))}
            </div>
          </div>
          {!canApply && (
            <p className="text-[10px] text-muted-foreground">
              Selecione um título, texto, KPI ou forma para aplicar.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
