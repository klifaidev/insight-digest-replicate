import { useEffect, useMemo, useRef, useState } from "react";
import {
  KanbanCard,
  KanbanColumn,
  KanbanState,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  Priority,
  COLUMN_ACCENTS,
  avatarHue,
  defaultState,
  dueStatus,
  formatDueShort,
  initials,
  loadState,
  newId,
  saveState,
} from "@/lib/kanban";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag as TagIcon,
  Flag,
  X,
  GripVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  Kanban,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/use-page-title";

type ViewMode = "kanban" | "list" | "calendar";
const VIEW_STORAGE_KEY = "atividades-viewmode";

/* ---------------------------------------------------------------- */
/* PAGE                                                              */
/* ---------------------------------------------------------------- */
export default function Atividades() {
  usePageTitle("Atividades");
  const [state, setState] = useState<KanbanState>(() => loadState());
  const [editingCard, setEditingCard] = useState<{ card?: KanbanCard; columnId: string } | null>(null);
  const [dragCard, setDragCard] = useState<{ cardId: string; fromCol: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ colId: string; index: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === "kanban" || v === "list" || v === "calendar") return v;
    } catch {
      /* noop */
    }
    return "kanban";
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* noop */
    }
  }, [viewMode]);

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  const totalCards = Object.keys(state.cards).length;
  const doneCards = useMemo(() => {
    // heuristic: last column counts as "done"
    const last = state.columns[state.columns.length - 1];
    return last ? last.cardIds.length : 0;
  }, [state.columns]);

  /* ---------- column ops ---------- */
  function addColumn() {
    setState((s) => ({
      ...s,
      columns: [
        ...s.columns,
        { id: newId("col"), title: "Nova coluna", accent: "220 12% 65%", cardIds: [] },
      ],
    }));
  }
  function updateColumn(colId: string, patch: Partial<KanbanColumn>) {
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    }));
  }
  function deleteColumn(colId: string) {
    setState((s) => {
      const col = s.columns.find((c) => c.id === colId);
      if (!col) return s;
      const newCards = { ...s.cards };
      col.cardIds.forEach((id) => delete newCards[id]);
      return {
        cards: newCards,
        columns: s.columns.filter((c) => c.id !== colId),
      };
    });
  }

  /* ---------- card ops ---------- */
  function saveCard(card: KanbanCard, columnId: string) {
    setState((s) => {
      const exists = !!s.cards[card.id];
      const cards = { ...s.cards, [card.id]: card };
      let columns = s.columns;
      if (!exists) {
        columns = s.columns.map((c) =>
          c.id === columnId ? { ...c, cardIds: [...c.cardIds, card.id] } : c,
        );
      }
      return { cards, columns };
    });
  }
  function deleteCard(cardId: string) {
    setState((s) => {
      const cards = { ...s.cards };
      delete cards[cardId];
      return {
        cards,
        columns: s.columns.map((c) => ({
          ...c,
          cardIds: c.cardIds.filter((id) => id !== cardId),
        })),
      };
    });
  }

  /* ---------- DnD ---------- */
  function moveCard(cardId: string, fromCol: string, toCol: string, toIndex: number) {
    setState((s) => {
      const columns = s.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] }));
      const from = columns.find((c) => c.id === fromCol);
      const to = columns.find((c) => c.id === toCol);
      if (!from || !to) return s;
      const idx = from.cardIds.indexOf(cardId);
      if (idx >= 0) from.cardIds.splice(idx, 1);
      const insertAt = Math.min(toIndex, to.cardIds.length);
      to.cardIds.splice(insertAt, 0, cardId);
      return { ...s, columns };
    });
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-8 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Workspace
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Atividades</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-4 px-3 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                {totalCards} {totalCards === 1 ? "atividade" : "atividades"}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {doneCards} concluída{doneCards === 1 ? "" : "s"}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => setEditingCard({ columnId: state.columns[0]?.id ?? "" })}
              className="gap-1.5 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
              disabled={state.columns.length === 0}
            >
              <Plus className="h-4 w-4" />
              Nova atividade
            </Button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex w-full gap-4 overflow-x-auto px-8 pb-10 pt-6">
        {state.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={column.cardIds.map((id) => state.cards[id]).filter(Boolean)}
            isDragOver={dragOver?.colId === column.id}
            dragOverIndex={dragOver?.colId === column.id ? dragOver.index : -1}
            onAddCard={() => setEditingCard({ columnId: column.id })}
            onEditCard={(c) => setEditingCard({ card: c, columnId: column.id })}
            onDeleteCard={deleteCard}
            onUpdateColumn={(patch) => updateColumn(column.id, patch)}
            onDeleteColumn={() => deleteColumn(column.id)}
            onCardDragStart={(cardId) => setDragCard({ cardId, fromCol: column.id })}
            onCardDragEnd={() => {
              setDragCard(null);
              setDragOver(null);
            }}
            onColumnDragOver={(index) => {
              if (!dragCard) return;
              setDragOver({ colId: column.id, index });
            }}
            onColumnDrop={(index) => {
              if (!dragCard) return;
              moveCard(dragCard.cardId, dragCard.fromCol, column.id, index);
              setDragCard(null);
              setDragOver(null);
            }}
          />
        ))}

        {/* Add column */}
        <button
          type="button"
          onClick={addColumn}
          className="group flex h-14 w-[280px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Adicionar coluna
        </button>
      </div>

      {/* Dialog */}
      <CardDialog
        open={!!editingCard}
        onOpenChange={(o) => !o && setEditingCard(null)}
        initial={editingCard?.card}
        columnId={editingCard?.columnId ?? ""}
        columns={state.columns}
        onSave={(card, colId) => {
          saveCard(card, colId);
          setEditingCard(null);
        }}
        onMove={(card, toColId) => {
          // when moving via dialog, find current column then move
          const fromCol = state.columns.find((c) => c.cardIds.includes(card.id));
          if (fromCol && fromCol.id !== toColId) {
            moveCard(card.id, fromCol.id, toColId, state.columns.find((c) => c.id === toColId)?.cardIds.length ?? 0);
          }
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* COLUMN                                                            */
/* ---------------------------------------------------------------- */
interface ColumnProps {
  column: KanbanColumn;
  cards: KanbanCard[];
  isDragOver: boolean;
  dragOverIndex: number;
  onAddCard: () => void;
  onEditCard: (c: KanbanCard) => void;
  onDeleteCard: (id: string) => void;
  onUpdateColumn: (patch: Partial<KanbanColumn>) => void;
  onDeleteColumn: () => void;
  onCardDragStart: (cardId: string) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (index: number) => void;
  onColumnDrop: (index: number) => void;
}

function Column(props: ColumnProps) {
  const {
    column,
    cards,
    isDragOver,
    dragOverIndex,
    onAddCard,
    onEditCard,
    onDeleteCard,
    onUpdateColumn,
    onDeleteColumn,
    onCardDragStart,
    onCardDragEnd,
    onColumnDragOver,
    onColumnDrop,
  } = props;

  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  useEffect(() => setTitleDraft(column.title), [column.title]);

  return (
    <div
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl transition-colors",
        isDragOver && "border-primary/40 bg-primary/[0.04]",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (cards.length === 0) onColumnDragOver(0);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (cards.length === 0) onColumnDrop(0);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: `hsl(${column.accent})` }}
        />
        {editTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim()) onUpdateColumn({ title: titleDraft.trim() });
              setEditTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitleDraft(column.title);
                setEditTitle(false);
              }
            }}
            className="flex-1 rounded-md bg-transparent px-1 text-sm font-medium outline-none ring-1 ring-primary/40"
          />
        ) : (
          <button
            onClick={() => setEditTitle(true)}
            className="flex-1 cursor-text truncate text-left text-sm font-medium"
          >
            {column.title}
          </button>
        )}
        <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {cards.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditTitle(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Renomear
            </DropdownMenuItem>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cor
            </div>
            <div className="grid grid-cols-7 gap-1 px-2 pb-2">
              {COLUMN_ACCENTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => onUpdateColumn({ accent: a.value })}
                  title={a.label}
                  className={cn(
                    "h-5 w-5 rounded-full border border-border/40 transition-transform hover:scale-110",
                    column.accent === a.value && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                  )}
                  style={{ backgroundColor: `hsl(${a.value})` }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteColumn}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Excluir coluna
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
        {cards.map((card, i) => (
          <div key={card.id}>
            {isDragOver && dragOverIndex === i && <DropIndicator />}
            <CardItem
              card={card}
              onEdit={() => onEditCard(card)}
              onDelete={() => onDeleteCard(card.id)}
              onDragStart={() => onCardDragStart(card.id)}
              onDragEnd={onCardDragEnd}
              onDragOverItem={() => onColumnDragOver(i)}
              onDropOnItem={() => onColumnDrop(i)}
            />
          </div>
        ))}
        {/* trailing drop zone */}
        <div
          className="min-h-[24px] flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            onColumnDragOver(cards.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onColumnDrop(cards.length);
          }}
        >
          {isDragOver && dragOverIndex >= cards.length && <DropIndicator />}
        </div>

        {/* Add card */}
        <button
          type="button"
          onClick={onAddCard}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova atividade
        </button>
      </div>
    </div>
  );
}

function DropIndicator() {
  return <div className="my-0.5 h-0.5 rounded-full bg-primary/70" />;
}

/* ---------------------------------------------------------------- */
/* CARD                                                              */
/* ---------------------------------------------------------------- */
interface CardItemProps {
  card: KanbanCard;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverItem: () => void;
  onDropOnItem: () => void;
}

function CardItem({
  card,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverItem,
  onDropOnItem,
}: CardItemProps) {
  const [hover, setHover] = useState(false);
  const status = dueStatus(card.dueDate);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverItem();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnItem();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onEdit}
      className="group cursor-pointer rounded-xl border border-border/40 bg-card/80 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-border/70 hover:bg-card hover:shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
    >
      {/* Top row: title + actions */}
      <div className="flex items-start gap-2">
        <GripVertical
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-opacity",
            hover ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
          {card.title || <span className="italic text-muted-foreground">Sem título</span>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Excluir esta atividade?")) onDelete();
          }}
          className={cn(
            "rounded p-0.5 text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive",
            hover ? "opacity-100" : "opacity-0",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {card.description && (
        <p className="mt-1.5 line-clamp-2 pl-5 text-[11.5px] leading-relaxed text-muted-foreground">
          {card.description}
        </p>
      )}

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-5">
          {card.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border/40 bg-muted/30 px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      {(card.dueDate || card.assignee || card.priority) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 pl-5">
          <div className="flex items-center gap-1.5">
            {card.priority && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
                  PRIORITY_TONE[card.priority],
                )}
              >
                <Flag className="h-2.5 w-2.5" />
                {PRIORITY_LABEL[card.priority]}
              </span>
            )}
            {card.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                  status === "overdue" && "bg-destructive/15 text-destructive",
                  status === "today" && "bg-warning/15 text-warning",
                  status === "soon" && "bg-primary/15 text-primary",
                  status === "later" && "bg-muted/40 text-muted-foreground",
                )}
              >
                {status === "overdue" ? (
                  <AlertCircle className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
                )}
                {formatDueShort(card.dueDate)}
              </span>
            )}
          </div>
          {card.assignee && <Avatar name={card.assignee} />}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const hue = avatarHue(name);
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold text-white shadow-sm ring-2 ring-card"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 30) % 360} 70% 45%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* DIALOG                                                            */
/* ---------------------------------------------------------------- */
interface CardDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KanbanCard;
  columnId: string;
  columns: KanbanColumn[];
  onSave: (card: KanbanCard, columnId: string) => void;
  onMove: (card: KanbanCard, toColId: string) => void;
}

function CardDialog({
  open,
  onOpenChange,
  initial,
  columnId,
  columns,
  onSave,
  onMove,
}: CardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority | "none">("none");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [colId, setColId] = useState(columnId);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setDueDate(initial?.dueDate ? new Date(initial.dueDate + "T00:00:00") : undefined);
    setAssignee(initial?.assignee ?? "");
    setPriority(initial?.priority ?? "none");
    setTags(initial?.tags ?? []);
    setTagDraft("");
    setColId(columnId);
  }, [open, initial, columnId]);

  function addTag() {
    const v = tagDraft.trim();
    if (!v || tags.includes(v)) return;
    setTags((s) => [...s, v]);
    setTagDraft("");
  }

  function handleSave() {
    if (!title.trim() && !description.trim()) {
      onOpenChange(false);
      return;
    }
    const card: KanbanCard = {
      id: initial?.id ?? newId("card"),
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
      assignee: assignee.trim() || undefined,
      priority: priority === "none" ? undefined : priority,
      tags: tags.length ? tags : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(card, colId);
    if (initial && colId !== columnId) onMove(card, colId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription className="sr-only">
            Cadastre os dados da atividade
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
          <Textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none border-0 bg-muted/30 text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            {/* Coluna */}
            <Field label="Status">
              <Select value={colId} onValueChange={setColId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Coluna" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: `hsl(${c.accent})` }}
                        />
                        {c.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Prioridade */}
            <Field label="Prioridade">
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority | "none")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="med">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Prazo */}
            <Field label="Prazo">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : "Definir prazo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  {dueDate && (
                    <div className="border-t border-border p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setDueDate(undefined)}
                      >
                        Limpar prazo
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </Field>

            {/* Responsável */}
            <Field label="Responsável">
              <Input
                placeholder="Nome"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9"
              />
            </Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  <TagIcon className="h-2.5 w-2.5 text-muted-foreground" />
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length ? "" : "Adicionar tag e Enter"}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none"
              />
            </div>
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {initial ? "Salvar" : "Criar atividade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
