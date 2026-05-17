// ============================================================================
// Slides (Beta) — orquestrador de exportação multi-slide
//
// Fluxo:
//  1. Usuário arrasta slides do "Catálogo" para a "Esteira" (drop zone)
//  2. Cada slide tem painel de configuração próprio (filtros + parâmetros)
//  3. Pode salvar a esteira como Pré-definição (localStorage)
//  4. Exporta tudo num único PPTX preservando a ordem
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { toast } from "sonner";
import {
  ArrowRight, BookOpen, Bookmark, ChevronLeft, ChevronRight, Copy, Download, FileText, Filter as FilterIcon,
  GitBranch, GripVertical, Layers, LayoutTemplate, MessageSquare, History, CheckCheck, Send, Plus, RotateCcw, Save, Sparkles, StickyNote, Target, Trash2, Users2, X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import { useSlidesFlow } from "@/store/slidesFlow";
import {
  SLIDE_CATALOG, defaultItem, isItemReady, itemToFlow, metaOf,
  type SlideItem, type SlideKind,
} from "@/lib/slidesFlow";
import { exportSlideFlow } from "@/lib/exportPpt";
import { exportToPdf } from "@/lib/exportPdf";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { SlidePreview, ScaledPreview } from "@/components/pricing/SlidePreview";
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { TemplateGallery } from "@/components/pricing/custom/TemplateGallery";
import type { SlideTemplate } from "@/lib/slideTemplates";
import { usePageTitle } from "@/hooks/use-page-title";
import { useCollaboration } from "@/hooks/use-collaboration";
import type { CollabUser } from "@/lib/collaboration";
import { initials } from "@/lib/kanban";
import { Switch } from "@/components/ui/switch";
import {
  addComment, resolveComment, getComments, getUnresolvedCount, subscribe as subscribeComments,
  type SlideComment,
} from "@/lib/slideComments";
import { readLog, clearLog, subscribeLog, type ChangeLogEntry } from "@/lib/slideChangeLog";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";

// ----------------------------------------------------------------------------
// Smart defaults — calculados no momento de criar o slide a partir das bases
// disponíveis. Bridge: mês anterior vs último mês. Budget Evo: primeiro mês
// do FY anterior → último disponível.
// ----------------------------------------------------------------------------
function smartDefaults(
  kind: SlideKind,
  ctx: { months: { periodo: string; mes: number; ano: number }[]; budgetMonths: { periodo: string; mes: number; ano: number }[] },
): Partial<SlideItem["config"]> | null {
  if (kind === "bridge_pvm" && ctx.months.length >= 2) {
    const last = ctx.months[ctx.months.length - 1];
    const prev = ctx.months[ctx.months.length - 2];
    return { mode: "month", base: prev.periodo, comp: last.periodo, filters: {} } as never;
  }
  if (kind === "budget_evo" && ctx.budgetMonths.length > 0) {
    const last = ctx.budgetMonths[ctx.budgetMonths.length - 1];
    const fyStart = last.mes >= 4 ? last.ano : last.ano - 1;
    const prevFyStart = fyStart - 1;
    const defaultStart = `${String(4).padStart(3, "0")}.${prevFyStart}`;
    const has = ctx.budgetMonths.some((m) => m.periodo === defaultStart);
    return {
      start: has ? defaultStart : ctx.budgetMonths[0].periodo,
      end: last.periodo,
      filters: {},
    } as never;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const ICON_MAP = { GitBranch, Target, BookOpen, LayoutTemplate } as const;

const ACCENT_BG = {
  blue: "bg-primary/15 text-primary border-primary/30",
  amber: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  neutral: "bg-muted text-muted-foreground border-border/40",
} as const;

// Dimensões disponíveis para filtros por slide.
// Cada grupo é mostrado como um collapsible no painel.
const FILTER_GROUPS: Array<{
  title: string;
  variant: "comercial" | "sku" | "inovacao";
  keys: FilterKey[];
}> = [
  {
    title: "Comercial",
    variant: "comercial",
    keys: ["canal", "canalAjustado", "regiao", "uf", "regional", "mercado", "mercadoAjustado"],
  },
  {
    title: "Produto",
    variant: "sku",
    keys: ["marca", "categoria", "subcategoria", "formato", "sabor", "tecnologia", "faixaPeso", "sku"],
  },
  {
    title: "Inovação",
    variant: "inovacao",
    keys: ["inovacao", "legado"],
  },
];

const FILTER_LABEL: Record<FilterKey, string> = {
  marca: "Marca",
  canal: "Canal",
  canalAjustado: "Canal Ajustado",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  sku: "SKU",
  regiao: "Região",
  uf: "UF",
  regional: "Regional",
  mercado: "Mercado",
  mercadoAjustado: "Mercado Ajustado",
  sabor: "Sabor",
  tecnologia: "Tecnologia",
  faixaPeso: "Faixa de Peso",
  inovacao: "Inovação",
  legado: "Legado",
};

function uniqueValues(
  pricing: PricingRow[],
  budget: BudgetRow[],
  key: FilterKey,
): string[] {
  const set = new Set<string>();
  for (const r of pricing) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" && v) set.add(v);
  }
  for (const r of budget) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ----------------------------------------------------------------------------
// Drop zone vazio
// ----------------------------------------------------------------------------
function EmptyFlow({ onAdd, onOpenGallery, isOver }: { onAdd: (k: SlideKind) => void; onOpenGallery: () => void; isOver?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-8 overflow-hidden rounded-3xl border bg-gradient-to-b from-card/40 to-card/10 px-8 py-16 text-center animate-fade-in transition-colors",
        isOver ? "border-primary/70 bg-primary/[0.06]" : "border-border/40",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-64 opacity-60"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, hsl(var(--primary)/0.18), transparent 70%)" }}
      />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="relative max-w-md space-y-2">
        <h3 className="text-xl font-semibold tracking-tight">Comece sua apresentação</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isOver
            ? "Solte aqui para adicionar à esteira."
            : "Escolha um template pronto para começar em segundos — ou monte do zero arrastando slides do catálogo à esquerda."}
        </p>
      </div>
      <div className="relative flex flex-col sm:flex-row items-center gap-2">
        <Button size="lg" onClick={onOpenGallery} className="gap-2 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.6)]">
          <Sparkles className="h-4 w-4" />
          Nova apresentação
        </Button>
        <span className="text-xs text-muted-foreground">ou clique nos modelos abaixo</span>
      </div>
      <div className="relative grid w-full max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-4">
        {SLIDE_CATALOG.map((s) => {
          const Icon = ICON_MAP[s.icon];
          return (
            <button
              key={s.kind}
              onClick={() => onAdd(s.kind)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border/40 bg-card/50 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.4)]"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border transition-transform group-hover:scale-105", ACCENT_BG[s.accent])}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-xs font-medium leading-tight">{s.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Catálogo arrastável (sidebar esquerda)
function DraggableCatalogItem({
  kind,
  onClick,
}: {
  kind: SlideKind;
  onClick: () => void;
}) {
  const meta = metaOf(kind);
  const Icon = ICON_MAP[meta.icon];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalog:${kind}`,
    data: { source: "catalog", kind },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-start gap-2.5 rounded-xl border border-border/40 bg-card/40 p-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-card hover:shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.5)] cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", ACCENT_BG[meta.accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[13px] font-medium tracking-tight">
          <span className="truncate">{meta.title}</span>
          <Plus className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
          {meta.description}
        </p>
      </div>
    </button>
  );
}

// Wrapper droppable da esteira (aceita drops do catálogo em qualquer posição)
function FlowDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "flow-dropzone" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl transition-colors",
        isOver && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}


// ----------------------------------------------------------------------------
// Card sortable na esteira
// ----------------------------------------------------------------------------
function FlowCard({
  item,
  index,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
}: {
  item: SlideItem;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const ready = isItemReady(item);
  const filtersCount = (item.kind === "bridge_pvm" || item.kind === "budget_evo")
    ? Object.values(item.config.filters).filter((v) => v && v.length > 0).length
    : 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TooltipProvider delayDuration={500}>
    <Tooltip>
    <TooltipTrigger asChild>
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl border bg-card/60 px-2.5 py-2 transition-all duration-200 animate-fade-in",
        selected
          ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.35),_0_8px_24px_-12px_hsl(var(--primary)/0.35)]"
          : "border-border/40 hover:-translate-y-px hover:border-border/70 hover:bg-card hover:shadow-[0_4px_16px_-8px_hsl(0_0%_0%/0.4)]",
      )}
      onClick={onSelect}
    >
      <button
        className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="w-6 shrink-0 text-center text-[10px] font-semibold tabular-nums tracking-wider text-muted-foreground/70">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", ACCENT_BG[meta.accent])}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium tracking-tight">
          {item.label || meta.title}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {filtersCount > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <FilterIcon className="h-3 w-3" /> {filtersCount}
          </span>
        )}
        {!ready.ok && (
          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
            {ready.reason}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          aria-label="Duplicar"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
    </TooltipTrigger>
    <TooltipContent side="left" align="center" sideOffset={12} className="p-1.5 border border-border/60 bg-card">
      <div className="overflow-hidden rounded-md border border-border/40 bg-white" style={{ width: 200, height: 113 }}>
        <ScaledPreview item={item} targetWidth={200} />
      </div>
      <div className="mt-1 px-1 text-[10px] font-medium text-muted-foreground tabular-nums">
        Slide {index + 1} · {item.label || meta.title}
      </div>
    </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

// ----------------------------------------------------------------------------
// Painel de configuração de filtros
// ----------------------------------------------------------------------------
function FiltersPanel({
  value,
  onChange,
  pricing,
  budget,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  pricing: PricingRow[];
  budget: BudgetRow[];
}) {
  const setKey = (k: FilterKey, vals: string[]) => {
    const next = { ...value };
    if (vals.length === 0) delete next[k];
    else next[k] = vals;
    onChange(next);
  };

  const activeCount = Object.values(value).filter((v) => v && v.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FilterIcon className="h-4 w-4 text-primary" />
          Filtros do slide
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {activeCount} ativo(s)
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onChange({})}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      <Tabs defaultValue={FILTER_GROUPS[0].title} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-secondary/40">
          {FILTER_GROUPS.map((g) => (
            <TabsTrigger key={g.title} value={g.title} className="text-xs">
              {g.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {FILTER_GROUPS.map((g) => (
          <TabsContent key={g.title} value={g.title} className="mt-3 space-y-3">
            {g.keys.map((k) => {
              const opts = uniqueValues(pricing, budget, k).map((v) => ({ value: v, label: v }));
              if (opts.length === 0) return null;
              return (
                <div key={k} className="space-y-1">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {FILTER_LABEL[k]}
                  </Label>
                  <MultiSelectFilter
                    options={opts}
                    selected={value[k] ?? []}
                    onChange={(vals) => setKey(k, vals)}
                    variant={g.variant}
                  />
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Painéis de configuração específicos por tipo
// ----------------------------------------------------------------------------
function BridgePvmConfigPanel({
  item, onChange,
}: {
  item: Extract<SlideItem, { kind: "bridge_pvm" }>;
  onChange: (next: SlideItem) => void;
}) {
  const fyList = useFyList();
  const months = useMonthsInfo();
  const cfg = item.config;

  const options = cfg.mode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Modo</Label>
        <Select
          value={cfg.mode}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, mode: v as "fy" | "month", base: null, comp: null } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês a mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Base</Label>
          <Select
            value={cfg.base ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, base: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha..." /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.value === cfg.comp}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Comparação</Label>
          <Select
            value={cfg.comp ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, comp: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha..." /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.value === cfg.base}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function BudgetEvoConfigPanel({
  item, onChange,
}: {
  item: Extract<SlideItem, { kind: "budget_evo" }>;
  onChange: (next: SlideItem) => void;
}) {
  const budgetRows = useBudget((s) => s.rows);
  const months = useMemo(() => {
    const map = new Map<string, { periodo: string; mes: number; ano: number; label: string }>();
    for (const r of budgetRows) {
      if (!map.has(r.periodo)) {
        map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, label: `${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][r.mes-1]}/${String(r.ano).slice(-2)}` });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRows]);

  const cfg = item.config;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mês inicial</Label>
        <Select
          value={cfg.start ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, start: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Automático (FY anterior)</SelectItem>
            {months.map((m) => <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mês final</Label>
        <Select
          value={cfg.end ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, end: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Automático (último disponível)</SelectItem>
            {months.map((m) => <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CoverConfigPanel({
  item, onChange,
}: {
  item: Extract<SlideItem, { kind: "cover" }>;
  onChange: (next: SlideItem) => void;
}) {
  const cfg = item.config;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Estilo</Label>
        <Select
          value={cfg.variant}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, variant: v as "cover" | "divider" } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Capa principal (vermelha)</SelectItem>
            <SelectItem value="divider">Divisor de seção (branco)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Título</Label>
        <Input
          value={cfg.title}
          onChange={(e) => onChange({ ...item, config: { ...cfg, title: e.target.value } })}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Subtítulo (opcional)</Label>
        <Textarea
          value={cfg.subtitle ?? ""}
          onChange={(e) => onChange({ ...item, config: { ...cfg, subtitle: e.target.value } })}
          rows={2}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Trigger no inspector — abre o editor fullscreen ao nível da página.
// ----------------------------------------------------------------------------
function CustomSlideFullscreenTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border/40 bg-card/40 p-3 text-[12px] text-muted-foreground">
        O editor de slide personalizado abre em tela cheia, com strip lateral
        para navegar entre os slides do deck.
      </div>
      <Button onClick={onOpen} className="w-full gap-2" size="sm">
        <LayoutTemplate className="h-4 w-4" />
        Abrir editor em tela cheia
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Strip lateral de slides — thumbnails empilhados verticalmente, ordenáveis.
// ----------------------------------------------------------------------------
function StripThumbnail({
  item, index, active, onClick, editingUsers,
  currentUser, onAddComment,
}: {
  item: SlideItem;
  index: number;
  active: boolean;
  onClick: () => void;
  editingUsers?: CollabUser[];
  currentUser: { name: string; color: string };
  onAddComment?: (c: SlideComment) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const editors = editingUsers ?? [];
  const firstEditorColor = editors[0]?.color;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(firstEditorColor ? { borderColor: firstEditorColor, borderWidth: 2 } : {}),
  };
  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const hasNotes = !!((item.config as { speakerNotes?: string }).speakerNotes ?? "").trim();

  // Subscribe to comment changes so the badge updates live.
  const [, force] = useState(0);
  useEffect(() => subscribeComments(() => force((n) => n + 1)), []);
  const unresolvedCount = getUnresolvedCount(item.id);
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-md border bg-card transition-colors",
        active ? "border-primary ring-2 ring-primary/40" : "border-border/40 hover:border-border/80",
      )}
    >
      {hasNotes && (
        <div
          className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-sm"
          title="Possui anotações do apresentador"
        >
          <StickyNote className="h-2.5 w-2.5" />
        </div>
      )}
      <div className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5">
        <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
        <span className="truncate text-[9px] text-muted-foreground">{meta.title}</span>
      </div>
      <div className="thumb hidden min-[1200px]:block px-1 pb-1">
        <div className="pointer-events-none">
          <ScaledPreview item={item} targetWidth={104} />
        </div>
      </div>
      <div className="truncate px-1.5 pb-1.5 text-[10px] font-medium" title={item.label ?? meta.title}>
        {item.label ?? meta.title}
      </div>
      {editors.length > 1 && (
        <div
          className="absolute bottom-1 right-1 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm"
          style={{ background: firstEditorColor ?? "#333" }}
          title={`${editors.length} pessoas editando`}
        >
          +{editors.length - 1}
        </div>
      )}
    </div>
  );
}

function FullscreenCustomEditor({
  open, onOpenChange, collaborators, isConnected, updateCursor, updateSlideId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  collaborators?: CollabUser[];
  isConnected?: boolean;
  updateCursor?: (x: number, y: number) => void;
  updateSlideId?: (slideId: string | null) => void;
}) {
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const select = useSlidesFlow((s) => s.select);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const addItem = useSlidesFlow((s) => s.addItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const reorder = useSlidesFlow((s) => s.reorder);

  const current = items.find((i) => i.id === selectedId) ?? null;
  const idx = current ? items.findIndex((i) => i.id === current.id) : -1;
  const isCustom = current?.kind === "custom";

  // Se o slide selecionado deixou de ser custom, fecha o editor.
  useEffect(() => {
    if (open && current && !isCustom) onOpenChange(false);
  }, [open, current, isCustom, onOpenChange]);

  // Atualiza o slideId do usuário local no presence sempre que a seleção muda.
  useEffect(() => {
    if (!updateSlideId) return;
    if (open && isCustom && current) updateSlideId(current.id);
    else if (!open) updateSlideId(null);
  }, [open, current, isCustom, updateSlideId]);

  // Navegação sequencial (apenas slides custom).
  const goRel = (offset: number) => {
    if (idx < 0) return;
    const dir = offset > 0 ? 1 : -1;
    for (let i = idx + dir; i >= 0 && i < items.length; i += dir) {
      if (items[i].kind === "custom") { select(items[i].id); return; }
    }
  };
  const hasPrev = idx > 0 && items.slice(0, idx).some((i) => i.kind === "custom");
  const hasNext = idx >= 0 && items.slice(idx + 1).some((i) => i.kind === "custom");

  // Atalhos Ctrl/Cmd + ← / →. Capturamos antes do editor para evitar nudge.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); goRel(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); goRel(1); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, idx, items]);

  const stripSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onStripDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    reorder(String(e.active.id), String(e.over.id));
  };

  const handleAddBlank = () => {
    addItem("custom");
    const st = useSlidesFlow.getState();
    const created = st.items[st.items.length - 1];
    if (!created) return;
    // Move para logo após o slide atual, se houver.
    if (current && idx >= 0 && idx < items.length - 1) {
      const target = items[idx + 1];
      if (target) reorder(created.id, target.id);
    }
    select(created.id);
  };

  const handleRemoveCurrent = () => {
    if (!current) return;
    const hasContent = current.kind === "custom" && current.config.blocks.length > 0;
    if (hasContent && !confirm(`Remover "${current.label ?? "slide"}"? Os blocos serão perdidos.`)) return;
    const nextSel = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
    removeItem(current.id);
    if (nextSel) {
      const after = useSlidesFlow.getState().items.find((i) => i.id === nextSel);
      select(nextSel);
      if (after?.kind !== "custom") onOpenChange(false);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100vh] w-[100vw] max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:rounded-none"
        style={{ height: "100vh", maxHeight: "100vh" }}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-1">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(-1)} disabled={!hasPrev}>
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(1)} disabled={!hasNext}>
              Próximo <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <span className="hidden text-[10px] text-muted-foreground/70 lg:inline">
              Ctrl + ← / →
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <DialogTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {idx >= 0 ? `Slide ${idx + 1} de ${items.length}` : "Editor de slide"}
            </DialogTitle>
            {current && (
              <Input
                value={current.label ?? ""}
                onChange={(e) =>
                  updateItem(current.id, (it) => ({ ...it, label: e.target.value } as SlideItem))
                }
                placeholder="Nome do slide"
                className="h-8 w-72 border-transparent bg-transparent text-center text-sm font-medium hover:border-border/60 focus-visible:bg-card"
              />
            )}
          </div>
          <DialogDescription className="sr-only">
            Editor de slide personalizado com strip lateral de navegação.
          </DialogDescription>
          <div className="flex w-[200px] items-center justify-end gap-2">
            {isConnected && (
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            )}
            {(collaborators ?? []).length > 0 && (
              <TooltipProvider delayDuration={150}>
                <div className="flex items-center">
                  {(collaborators ?? []).slice(0, 4).map((c, i) => {
                    const slideIdx = items.findIndex((it) => it.id === c.slideId);
                    const tip = slideIdx >= 0
                      ? `${c.name} — editando slide ${slideIdx + 1}`
                      : `${c.name} — sem slide ativo`;
                    return (
                      <Tooltip key={c.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-medium text-white"
                            style={{ background: c.color, marginLeft: i === 0 ? 0 : -8 }}
                          >
                            {initials(c.name)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{tip}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {(collaborators ?? []).length > 4 && (
                    <div
                      className="ml-[-8px] flex h-7 min-w-[28px] items-center justify-center rounded-full border-2 border-background bg-muted px-1.5 text-[11px] font-medium text-foreground"
                    >
                      +{(collaborators ?? []).length - 4}
                    </div>
                  )}
                </div>
              </TooltipProvider>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Strip lateral */}
          <aside className="flex w-[120px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-card/30">
            <div className="border-b border-border/40 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Slides ({items.length})
            </div>
            <ScrollArea className="flex-1">
              <DndContext sensors={stripSensors} collisionDetection={closestCenter} onDragEnd={onStripDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5 p-1.5">
                    {items.map((it, i) => (
                      <StripThumbnail
                        key={it.id}
                        item={it}
                        index={i}
                        active={it.id === current?.id}
                        editingUsers={(collaborators ?? []).filter((c) => c.slideId === it.id)}
                        onClick={() => {
                          if (it.id === current?.id) return;
                          select(it.id);
                          if (it.kind !== "custom") onOpenChange(false);
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </ScrollArea>
            <div className="flex gap-1 border-t border-border/40 p-1.5">
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1"
                onClick={handleAddBlank}
                title="Adicionar slide em branco"
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1 text-destructive hover:text-destructive"
                onClick={handleRemoveCurrent}
                disabled={!current}
                title="Remover slide atual"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </aside>

          {/* Canvas do editor */}
          <div className="min-w-0 flex-1">
            {current && isCustom ? (
              <CustomSlideEditor
                key={current.id}
                slideId={current.id}
                config={(current as Extract<SlideItem, { kind: "custom" }>).config}
                onChange={(cfg) =>
                  updateItem(current.id, (it) =>
                    it.kind === "custom" ? ({ ...it, config: cfg } as SlideItem) : it,
                  )
                }
                collaborators={collaborators}
                onCursorMove={updateCursor}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Selecione um slide personalizado na strip ao lado.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Painel direito (inspector) — depende do slide selecionado
// ----------------------------------------------------------------------------
function Inspector({ item, onOpenFullscreen }: { item: SlideItem | null; onOpenFullscreen: () => void }) {
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground/60">
          <Layers className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-tight">Nenhum slide selecionado</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Selecione um slide na esteira para ver a prévia e ajustar filtros.
          </p>
        </div>
      </div>
    );
  }

  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", ACCENT_BG[meta.accent])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{meta.title}</div>
            <Input
              value={item.label ?? ""}
              onChange={(e) => updateItem(item.id, (it) => ({ ...it, label: e.target.value } as SlideItem))}
              placeholder={meta.title}
              className="-ml-2 h-8 border-transparent bg-transparent px-2 text-base font-medium hover:bg-secondary/40 focus-visible:bg-card"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>

        <Separator />

        {/* Live preview */}
        <SlidePreview item={item} />

        <Separator />

        {item.kind === "bridge_pvm" && (
          <BridgePvmConfigPanel item={item} onChange={(next) => updateItem(item.id, () => next)} />
        )}
        {item.kind === "budget_evo" && (
          <BudgetEvoConfigPanel item={item} onChange={(next) => updateItem(item.id, () => next)} />
        )}
        {item.kind === "cover" && (
          <CoverConfigPanel item={item} onChange={(next) => updateItem(item.id, () => next)} />
        )}
        {item.kind === "custom" && (
          <CustomSlideFullscreenTrigger onOpen={onOpenFullscreen} />
        )}

        {meta.supportsFilters && (item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
          <>
            <Separator />
            <FiltersPanel
              value={item.config.filters}
              onChange={(filters) => updateItem(item.id, (it) => {
                if (it.kind !== "bridge_pvm" && it.kind !== "budget_evo") return it;
                return { ...it, config: { ...it.config, filters } } as SlideItem;
              })}
              pricing={pricing}
              budget={budget}
            />
          </>
        )}

        <Separator />
        <SpeakerNotesInspector item={item} onChange={(notes) => updateItem(item.id, (it) => ({
          ...it,
          config: { ...(it.config as object), speakerNotes: notes },
        } as SlideItem))} />
      </div>
    </ScrollArea>
  );
}

function SpeakerNotesInspector({ item, onChange }: { item: SlideItem; onChange: (v: string) => void }) {
  const MAX = 500;
  const value = ((item.config as { speakerNotes?: string }).speakerNotes ?? "");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Anotações do apresentador
        </Label>
        <span className="text-[10px] tabular-nums text-muted-foreground">{value.length}/{MAX}</span>
      </div>
      <Textarea
        rows={4}
        value={value.slice(0, MAX)}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        placeholder="Adicione notas para o apresentador..."
        className="resize-none text-xs"
        maxLength={MAX}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diálogos de presets
// ----------------------------------------------------------------------------
function SavePresetDialog() {
  const items = useSlidesFlow((s) => s.items);
  const savePreset = useSlidesFlow((s) => s.savePreset);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
          disabled={items.length === 0}
          aria-label="Salvar pré-definição"
          title="Salvar pré-definição"
        >
          <Save className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar pré-definição</DialogTitle>
          <DialogDescription>
            Capture esta esteira de {items.length} slide(s) para reutilizar em apresentações futuras.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Check semanal de resultado"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Notas sobre quando usar esta pré-definição"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              const p = savePreset(name, description);
              toast.success(`Pré-definição "${p.name}" salva.`);
              setName(""); setDescription("");
              setOpen(false);
            }}
            disabled={!name.trim()}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresetsPanel() {
  const presets = useSlidesFlow((s) => s.presets);
  const loadPreset = useSlidesFlow((s) => s.loadPreset);
  const deletePreset = useSlidesFlow((s) => s.deletePreset);
  const overwritePreset = useSlidesFlow((s) => s.overwritePreset);

  if (presets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-secondary/10 px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhuma pré-definição salva ainda.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {presets
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => (
          <div key={p.id} className="group flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 p-2 transition-colors hover:border-border/70">
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {p.items.length} slide(s) · {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              title="Carregar"
              onClick={() => { loadPreset(p.id); toast.success(`"${p.name}" carregado.`); }}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              title="Sobrescrever com a esteira atual"
              onClick={() => { overwritePreset(p.id); toast.success(`"${p.name}" atualizado.`); }}
            >
              <Save className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
              title="Excluir"
              onClick={() => { if (confirm(`Excluir "${p.name}"?`)) deletePreset(p.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Página
// ----------------------------------------------------------------------------
export default function SlidesBeta() {
  usePageTitle("Slides");
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const select = useSlidesFlow((s) => s.select);
  const addItem = useSlidesFlow((s) => s.addItem);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const duplicateItem = useSlidesFlow((s) => s.duplicateItem);
  const duplicateDeck = useSlidesFlow((s) => s.duplicateDeck);
  const reorder = useSlidesFlow((s) => s.reorder);
  const clearItems = useSlidesFlow((s) => s.clearItems);

  const months = useMonthsInfo();
  const budgetRowsAll = useBudget((s) => s.rows);
  const budgetMonths = useMemo(() => {
    const map = new Map<string, { periodo: string; mes: number; ano: number }>();
    for (const r of budgetRowsAll) {
      if (!map.has(r.periodo)) map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano });
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRowsAll]);

  const addWithDefaults = (kind: SlideKind): string | null => {
    addItem(kind);
    // O zustand atualiza items síncronamente; pegamos o último item criado.
    const state = useSlidesFlow.getState();
    const created = state.items[state.items.length - 1];
    if (!created) return null;
    const def = smartDefaults(kind, { months, budgetMonths });
    if (def) {
      updateItem(created.id, (it) => ({
        ...it,
        config: { ...(it as any).config, ...def },
      } as SlideItem));
    }
    return created.id;
  };


  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState("apresentacao-pricing.pptx");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dragging, setDragging] = useState<{ source: "catalog"; kind: SlideKind } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // ====== Colaboração em tempo real ======
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabName, setCollabName] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("collab-username") ?? "",
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const setCollabBroadcast = useSlidesFlow((s) => s.setCollabBroadcast);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const name = params.get("name");
    if (room) setRoomId(room);
    if (name) setCollabName(decodeURIComponent(name));
  }, []);

  const { collaborators, isConnected, broadcast, updateCursor, updateSlideId, userId: collabUserId } = useCollaboration(
    roomId,
    collabName,
  );

  useEffect(() => {
    if (roomId) {
      setCollabBroadcast(broadcast, collabUserId);
    } else {
      setCollabBroadcast(null, null);
    }
    return () => setCollabBroadcast(null, null);
  }, [roomId, broadcast, collabUserId, setCollabBroadcast]);

  const startCollab = () => {
    const name = collabName.trim() || "Convidado";
    if (typeof window !== "undefined") {
      localStorage.setItem("collab-username", name);
    }
    setCollabName(name);
    const newRoom = Math.random().toString(36).slice(2, 10);
    setRoomId(newRoom);
    setCollabOpen(false);
  };

  const applyTemplate = (tpl: SlideTemplate) => {
    const built = tpl.build({ months, budgetMonths });
    if (built.length === 0) {
      // "Em Branco" — apenas fecha o modal.
      return;
    }
    // Insere cada slide via addItem + updateItem para reaproveitar a lógica
    // do store (sem precisar de uma nova action setItems).
    for (const slide of built) {
      addItem(slide.kind);
      const state = useSlidesFlow.getState();
      const created = state.items[state.items.length - 1];
      if (!created) continue;
      updateItem(created.id, () => ({ ...slide, id: created.id } as SlideItem));
    }
    toast.success(`Template "${tpl.name}" aplicado`);
  };

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const readyAll = items.every((i) => isItemReady(i).ok);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { source?: string; kind?: SlideKind } | undefined;
    if (data?.source === "catalog" && data.kind) setDragging({ source: "catalog", kind: data.kind });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { source?: string; kind?: SlideKind } | undefined;

    // Drop vindo do catálogo → adiciona à esteira
    if (activeData?.source === "catalog" && activeData.kind) {
      const newId = addWithDefaults(activeData.kind);
      if (!newId) return;
      // Se soltou sobre um item existente, move para essa posição
      const overId = String(over.id);
      const currentItems = useSlidesFlow.getState().items;
      const targetIdx = currentItems.findIndex((i) => i.id === overId);
      if (targetIdx >= 0 && overId !== newId) {
        reorder(newId, overId);
      }
      select(newId);
      return;
    }

    // Reordenação dentro da esteira
    if (active.id === over.id) return;
    reorder(String(active.id), String(over.id));
  };

  const handleExportPdf = async () => {
    if (items.length === 0) return;
    if (!readyAll) {
      toast.error("Existem slides incompletos. Configure-os antes de exportar.");
      return;
    }
    setExporting(true);
    try {
      const safeName = fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx`;
      await exportToPdf(items, safeName);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async () => {
    if (items.length === 0) return;
    if (!readyAll) {
      toast.error("Existem slides incompletos. Configure-os antes de exportar.");
      return;
    }
    setExporting(true);
    try {
      const flow = items.map((i) => itemToFlow(i, { pricingRows, budgetRows, metric }));
      const safeName = fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx`;
      await exportSlideFlow(flow, safeName);
      toast.success(`PPTX gerado com ${items.length} slide(s).`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PPTX.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Topbar
        title="Slides"
        subtitle="Monte uma apresentação combinando slides com filtros independentes"
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
      <div
        className={cn(
          "grid h-[calc(100vh-3.5rem)] min-h-0 gap-0 overflow-hidden",
          inspectorOpen
            ? "grid-cols-[240px_minmax(0,1fr)_300px] xl:grid-cols-[260px_minmax(0,1fr)_340px]"
            : "grid-cols-[240px_minmax(0,1fr)_36px] xl:grid-cols-[260px_minmax(0,1fr)_36px]",
        )}
      >
        {/* ===== Coluna esquerda: catálogo + presets ===== */}
        <aside className="flex min-h-0 flex-col border-r border-border/40 bg-sidebar/40">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-3">
              <div className="space-y-2">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  Slides disponíveis
                </div>
                <div className="flex flex-col gap-1.5">
                  {SLIDE_CATALOG.map((s) => (
                    <DraggableCatalogItem
                      key={s.kind}
                      kind={s.kind}
                      onClick={() => addWithDefaults(s.kind)}
                    />
                  ))}
                </div>
              </div>

              <Separator />

              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3 py-2 text-left transition-colors hover:border-border/70 hover:bg-card">
                    <Bookmark className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Pré-definições</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="w-72 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Bookmark className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">Pré-definições</span>
                  </div>
                  <PresetsPanel />
                </PopoverContent>
              </Popover>
            </div>
          </ScrollArea>
        </aside>

        {/* ===== Coluna central: esteira ===== */}
        <main className="flex flex-col overflow-hidden bg-background/60">
          {/* Header da esteira */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-card/30 px-4 py-2.5 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold tracking-tight">Esteira</h2>
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-semibold tabular-nums">
                {items.length} {items.length === 1 ? "slide" : "slides"}
              </Badge>
              {items.length > 0 && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
                  ~{Math.max(1, Math.round((items.length * 30) / 60))} min
                </span>
              )}
              {!readyAll && items.length > 0 && (
                <Badge variant="outline" className="h-5 border-warning/40 px-2 text-[10px] text-warning">
                  Incompleto
                </Badge>
              )}
              {roomId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  Ao vivo
                  {isConnected && collaborators.length > 0 && (
                    <span className="text-muted-foreground">· {collaborators.length}</span>
                  )}
                </span>
              )}
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => setGalleryOpen(true)}
                      aria-label="Abrir galeria de templates"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Templates
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Galeria de templates</TooltipContent>
                </Tooltip>
                <SavePresetDialog />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => setCollabOpen(true)}
                      aria-label="Iniciar colaboração"
                    >
                      <Users2 className="h-3.5 w-3.5" />
                      Colaborar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {roomId ? `Sala ativa: ${roomId}` : "Compartilhar sessão em tempo real"}
                  </TooltipContent>
                </Tooltip>
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => {
                          duplicateDeck();
                          toast.success(`Deck duplicado (${items.length} slides)`);
                        }}
                        aria-label="Duplicar deck"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicar deck inteiro</TooltipContent>
                  </Tooltip>
                )}
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => { if (confirm("Limpar a esteira atual?")) clearItems(); }}
                        aria-label="Limpar esteira"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Limpar esteira</TooltipContent>
                  </Tooltip>
                )}
                <div className="mx-1 h-5 w-px bg-border/50" />
                <TransitionSelect />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      aria-label="Nome do arquivo"
                      title={`Nome do arquivo: ${fileName}`}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-3">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Nome do arquivo
                    </Label>
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="mt-1.5 h-9 text-sm"
                      placeholder="apresentacao.pptx"
                    />
                  </PopoverContent>
                </Popover>
                <div className="inline-flex items-center rounded-md shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]">
                  <Button
                    size="sm" className="h-8 gap-2 rounded-r-none"
                    disabled={items.length === 0 || exporting || !readyAll}
                    onClick={handleExport}
                  >
                    <Download className="h-4 w-4" />
                    {exporting ? "Gerando..." : "Exportar PPTX"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 rounded-l-none border-l border-primary-foreground/20 px-2"
                        disabled={items.length === 0 || exporting || !readyAll}
                        aria-label="Mais formatos de exportação"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExport} disabled={exporting}>
                        <Download className="mr-2 h-4 w-4" /> Exportar PPTX
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPdf} disabled={exporting}>
                        <FileText className="mr-2 h-4 w-4" /> Exportar PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </TooltipProvider>
          </div>

          {/* Conteúdo da esteira */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-2xl px-4 py-5">
              <FlowDropZone>
                {items.length === 0 ? (
                  <EmptyFlow onAdd={addWithDefaults} onOpenGallery={() => setGalleryOpen(true)} />
                ) : (
                  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <FlowCard
                          key={item.id}
                          item={item}
                          index={idx}
                          selected={selectedId === item.id}
                          onSelect={() => select(item.id)}
                          onRemove={() => removeItem(item.id)}
                          onDuplicate={() => duplicateItem(item.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </FlowDropZone>
            </div>
          </ScrollArea>
        </main>

        {/* ===== Coluna direita: inspector (recolhível) ===== */}
        <aside className="relative flex min-h-0 flex-col overflow-hidden border-l border-border/40 bg-sidebar/40">
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className="absolute left-0 top-20 z-10 flex h-9 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-md transition-all hover:scale-105 hover:text-foreground"
            aria-label={inspectorOpen ? "Recolher painel" : "Expandir painel"}
            title={inspectorOpen ? "Recolher prévia e filtros" : "Expandir prévia e filtros"}
          >
            {inspectorOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
          {inspectorOpen ? (
            <Inspector item={selected} onOpenFullscreen={() => setFullscreenOpen(true)} />
          ) : (
            <div className="flex h-full items-center justify-center px-1 text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground/70 [writing-mode:vertical-rl]">
              Prévia & Filtros
            </div>
          )}
        </aside>
      </div>
      <DragOverlay>
        {dragging ? (() => {
          const meta = metaOf(dragging.kind);
          const Icon = ICON_MAP[meta.icon];
          return (
            <div className="flex items-center gap-2 rounded-xl border border-primary/50 bg-card px-3 py-2 shadow-xl">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", ACCENT_BG[meta.accent])}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{meta.title}</span>
            </div>
          );
        })() : null}
      </DragOverlay>
      </DndContext>
      <TemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        ctx={{ months, budgetMonths }}
        onSelect={applyTemplate}
      />
      <FullscreenCustomEditor
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        collaborators={collaborators}
        isConnected={isConnected}
        updateCursor={updateCursor}
        updateSlideId={updateSlideId}
      />

      <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              Iniciar colaboração
            </DialogTitle>
            <DialogDescription>
              Compartilhe o link da sala — alterações no deck aparecem em tempo real para todos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collab-name" className="text-xs">Seu nome</Label>
            <Input
              id="collab-name"
              value={collabName}
              onChange={(e) => setCollabName(e.target.value)}
              placeholder="Ex.: Alice"
              onKeyDown={(e) => {
                if (e.key === "Enter") startCollab();
              }}
              autoFocus
            />
            {roomId && (
              <p className="pt-2 text-xs text-muted-foreground">
                Sala ativa: <span className="font-mono text-foreground">{roomId}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            {roomId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRoomId(null);
                  setCollabOpen(false);
                }}
              >
                Encerrar sala
              </Button>
            )}
            <Button onClick={startCollab}>
              {roomId ? "Nova sala" : "Iniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----------------------------------------------------------------------------
// TransitionSelect — chooses the deck-wide slide transition.
// ----------------------------------------------------------------------------
function TransitionSelect() {
  const transition = useSlidesFlow((s) => s.transition);
  const setTransition = useSlidesFlow((s) => s.setTransition);
  return (
    <Select value={transition} onValueChange={(v) => setTransition(v as never)}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Transição entre slides">
        <SelectValue placeholder="Transição" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem transição</SelectItem>
        <SelectItem value="fade">Fade</SelectItem>
        <SelectItem value="slide-left">Deslizar (←)</SelectItem>
        <SelectItem value="slide-up">Subir (↑)</SelectItem>
        <SelectItem value="zoom">Zoom</SelectItem>
      </SelectContent>
    </Select>
  );
}
