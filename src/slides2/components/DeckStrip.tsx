// DeckStrip — strip lateral de thumbnails do Slides 2.0.
import { useState } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import { ScaledPreview } from "@/components/pricing/SlidePreview";
import type { SlideItem } from "@/lib/slidesFlow";
import type { CollabUser } from "@/lib/collaboration";
import { initials } from "@/lib/kanban";

export interface DeckStripProps {
  items: SlideItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  collaborators?: CollabUser[];
}

function itemBlockCount(item: SlideItem): number {
  if (item.kind === "custom") return item.config.blocks?.length ?? 0;
  return 0;
}

interface StripItemProps {
  item: SlideItem;
  index: number;
  selected: boolean;
  presentCollab?: CollabUser;
  onSelect: () => void;
  onDuplicate: () => void;
  onRequestRemove: () => void;
}

function StripItem({
  item, index, selected, presentCollab,
  onSelect, onDuplicate, onRequestRemove,
}: StripItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const collabBorder = presentCollab?.color;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          onClick={onSelect}
          className="group relative cursor-pointer px-2 py-1.5"
        >
          <div
            className={cn(
              "relative aspect-video w-full overflow-hidden rounded-sm bg-card",
              selected
                ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "ring-1 ring-border/40 hover:ring-border/60",
            )}
            style={collabBorder && !selected ? { boxShadow: `0 0 0 2px ${collabBorder}` } : undefined}
          >
            <div className="pointer-events-none">
              <ScaledPreview item={item} targetWidth={104} />
            </div>

            <span className="absolute left-1 top-1 rounded-sm bg-background/80 px-1 text-[8px] font-medium backdrop-blur">
              {index + 1}
            </span>

            {presentCollab && (
              <span
                className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-semibold text-white"
                style={{ background: presentCollab.color }}
                title={presentCollab.name}
              >
                {initials(presentCollab.name)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            {...listeners}
            {...attributes}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
            aria-label="Reordenar"
          >
            <GripVertical className="h-2.5 w-2.5" />
          </button>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={onDuplicate}>Duplicar slide</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={onRequestRemove}
          className="text-destructive focus:text-destructive"
        >
          Remover slide
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function DeckStrip({
  items, selectedId, onSelect, onAdd, onRemove, onDuplicate, onReorder,
  collaborators,
}: DeckStripProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  // Mapa slideId → primeiro colaborador presente
  const collabBySlide = new Map<string, CollabUser>();
  for (const c of collaborators ?? []) {
    if (c.slideId && !collabBySlide.has(c.slideId)) collabBySlide.set(c.slideId, c);
  }

  const itemToRemove = confirmId ? items.find((i) => i.id === confirmId) ?? null : null;
  const needsConfirm = !!itemToRemove && itemBlockCount(itemToRemove) > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex h-full w-32 flex-col overflow-x-hidden border-r border-border/30 bg-card/30"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        {/* Header */}
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/30 px-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Slides
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-5 w-5"
                onClick={onAdd}
                aria-label="Novo slide"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Novo slide</TooltipContent>
          </Tooltip>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div>
                {items.map((it, idx) => (
                  <StripItem
                    key={it.id}
                    item={it}
                    index={idx}
                    selected={it.id === selectedId}
                    presentCollab={collabBySlide.get(it.id)}
                    onSelect={() => onSelect(it.id)}
                    onDuplicate={() => onDuplicate(it.id)}
                    onRequestRemove={() => {
                      if (itemBlockCount(it) > 0) setConfirmId(it.id);
                      else onRemove(it.id);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Botão + sticky */}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-8 w-full shrink-0 items-center justify-center border-t border-border/30 bg-card/20 text-muted-foreground transition-colors hover:bg-card/40 hover:text-foreground"
          aria-label="Adicionar slide"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </aside>

      <AlertDialog open={needsConfirm} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este slide?</AlertDialogTitle>
            <AlertDialogDescription>
              O slide possui {itemToRemove ? itemBlockCount(itemToRemove) : 0} bloco(s) configurado(s).
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmId) onRemove(confirmId);
                setConfirmId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

export default DeckStrip;
