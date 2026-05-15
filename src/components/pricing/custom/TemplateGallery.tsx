// Galeria visual de templates de apresentação. Modal que abre na tela vazia
// ou pelo botão "Templates" da toolbar.
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import {
  SLIDE_TEMPLATES, TEMPLATE_CATEGORIES,
  type TemplateCtx, type TemplateCategory, type SlideTemplate,
} from "@/lib/slideTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: TemplateCtx;
  onSelect: (template: SlideTemplate) => void;
}

export function TemplateGallery({ open, onOpenChange, ctx, onSelect }: Props) {
  const [category, setCategory] = useState<"Todos" | TemplateCategory>("Todos");

  const filtered = useMemo(
    () => category === "Todos"
      ? SLIDE_TEMPLATES
      : SLIDE_TEMPLATES.filter((t) => t.category === category),
    [category],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            Comece com um template
          </DialogTitle>
          <DialogDescription>
            Escolha um modelo pronto e personalize. Os períodos são preenchidos automaticamente com os dados disponíveis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 px-6 py-3 border-b border-border/40 bg-muted/20">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 max-h-[calc(88vh-160px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {filtered.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} onSelect={() => {
                onSelect(tpl);
                onOpenChange(false);
              }} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template, onSelect }: { template: SlideTemplate; onSelect: () => void }) {
  const Thumb = template.thumbnail;
  return (
    <div
      className="group relative rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-primary hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.5)]"
    >
      <div className="aspect-video rounded-lg overflow-hidden border border-border/40 bg-muted/30">
        <Thumb className="w-full h-full" />
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{template.name}</h3>
          <Badge variant="outline" className="shrink-0 h-5 text-[10px] font-normal">
            {template.category}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {template.description}
        </p>
      </div>
      <div className="absolute inset-0 flex items-end justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-card via-card/80 to-transparent rounded-xl">
        <Button size="sm" onClick={onSelect} className="shadow-md">
          Usar este template
        </Button>
      </div>
    </div>
  );
}
