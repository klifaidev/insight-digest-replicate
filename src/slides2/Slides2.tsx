// Slides 2.0 — nova experiência isolada (não altera arquivos legados).
// Layout: toolbar superior, strip lateral de thumbs, canvas centralizado com
// palette flutuante e inspector lateral.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Sparkles, Users2,
  Download, Presentation as PresentationIcon, X, GripVertical,
  GitBranch, Target, BookOpen, Type, AlignLeft, Hash, BarChart3,
  Table2, Trophy, Image as ImageIcon, Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useFyList, useMonthsInfo } from "@/store/selectors";

import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { TemplateGallery } from "@/components/pricing/custom/TemplateGallery";
import { PresentationMode } from "@/components/pricing/custom/PresentationMode";
import {
  useEditorConfig, useSelection, clearSelection,
  addBlockAction, patchBlockAction, setSpeakerNotesAction,
} from "@/components/pricing/custom/editorStore";
import type { CustomBlockKind, CustomChartType } from "@/lib/customSlide";
import { BLOCK_LABELS, CANVAS_W, CANVAS_H } from "@/lib/customSlide";

import { useDeck } from "@/slides2/store/deck";
import {
  defaultItem, itemToFlow, isItemReady,
  type SlideItem, type SlideKind,
} from "@/lib/slidesFlow";
import { exportSlideFlow } from "@/lib/exportPpt";
import { exportToPdf } from "@/lib/exportPdf";
import type { SlideTemplate } from "@/lib/slideTemplates";

// Lazy import to keep editor flexible — typed locally.
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { WelcomeScreen } from "@/slides2/components/WelcomeScreen";
import "./slides2.css";

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function Toolbar({
  deckName, setDeckName, slidesCount, transition, setTransition,
  roomActive, onTemplates, onCollab, onExportPptx, onExportPdf, onPresent,
  exporting,
}: {
  deckName: string;
  setDeckName: (v: string) => void;
  slidesCount: number;
  transition: string;
  setTransition: (v: string) => void;
  roomActive: boolean;
  onTemplates: () => void;
  onCollab: () => void;
  onExportPptx: () => void;
  onExportPdf: () => void;
  onPresent: () => void;
  exporting: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex h-12 items-center gap-3 border-b border-border/40 bg-card/80 px-3 backdrop-blur">
      {/* Esquerda */}
      <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => navigate("/")}>
        <ChevronLeft className="h-4 w-4" /> Análises
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <Input
        value={deckName}
        onChange={(e) => setDeckName(e.target.value)}
        placeholder="Apresentação sem título"
        className="h-8 w-48 border-transparent bg-transparent font-medium focus-visible:border-border focus-visible:bg-background"
      />

      {/* Centro */}
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="secondary" className="font-normal">
          {slidesCount} {slidesCount === 1 ? "slide" : "slides"}
        </Badge>
        <Select value={transition} onValueChange={setTransition}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide-left">Deslizar</SelectItem>
            <SelectItem value="slide-up">Subir</SelectItem>
            <SelectItem value="zoom">Zoom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Direita */}
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onTemplates}>
          <Sparkles className="h-3.5 w-3.5" /> Templates
        </Button>
        <Button
          variant="outline" size="sm"
          className={cn("h-8 gap-1.5 relative", roomActive && "border-emerald-500/40")}
          onClick={onCollab}
        >
          <Users2 className="h-3.5 w-3.5" /> Colaborar
          {roomActive && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onPresent}>
          <PresentationIcon className="h-3.5 w-3.5" /> Apresentar
        </Button>
        <div className="flex">
          <Button
            size="sm"
            disabled={exporting}
            className="h-8 gap-1.5 rounded-r-none"
            onClick={onExportPptx}
          >
            <Download className="h-3.5 w-3.5" /> {exporting ? "Exportando..." : "Exportar PPTX"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting} className="h-8 px-1.5 rounded-l-none border-l border-primary-foreground/20">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExportPdf}>Exportar PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strip Thumb (sortable)
// ---------------------------------------------------------------------------
function StripThumb({
  item, index, selected, onSelect,
}: {
  item: SlideItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, animationDelay: `${index * 40}ms` }}
      onClick={onSelect}
      className={cn(
        "s2-strip-thumb s2-thumb-in group relative mx-auto cursor-pointer rounded-md",
      )}
    >
      <div
        className={cn(
          "rounded-md overflow-hidden border-2",
          selected
            ? "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]"
            : "border-border/40 group-hover:border-border/60",
        )}
        style={{ width: 96, height: 54 }}
      >
        <ScaledPreview item={item} targetWidth={96} />
      </div>
      <span className="absolute left-1 top-1 rounded bg-card/80 px-1 text-[9px] font-medium text-foreground backdrop-blur">
        {index + 1}
      </span>
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 hidden p-0.5 text-muted-foreground group-hover:block"
        aria-label="Reordenar"
      >
        <GripVertical className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block palette item
// ---------------------------------------------------------------------------
function PaletteBtn({
  icon: Icon, label, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-all hover:scale-110 hover:bg-primary/10"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const CHART_TYPES: { value: CustomChartType; label: string }[] = [
  { value: "column", label: "Colunas" },
  { value: "bar", label: "Barras" },
  { value: "line", label: "Linha" },
  { value: "area", label: "Área" },
  { value: "stackedColumn", label: "Colunas empilhadas" },
  { value: "pie", label: "Pizza" },
  { value: "donut", label: "Donut" },
  { value: "waterfall", label: "Waterfall" },
];

// ---------------------------------------------------------------------------
// Inspector (simplificado)
// ---------------------------------------------------------------------------
function Inspector({ slideId }: { slideId: string | null }) {
  const config = useEditorConfig();
  const { selectedIds } = useSelection();
  const selBlock = useMemo(() => {
    if (!config || selectedIds.length !== 1) return null;
    return config.blocks.find((b) => b.id === selectedIds[0]) ?? null;
  }, [config, selectedIds]);

  const open = !!selBlock;

  return (
    <div
      className="border-l border-border/40 bg-card/30 overflow-hidden transition-[width] duration-200 ease-out"
      style={{ width: open ? 300 : 0 }}
    >
      {open && selBlock && (
        <div className="flex h-full w-[300px] flex-col">
          <div className="flex h-8 items-center justify-between border-b border-border/40 px-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {BLOCK_LABELS[selBlock.kind] ?? selBlock.kind}
            </span>
            <button
              onClick={() => clearSelection()}
              className="rounded p-1 hover:bg-muted"
              aria-label="Fechar inspector"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Posição</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="number" value={Math.round(selBlock.x)} className="h-7 text-xs"
                  onChange={(e) => patchBlockAction(selBlock.id, { x: Number(e.target.value) }, "Mover bloco")}
                />
                <Input
                  type="number" value={Math.round(selBlock.y)} className="h-7 text-xs"
                  onChange={(e) => patchBlockAction(selBlock.id, { y: Number(e.target.value) }, "Mover bloco")}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Tamanho</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="number" value={Math.round(selBlock.w)} className="h-7 text-xs"
                  onChange={(e) => patchBlockAction(selBlock.id, { w: Number(e.target.value) }, "Redimensionar bloco")}
                />
                <Input
                  type="number" value={Math.round(selBlock.h)} className="h-7 text-xs"
                  onChange={(e) => patchBlockAction(selBlock.id, { h: Number(e.target.value) }, "Redimensionar bloco")}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Use o editor para ajustar conteúdo, cores e estilos avançados deste bloco.
            </p>
          </div>
          <div className="border-t border-border/40 p-3">
            <Label className="text-[10px] uppercase text-muted-foreground">Notas do apresentador</Label>
            <Textarea
              rows={3}
              defaultValue={config?.speakerNotes ?? ""}
              onChange={(e) => setSpeakerNotesAction(e.target.value)}
              className="mt-1 resize-none border-transparent bg-transparent text-xs focus-visible:border-border"
              placeholder="Adicione anotações..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// (WelcomeScreen extracted to ./components/WelcomeScreen.tsx)

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Slides2() {
  usePageTitle("Slides 2.0");

  const items = useDeck((s) => s.items);
  const selectedId = useDeck((s) => s.selectedId);
  const transition = useDeck((s) => s.transition);
  const addItem = useDeck((s) => s.addItem);
  const updateItem = useDeck((s) => s.updateItem);
  const reorder = useDeck((s) => s.reorder);
  const select = useDeck((s) => s.select);
  const setTransition = useDeck((s) => s.setTransition);

  const pricingRows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const budgetRows = useBudget((s) => s.rows);
  const months = useMonthsInfo();
  useFyList(); // mantém atualizados
  const budgetMonths = useMemo(() => {
    const seen = new Map<string, { periodo: string; mes: number; ano: number }>();
    for (const r of budgetRows) {
      if (!seen.has(r.periodo)) seen.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano });
    }
    return Array.from(seen.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRows]);

  const [deckName, setDeckName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("slides2-deck-name")) || "",
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("slides2-deck-name", deckName);
  }, [deckName]);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [collabName, setCollabName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);

  // Garante seleção válida
  useEffect(() => {
    if (items.length > 0 && !items.find((i) => i.id === selectedId)) {
      select(items[0].id);
    }
    if (items.length === 0 && selectedId) select(null);
  }, [items, selectedId, select]);

  const currentItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const currentIdx = currentItem ? items.findIndex((i) => i.id === currentItem.id) : -1;

  // Canvas sizing
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const [areaSize, setAreaSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const PAD = 48;
  const factor = Math.min(
    (areaSize.w - PAD * 2) / CANVAS_W,
    (areaSize.h - PAD * 2) / CANVAS_H,
  );
  const displayW = Math.max(200, CANVAS_W * factor);
  const displayH = Math.max(100, CANVAS_H * factor);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    reorder(String(active.id), String(over.id));
  };

  // ------- Actions -------
  const goPrev = () => {
    if (currentIdx > 0) select(items[currentIdx - 1].id);
  };
  const goNext = () => {
    if (currentIdx >= 0 && currentIdx < items.length - 1) select(items[currentIdx + 1].id);
  };

  const addKindSlide = (kind: SlideKind) => {
    addItem(kind);
  };

  const handleChartType = (ct: CustomChartType) => {
    if (!currentItem || currentItem.kind !== "custom") {
      toast.message("Selecione um slide personalizado para adicionar gráfico.");
      return;
    }
    // addBlockAction cria block default — para chart, basta adicionar e o usuário muda o tipo no editor.
    // Como existe addChartBlockAction, usamos via import dinâmico para manter este arquivo enxuto.
    import("@/components/pricing/custom/editorStore").then((m) => {
      m.addChartBlockAction(ct);
    });
  };

  const addBlock = (kind: CustomBlockKind) => {
    if (!currentItem || currentItem.kind !== "custom") {
      toast.message("Selecione um slide personalizado para adicionar blocos.");
      return;
    }
    addBlockAction(kind);
  };

  // ------- Template apply (mesma lógica do SlidesBeta) -------
  const applyTemplate = (tpl: SlideTemplate) => {
    const built = tpl.build({ months, budgetMonths });
    if (built.length === 0) return;
    for (const slide of built) {
      addItem(slide.kind);
      const state = useDeck.getState();
      const created = state.items[state.items.length - 1];
      if (!created) continue;
      updateItem(created.id, () => ({ ...slide, id: created.id } as SlideItem));
    }
    toast.success(`Template "${tpl.name}" aplicado`);
  };

  // ------- Export -------
  const fileName = (deckName.trim() || "apresentacao") + ".pptx";

  const handleExportPptx = async () => {
    if (items.length === 0) return;
    if (!items.every((i) => isItemReady(i).ok)) {
      toast.error("Existem slides incompletos. Configure-os antes de exportar.");
      return;
    }
    setExporting(true);
    try {
      const flow = items.map((i) => itemToFlow(i, { pricingRows, budgetRows, metric }));
      await exportSlideFlow(flow, fileName);
      toast.success(`PPTX gerado com ${items.length} slide(s).`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PPTX.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (items.length === 0) return;
    setExporting(true);
    try {
      await exportToPdf(items, fileName);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const startCollab = () => {
    const name = collabName.trim() || "Convidado";
    setCollabName(name);
    setRoomId(Math.random().toString(36).slice(2, 10));
    setCollabOpen(false);
    toast.success("Sala criada (modo demonstração).");
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <Toolbar
          deckName={deckName}
          setDeckName={setDeckName}
          slidesCount={items.length}
          transition={transition}
          setTransition={(v) => setTransition(v as typeof transition)}
          roomActive={!!roomId}
          onTemplates={() => setGalleryOpen(true)}
          onCollab={() => setCollabOpen(true)}
          onExportPptx={handleExportPptx}
          onExportPdf={handleExportPdf}
          onPresent={() => setPresentationOpen(true)}
          exporting={exporting}
        />

        <div className="flex min-h-0 flex-1">
          {/* Strip lateral */}
          <aside className="flex w-32 flex-col border-r border-border/40 bg-card/40">
            <div className="flex h-8 items-center justify-between pl-3 pr-1">
              <span className="text-xs font-medium text-muted-foreground">Slides</span>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6"
                onClick={() => addKindSlide("custom")}
                aria-label="Adicionar slide"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <StripThumb
                        key={it.id}
                        item={it}
                        index={idx}
                        selected={it.id === selectedId}
                        onSelect={() => select(it.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="mt-2 flex justify-center">
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 rounded-full border border-border/40"
                  onClick={() => addKindSlide("custom")}
                  aria-label="Adicionar slide"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </aside>

          {/* Canvas area */}
          <div
            ref={canvasAreaRef}
            className="group relative flex-1 overflow-hidden bg-background/50"
          >
            {items.length === 0 ? (
              <WelcomeScreen
                onOpenGallery={() => setGalleryOpen(true)}
                onNewBlankSlide={() => addKindSlide("custom")}
              />
            ) : currentItem ? (
              <>
                <div
                  style={{
                    width: displayW,
                    height: displayH,
                    marginLeft: Math.max(0, (areaSize.w - displayW) / 2),
                    marginTop: Math.max(0, (areaSize.h - displayH) / 2),
                    boxShadow:
                      "0 32px 64px -16px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "#fff",
                    position: "relative",
                  }}
                >
                  {currentItem.kind === "custom" ? (
                    <div
                      style={{
                        width: CANVAS_W,
                        height: CANVAS_H,
                        transform: `scale(${factor})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <CustomSlideEditor
                        slideId={currentItem.id}
                        config={currentItem.config}
                        onChange={(cfg) =>
                          updateItem(currentItem.id, (s) =>
                            s.kind === "custom" ? { ...s, config: cfg } : s,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <ScaledPreview item={currentItem} targetWidth={displayW} />
                  )}
                </div>

                {/* Block palette flutuante */}
                <div
                  className="absolute flex w-10 flex-col gap-0.5 rounded-2xl border border-border/40 bg-card/90 p-1.5 backdrop-blur-xl"
                  style={{ left: 12, top: "50%", transform: "translateY(-50%)" }}
                >
                  <PaletteBtn icon={GitBranch} label="Bridge PVM" onClick={() => addKindSlide("bridge_pvm")} />
                  <PaletteBtn icon={Target} label="Budget Evolutivo" onClick={() => addKindSlide("budget_evo")} />
                  <PaletteBtn icon={BookOpen} label="Capa / Divisor" onClick={() => addKindSlide("cover")} />
                  <hr className="my-1 border-border/30" />
                  <PaletteBtn icon={Type} label="Título" onClick={() => addBlock("title")} />
                  <PaletteBtn icon={AlignLeft} label="Texto" onClick={() => addBlock("text")} />
                  <PaletteBtn icon={Hash} label="KPI" onClick={() => addBlock("kpi")} />
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md transition-all hover:scale-110 hover:bg-primary/10"
                        aria-label="Gráfico"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" className="w-44 p-1">
                      {CHART_TYPES.map((ct) => (
                        <button
                          key={ct.value}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => handleChartType(ct.value)}
                        >
                          {ct.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <PaletteBtn icon={Table2} label="Tabela" onClick={() => addBlock("table")} />
                  <PaletteBtn icon={Trophy} label="Ranking" onClick={() => addBlock("topSku")} />
                  <PaletteBtn icon={ImageIcon} label="Imagem" onClick={() => addBlock("image")} />
                  <PaletteBtn icon={Square} label="Forma" onClick={() => addBlock("shape")} />
                </div>

                {/* Setas de navegação */}
                {currentIdx > 0 && (
                  <button
                    onClick={goPrev}
                    className="absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/40 bg-card/70 opacity-0 backdrop-blur transition-opacity duration-150 hover:bg-card group-hover:opacity-100"
                    style={{ left: 72 }}
                    aria-label="Slide anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {currentIdx < items.length - 1 && (
                  <button
                    onClick={goNext}
                    className="absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/40 bg-card/70 opacity-0 backdrop-blur transition-opacity duration-150 hover:bg-card group-hover:opacity-100"
                    style={{ right: 16 }}
                    aria-label="Próximo slide"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}

                {/* Posição */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border/40 bg-card/70 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur">
                  {currentIdx + 1} / {items.length}
                </div>
              </>
            ) : null}
          </div>

          {/* Inspector */}
          <Inspector slideId={selectedId} />
        </div>

        {/* Templates */}
        <TemplateGallery
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          ctx={{ months, budgetMonths }}
          onSelect={applyTemplate}
        />

        {/* Apresentação */}
        {presentationOpen && (
          <PresentationMode
            currentSlideId={selectedId}
            currentConfig={currentItem?.kind === "custom" ? currentItem.config : undefined}
            onClose={() => setPresentationOpen(false)}
          />
        )}

        {/* Collab */}
        <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-primary" /> Iniciar colaboração
              </DialogTitle>
              <DialogDescription>
                Crie uma sala para colaborar em tempo real.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="collab-name-2" className="text-xs">Seu nome</Label>
              <Input
                id="collab-name-2"
                value={collabName}
                onChange={(e) => setCollabName(e.target.value)}
                placeholder="Ex.: Alice"
                onKeyDown={(e) => { if (e.key === "Enter") startCollab(); }}
                autoFocus
              />
              {roomId && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Sala ativa: <span className="font-mono text-foreground">{roomId}</span>
                </p>
              )}
              <Button className="w-full mt-2" onClick={startCollab}>Criar sala</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
