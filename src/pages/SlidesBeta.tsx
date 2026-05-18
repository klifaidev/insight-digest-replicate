// ============================================================================
// Slides — Editor canvas-céntrico (Figma/Keynote inspired)
//
// Estrutura:
//   ┌─ Topbar (voltar, nome do deck, transição, templates, colab, export) ─┐
//   ├─ Strip (120px) │ Canvas (block palette + slide + nav) │ Inspector ──┤
//
// Todos os slides são "custom"; blocos de análise (bridge_pvm_block,
// budget_evo_block, cover_block) viram blocos dentro do canvas.
// ============================================================================
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, Bookmark, ChevronDown, ChevronLeft, ChevronRight,
  Copy, Download, FileText, GitBranch, GripVertical, Hash, Image as ImageIcon, AlignLeft,
  LayoutTemplate, Plus, Presentation, Save, Sparkles, Square, Table as TableIcon, Target,
  Trash2, Trophy, Type, Users2, History, MessageSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import { useSlidesFlow } from "@/store/slidesFlow";
import {
  defaultItem, itemToFlow, createBridgePvmSlide, createBudgetEvoSlide,
  createCoverSlide, type SlideItem,
} from "@/lib/slidesFlow";
import { exportSlideFlow } from "@/lib/exportPpt";
import { exportToPdf } from "@/lib/exportPdf";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { TemplateGallery } from "@/components/pricing/custom/TemplateGallery";
import type { SlideTemplate } from "@/lib/slideTemplates";
import { usePageTitle } from "@/hooks/use-page-title";
import { useCollaboration } from "@/hooks/use-collaboration";
import { initials } from "@/lib/kanban";
import {
  newBlock, type CustomBlockKind, type CustomSlideConfig, type CustomBlock,
} from "@/lib/customSlide";
import { getUnresolvedCount, subscribe as subscribeComments } from "@/lib/slideComments";
import { readLog, clearLog, subscribeLog, type ChangeLogEntry } from "@/lib/slideChangeLog";
import { format as formatDate } from "date-fns";

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------
const CANVAS_RATIO = 1333 / 750;
const STRIP_W = 120;
const INSPECTOR_W = 300;

const ANALYSIS_BLOCKS: { kind: CustomBlockKind; label: string; Icon: typeof GitBranch }[] = [
  { kind: "bridge_pvm_block", label: "Bridge PVM",      Icon: GitBranch },
  { kind: "budget_evo_block", label: "Budget Evolutivo", Icon: Target },
  { kind: "cover_block",      label: "Capa / Divisor",   Icon: BookOpen },
];

const CONTENT_BLOCKS: { kind: CustomBlockKind; label: string; Icon: typeof Type }[] = [
  { kind: "title",  label: "Título",  Icon: Type },
  { kind: "text",   label: "Texto",   Icon: AlignLeft },
  { kind: "kpi",    label: "KPI",     Icon: Hash },
  { kind: "chart",  label: "Gráfico", Icon: BarChart3 },
  { kind: "table",  label: "Tabela",  Icon: TableIcon },
  { kind: "topSku", label: "Ranking", Icon: Trophy },
  { kind: "image",  label: "Imagem",  Icon: ImageIcon },
  { kind: "shape",  label: "Forma",   Icon: Square },
];

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------
export default function SlidesBeta() {
  usePageTitle("Slides");
  const navigate = useNavigate();

  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const transition = useSlidesFlow((s) => s.transition);
  const setTransition = useSlidesFlow((s) => s.setTransition);
  const select = useSlidesFlow((s) => s.select);
  const addItem = useSlidesFlow((s) => s.addItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const duplicateItem = useSlidesFlow((s) => s.duplicateItem);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const reorder = useSlidesFlow((s) => s.reorder);
  const setCollabBroadcast = useSlidesFlow((s) => s.setCollabBroadcast);
  const addItemFromCollab = useSlidesFlow((s) => s.addItemFromCollab);
  const updateItemFromCollab = useSlidesFlow((s) => s.updateItemFromCollab);

  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const months = useMonthsInfo(pricingRows);
  const fys = useFyList(pricingRows);
  const budgetMonths = useMonthsInfo(budgetRows as never);

  // Deck name
  const [deckName, setDeckName] = useState<string>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem("slides-deck-name")) || "",
  );
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("slides-deck-name", deckName);
    }
  }, [deckName]);

  // Collaboration
  const [collabRoom, setCollabRoom] = useState<string | null>(null);
  const [collabName, setCollabName] = useState<string>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem("collab-username")) || "",
  );
  const collab = useCollaboration(collabRoom, collabName);
  useEffect(() => {
    setCollabBroadcast(collabRoom ? collab.broadcast : null, collab.userId);
  }, [collabRoom, collab.broadcast, collab.userId, setCollabBroadcast]);

  // Auto-select first slide
  useEffect(() => {
    if (!selectedId && items.length > 0) select(items[0].id);
    if (selectedId && !items.find((i) => i.id === selectedId)) {
      select(items[0]?.id ?? null);
    }
  }, [items, selectedId, select]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedIdx = useMemo(
    () => items.findIndex((i) => i.id === selectedId),
    [items, selectedId],
  );

  // Dialogs
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Build context for templates / smart defaults
  const ctx = useMemo(
    () => ({ pricingRows, budgetRows, metric, months, fys, budgetMonths }),
    [pricingRows, budgetRows, metric, months, fys, budgetMonths],
  );

  // ----- Slide actions ------------------------------------------------------
  const addBlankSlide = useCallback(() => {
    const item = defaultItem("custom");
    addItem("custom"); // store creates with defaultItem internally
    // Use the last-added id from store (need to fetch after)
    setTimeout(() => {
      const latest = useSlidesFlow.getState().items;
      select(latest[latest.length - 1]?.id ?? null);
    }, 0);
    void item;
  }, [addItem, select]);

  const addPreconfiguredSlide = useCallback(
    (factory: () => SlideItem) => {
      const item = factory();
      // Insert manually since the store's addItem only takes kind.
      // We use a small trick: addItemFromCollab inserts without broadcast.
      addItemFromCollab(item);
      select(item.id);
    },
    [addItemFromCollab, select],
  );

  const addBlockToCurrentSlide = useCallback(
    (kind: CustomBlockKind) => {
      if (!selectedItem || selectedItem.kind !== "custom") {
        toast.error("Crie um slide antes de adicionar blocos.");
        return;
      }
      const cfg = selectedItem.config;
      const zTop = cfg.blocks.reduce((m, b) => Math.max(m, b.z), 0);
      const block = newBlock(kind, zTop);
      const next: CustomSlideConfig = { ...cfg, blocks: [...cfg.blocks, block] };
      updateItem(selectedItem.id, { config: next } as Partial<SlideItem>);
    },
    [selectedItem, updateItem],
  );

  const handleSlideConfigChange = useCallback(
    (cfg: CustomSlideConfig) => {
      if (!selectedItem) return;
      updateItem(selectedItem.id, { config: cfg } as Partial<SlideItem>);
    },
    [selectedItem, updateItem],
  );

  const navigateSlide = useCallback(
    (dir: -1 | 1) => {
      if (items.length === 0) return;
      const i = Math.max(0, Math.min(items.length - 1, selectedIdx + dir));
      select(items[i].id);
    },
    [items, selectedIdx, select],
  );

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(input|textarea|select)$/i.test(tgt.tagName)) return;
      if (tgt?.isContentEditable) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); navigateSlide(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); navigateSlide(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateSlide]);

  // DnD sensors for strip
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      reorder(String(active.id), String(over.id));
    },
    [reorder],
  );

  // ----- Export -------------------------------------------------------------
  const [exporting, setExporting] = useState(false);
  const fileBaseName = useMemo(
    () => (deckName.trim() || "Apresentacao").replace(/[^a-zA-Z0-9._-]+/g, "_"),
    [deckName],
  );
  const handleExportPptx = useCallback(async () => {
    if (items.length === 0) { toast.error("Adicione ao menos um slide."); return; }
    setExporting(true);
    try {
      const flows = items.map((it) => itemToFlow(it, ctx));
      await exportSlideFlow(flows, `${fileBaseName}.pptx`);
      toast.success("PPTX exportado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally { setExporting(false); }
  }, [items, ctx, fileBaseName]);
  const handleExportPdf = useCallback(async () => {
    if (items.length === 0) { toast.error("Adicione ao menos um slide."); return; }
    setExporting(true);
    try {
      await exportToPdf(items, `${fileBaseName}.pdf`);
      toast.success("PDF exportado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally { setExporting(false); }
  }, [items, fileBaseName]);

  const handleTemplatePick = useCallback(
    (tpl: SlideTemplate) => {
      const created = tpl.build(ctx);
      for (const it of created) addItemFromCollab(it);
      if (created[0]) select(created[0].id);
      setGalleryOpen(false);
      toast.success(`${created.length} slide(s) adicionado(s)`);
    },
    [ctx, addItemFromCollab, select],
  );

  // ----- Render -------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <DeckTopbar
          deckName={deckName}
          onDeckName={setDeckName}
          slideCount={items.length}
          transition={transition}
          onTransition={setTransition}
          onTemplates={() => setGalleryOpen(true)}
          onCollab={() => setCollabOpen(true)}
          onHistory={() => setHistoryOpen(true)}
          collabActive={!!collabRoom}
          collaboratorCount={collab.collaborators.length}
          onExportPptx={handleExportPptx}
          onExportPdf={handleExportPdf}
          exporting={exporting}
          onBack={() => navigate("/")}
        />

        <div className="flex flex-1 min-h-0">
          {/* Strip */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SlideStrip
              items={items}
              selectedId={selectedId}
              onSelect={select}
              onAdd={addBlankSlide}
              onDuplicate={duplicateItem}
              onRemove={removeItem}
              collabSlideMap={collab.collaborators}
            />
          </DndContext>

          {/* Canvas area */}
          <CanvasArea
            item={selectedItem}
            itemsLength={items.length}
            selectedIdx={selectedIdx}
            onPrev={() => navigateSlide(-1)}
            onNext={() => navigateSlide(1)}
            onAddBlock={addBlockToCurrentSlide}
            onConfigChange={handleSlideConfigChange}
            onOpenGallery={() => setGalleryOpen(true)}
            onCreateBlank={addBlankSlide}
            onCreatePreconfigured={addPreconfiguredSlide}
            collaborators={collab.collaborators}
            updateCursor={collab.updateCursor}
          />

          {/* Inspector */}
          <DeckInspector
            item={selectedItem}
            onConfigChange={handleSlideConfigChange}
            onDuplicate={() => selectedItem && duplicateItem(selectedItem.id)}
            onRemove={() => selectedItem && removeItem(selectedItem.id)}
          />
        </div>

        <TemplateGallery
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          ctx={ctx}
          onSelect={handleTemplatePick}
        />

        <CollabDialog
          open={collabOpen}
          onOpenChange={setCollabOpen}
          room={collabRoom}
          onRoom={setCollabRoom}
          userName={collabName}
          onUserName={setCollabName}
        />

        <HistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          items={items}
        />
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Topbar
// ============================================================================
function DeckTopbar(props: {
  deckName: string; onDeckName: (s: string) => void;
  slideCount: number;
  transition: ReturnType<typeof useSlidesFlow.getState>["transition"];
  onTransition: (t: ReturnType<typeof useSlidesFlow.getState>["transition"]) => void;
  onTemplates: () => void;
  onCollab: () => void;
  onHistory: () => void;
  collabActive: boolean;
  collaboratorCount: number;
  onExportPptx: () => void;
  onExportPdf: () => void;
  exporting: boolean;
  onBack: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/40 bg-card/40 backdrop-blur px-4 h-14 shrink-0">
      <div className="flex items-center gap-3 min-w-0 w-[320px]">
        <Button variant="ghost" size="sm" onClick={props.onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 min-w-0">
          <Presentation className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm">Slides</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {props.slideCount}
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <Input
          value={props.deckName}
          onChange={(e) => props.onDeckName(e.target.value)}
          placeholder="Apresentação sem título"
          className="h-8 max-w-[360px] text-center font-medium bg-transparent border-transparent hover:border-border/60 focus-visible:border-primary/40 focus-visible:ring-0 transition-colors"
        />
      </div>

      <div className="flex items-center gap-2 w-[320px] justify-end">
        <Select value={props.transition} onValueChange={(v) => props.onTransition(v as never)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem transição</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide-left">Slide</SelectItem>
            <SelectItem value="slide-up">Slide cima</SelectItem>
            <SelectItem value="zoom">Zoom</SelectItem>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={props.onTemplates}>
              <Sparkles className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Templates</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={props.onHistory}>
              <History className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Histórico</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={props.onCollab}>
              <Users2 className="h-4 w-4" />
              {props.collabActive && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {props.collabActive ? `Ao vivo (${props.collaboratorCount})` : "Colaborar"}
          </TooltipContent>
        </Tooltip>

        <div className="flex">
          <Button
            size="sm"
            onClick={props.onExportPptx}
            disabled={props.exporting}
            className="h-8 rounded-r-none gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={props.exporting} className="h-8 w-7 rounded-l-none border-l border-primary-foreground/20 px-0">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={props.onExportPptx}>
                <FileText className="mr-2 h-4 w-4" /> PowerPoint (.pptx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={props.onExportPdf}>
                <FileText className="mr-2 h-4 w-4" /> PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Strip
// ============================================================================
function SlideStrip({
  items, selectedId, onSelect, onAdd, onDuplicate, onRemove,
}: {
  items: SlideItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  collabSlideMap: { slideId?: string | null; color: string }[];
}) {
  return (
    <aside
      className="flex flex-col border-r border-border/40 bg-card/30 shrink-0"
      style={{ width: STRIP_W }}
    >
      <div className="px-2 py-2 border-b border-border/40 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
          {items.length} {items.length === 1 ? "slide" : "slides"}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="px-2 py-2 space-y-2">
            {items.map((item, idx) => (
              <StripItem
                key={item.id}
                item={item}
                index={idx + 1}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
                onDuplicate={() => onDuplicate(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>

      <div className="p-2 border-t border-border/40">
        <Button variant="outline" size="sm" className="w-full h-8 gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Novo
        </Button>
      </div>
    </aside>
  );
}

function StripItem({
  item, index, selected, onSelect, onDuplicate, onRemove,
}: {
  item: SlideItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const sortable = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  // Comments badge (subscribed updates)
  const [unresolved, setUnresolved] = useState<number>(() => getUnresolvedCount(item.id));
  useEffect(() => {
    const off = subscribeComments(() => setUnresolved(getUnresolvedCount(item.id)));
    return off;
  }, [item.id]);

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-md transition-all cursor-pointer",
        selected
          ? "ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
          : "ring-1 ring-border/40 hover:ring-border hover:-translate-y-0.5 hover:shadow-md",
      )}
      onClick={onSelect}
    >
      <div className="overflow-hidden rounded-md bg-background">
        <ScaledPreview item={item} targetWidth={104} />
      </div>

      <Badge
        variant="secondary"
        className="absolute top-1 left-1 h-4 px-1 text-[9px] font-mono bg-background/80 backdrop-blur"
      >
        {index}
      </Badge>

      {unresolved > 0 && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5 rounded-full bg-amber-500/90 text-white text-[9px] px-1 h-4">
          <MessageSquare className="h-2.5 w-2.5" />
          {unresolved}
        </div>
      )}

      {/* Drag handle */}
      <button
        {...sortable.attributes}
        {...sortable.listeners}
        className="absolute bottom-1 left-1 h-5 w-5 rounded bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        aria-label="Reordenar"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Actions */}
      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5">
        <button
          className="h-5 w-5 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          aria-label="Duplicar"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          className="h-5 w-5 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Remover"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Canvas area
// ============================================================================
function CanvasArea({
  item, itemsLength, selectedIdx, onPrev, onNext, onAddBlock, onConfigChange,
  onOpenGallery, onCreateBlank, onCreatePreconfigured, collaborators, updateCursor,
}: {
  item: SlideItem | null;
  itemsLength: number;
  selectedIdx: number;
  onPrev: () => void;
  onNext: () => void;
  onAddBlock: (kind: CustomBlockKind) => void;
  onConfigChange: (cfg: CustomSlideConfig) => void;
  onOpenGallery: () => void;
  onCreateBlank: () => void;
  onCreatePreconfigured: (factory: () => SlideItem) => void;
  collaborators: ReturnType<typeof useCollaboration>["collaborators"];
  updateCursor: (x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const pad = 40;
      const w = el.clientWidth - pad * 2;
      const h = el.clientHeight - pad * 2;
      if (w <= 0 || h <= 0) return;
      let cw = w;
      let ch = w / CANVAS_RATIO;
      if (ch > h) { ch = h; cw = h * CANVAS_RATIO; }
      setCanvasSize({ w: cw, h: ch });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (itemsLength === 0) {
    return (
      <main className="flex-1 relative bg-muted/30 overflow-hidden">
        <WelcomeScreen
          onOpenGallery={onOpenGallery}
          onCreateBlank={onCreateBlank}
          onCreatePreconfigured={onCreatePreconfigured}
        />
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      className="flex-1 relative bg-muted/30 overflow-hidden group/canvas"
    >
      {/* Block palette */}
      {item && item.kind === "custom" && (
        <div
          className="absolute z-20 w-12 bg-card/95 backdrop-blur border border-border/60 rounded-2xl p-1.5 flex flex-col gap-0.5 shadow-xl animate-in fade-in slide-in-from-left-2 duration-300"
          style={{ left: 16, top: "50%", transform: "translateY(-50%)" }}
        >
          {ANALYSIS_BLOCKS.map((b) => (
            <PaletteBtn key={b.kind} label={b.label} Icon={b.Icon} onClick={() => onAddBlock(b.kind)} />
          ))}
          <Separator className="my-1" />
          {CONTENT_BLOCKS.map((b) => (
            <PaletteBtn key={b.kind} label={b.label} Icon={b.Icon} onClick={() => onAddBlock(b.kind)} />
          ))}
        </div>
      )}

      {/* Nav arrows */}
      {selectedIdx > 0 && (
        <button
          onClick={onPrev}
          className="absolute z-20 left-[80px] top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-card/80 backdrop-blur border border-border/60 flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity hover:bg-card shadow-md"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {selectedIdx < itemsLength - 1 && (
        <button
          onClick={onNext}
          className="absolute z-20 right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-card/80 backdrop-blur border border-border/60 flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity hover:bg-card shadow-md"
          aria-label="Próximo"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Page indicator */}
      {itemsLength > 0 && (
        <div className="absolute z-20 bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-card/80 backdrop-blur border border-border/60 text-xs font-mono text-muted-foreground">
          {selectedIdx + 1} / {itemsLength}
        </div>
      )}

      {/* Canvas */}
      <div className="absolute inset-0 flex items-center justify-center p-10">
        {item && item.kind === "custom" && canvasSize.w > 0 && (
          <div
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              boxShadow: "0 32px 64px -16px rgba(0,0,0,0.5)",
              borderRadius: 4,
              overflow: "hidden",
              background: "white",
            }}
          >
            <CustomSlideEditor
              slideId={item.id}
              config={item.config}
              onChange={onConfigChange}
              collaborators={collaborators}
              onCursorMove={updateCursor}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function PaletteBtn({
  label, Icon, onClick,
}: { label: string; Icon: typeof Type; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="h-8 w-9 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Welcome screen
// ============================================================================
function WelcomeScreen({
  onOpenGallery, onCreateBlank, onCreatePreconfigured,
}: {
  onOpenGallery: () => void;
  onCreateBlank: () => void;
  onCreatePreconfigured: (factory: () => SlideItem) => void;
}) {
  const shortcuts: { label: string; Icon: typeof GitBranch; factory: () => SlideItem }[] = [
    { label: "Bridge PVM",      Icon: GitBranch, factory: createBridgePvmSlide },
    { label: "Budget Evolutivo", Icon: Target,   factory: createBudgetEvoSlide },
    { label: "KPIs",             Icon: Hash,     factory: () => {
        const it = defaultItem("custom");
        if (it.kind === "custom") {
          const kpi = newBlock("kpi", 1);
          it.config = { ...it.config, blocks: [...it.config.blocks, kpi] };
        }
        return it;
      } },
    { label: "Capa",             Icon: BookOpen, factory: () => createCoverSlide("Resultado Mensal", "Período atual", "cover") },
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(circle at 50% 45%, hsl(var(--primary) / 0.08), transparent 60%)",
      }}
    >
      <div className="relative mb-6">
        <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
        <div className="relative h-20 w-20 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-lg">
          <Presentation className="h-9 w-9 text-primary" />
        </div>
      </div>

      <h1 className="text-2xl font-semibold mb-2 tracking-tight">
        Seu próximo deck começa aqui
      </h1>
      <p className="text-muted-foreground mb-8 max-w-md text-center">
        Escolha um template ou comece com um slide em branco
      </p>

      <div className="flex gap-3 mb-10">
        <Button size="lg" onClick={onOpenGallery} className="gap-2">
          <Sparkles className="h-4 w-4" /> Escolher template
        </Button>
        <Button size="lg" variant="outline" onClick={onCreateBlank} className="gap-2">
          <Plus className="h-4 w-4" /> Slide em branco
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 max-w-2xl px-6">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => onCreatePreconfigured(s.factory)}
            className="group p-3 rounded-lg border border-border/40 bg-card/40 hover:bg-card hover:border-border hover:-translate-y-0.5 transition-all text-left"
          >
            <ShortcutThumb Icon={s.Icon} />
            <div className="text-xs font-medium mt-2">{s.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShortcutThumb({ Icon }: { Icon: typeof GitBranch }) {
  return (
    <div className="aspect-video rounded-md bg-gradient-to-br from-muted to-muted/40 border border-border/40 flex items-center justify-center group-hover:from-primary/10 group-hover:to-primary/5 transition-colors">
      <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
  );
}

// ============================================================================
// Inspector (right panel — deck-level + speaker notes)
// ============================================================================
function DeckInspector({
  item, onConfigChange, onDuplicate, onRemove,
}: {
  item: SlideItem | null;
  onConfigChange: (cfg: CustomSlideConfig) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const notes = item && item.kind === "custom" ? (item.config.speakerNotes ?? "") : "";
  const setNotes = (v: string) => {
    if (!item || item.kind !== "custom") return;
    onConfigChange({ ...item.config, speakerNotes: v });
  };

  return (
    <aside
      className="border-l border-border/40 bg-card/30 shrink-0 flex flex-col"
      style={{ width: INSPECTOR_W }}
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
          Slide
        </span>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} disabled={!item}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicar slide</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} disabled={!item}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remover slide</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {!item && (
            <div className="text-xs text-muted-foreground text-center py-8">
              Nenhum slide selecionado.
            </div>
          )}

          {item && item.kind === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do slide</Label>
                <Input
                  value={item.label ?? ""}
                  placeholder="Sem título"
                  className="h-8 text-sm"
                  onChange={(e) => {
                    // Note: label is part of SlideItem, not config — but the inspector
                    // only owns config here. Skip if unsupported; kept for UX clarity.
                  }}
                  disabled
                />
                <p className="text-[10px] text-muted-foreground">
                  As propriedades dos blocos (cor, tamanho, posição) aparecem no painel do canvas ao selecionar um bloco.
                </p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Anotações do apresentador
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione notas que só você verá durante a apresentação..."
                  rows={10}
                  className="text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Não exportadas para PPTX/PDF.
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

// ============================================================================
// Collab dialog
// ============================================================================
function CollabDialog({
  open, onOpenChange, room, onRoom, userName, onUserName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  room: string | null;
  onRoom: (r: string | null) => void;
  userName: string;
  onUserName: (n: string) => void;
}) {
  const [name, setName] = useState(userName);
  const startRoom = () => {
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    const id = Math.random().toString(36).slice(2, 10);
    onUserName(name.trim());
    try { localStorage.setItem("collab-username", name.trim()); } catch { /* noop */ }
    onRoom(id);
    toast.success("Sala criada");
  };
  const stopRoom = () => { onRoom(null); toast.info("Sala encerrada"); };

  const link = room
    ? `${window.location.origin}/slides?room=${room}&name=Convidado`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-4 w-4" /> Colaborar em tempo real
          </DialogTitle>
          <DialogDescription>
            Compartilhe um link para editar o deck simultaneamente.
          </DialogDescription>
        </DialogHeader>

        {!room ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Seu nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como você quer aparecer"
              />
            </div>
            <Button onClick={startRoom} className="w-full">Iniciar colaboração</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Link de convite</Label>
              <div className="flex gap-2">
                <Input value={link} readOnly className="text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}
                >
                  Copiar
                </Button>
              </div>
            </div>
            <Button variant="destructive" onClick={stopRoom} className="w-full">
              Encerrar sala
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// History dialog
// ============================================================================
function HistoryDialog({
  open, onOpenChange, items,
}: { open: boolean; onOpenChange: (v: boolean) => void; items: SlideItem[] }) {
  const [log, setLog] = useState<ChangeLogEntry[]>(() => readLog());
  useEffect(() => {
    const off = subscribeLog(() => setLog(readLog()));
    return off;
  }, []);
  void items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de alterações
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          {log.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhuma alteração registrada ainda.
            </div>
          ) : (
            <ul className="space-y-2 pr-3">
              {[...log].reverse().map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm py-1.5 border-b border-border/40">
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ background: e.color }}
                  >
                    {initials(e.userName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{e.description}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDate(new Date(e.ts), "dd/MM HH:mm")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { clearLog(); setLog([]); }}>
            Limpar histórico
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
