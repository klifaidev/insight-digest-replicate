import { Button } from "@/components/ui/button";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useSidebarState } from "@/store/sidebar";
import { cn } from "@/lib/utils";
import { InnovationToggle } from "./InnovationToggle";
import { Menu, Sparkles, CalendarRange } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const months = useMonthsInfo();
  const selected = usePricing((s) => s.selectedPeriods);
  const togglePeriod = usePricing((s) => s.togglePeriod);
  const setAll = usePricing((s) => s.setAllPeriods);

  const setSelected = usePricing((s) => s.setSelectedPeriods);

  const allSelected = selected === null;

  const handleMonthClick = (periodo: string, e: React.MouseEvent) => {
    // Shift/Ctrl/Cmd-click: toggle (multi-select). Plain click: select only this one.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      togglePeriod(periodo);
      return;
    }
    if (allSelected) {
      setSelected([periodo]);
      return;
    }
    // If only this one is selected, clicking again returns to "Todos"
    if (selected!.length === 1 && selected![0] === periodo) {
      setAll();
      return;
    }
    setSelected([periodo]);
  };

  const inovActive = usePricing((s) => s.filters.inovacao?.[0] === "Inovação");

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/60 px-8 py-4 backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gradient-primary">{title}</h1>
              {inovActive && (
                <span className="inline-flex animate-fade-in items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  <Sparkles className="h-3 w-3" />
                  Modo Inovação
                </span>
              )}
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <InnovationToggle />

        {months.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={allSelected ? "default" : "outline"}
              className={cn(
                "h-7 rounded-full px-3 text-xs",
                allSelected && "bg-primary/20 text-primary hover:bg-primary/25 border border-primary/30",
              )}
              onClick={() => setAll()}
              title="Selecionar todos os meses"
            >
              Todos
            </Button>
            {months.map((m) => {
              const active = !allSelected && selected!.includes(m.periodo);
              return (
                <Button
                  key={m.periodo}
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-7 rounded-full border-border/60 bg-secondary/40 px-3 text-xs transition-colors",
                    active && "border-primary/40 bg-primary/15 text-primary",
                  )}
                  onClick={(e) => handleMonthClick(m.periodo, e)}
                  title="Clique para focar apenas neste mês • Shift/Ctrl-clique para múltipla seleção"
                >
                  {m.label}
                </Button>
              );
            })}
            {!allSelected && (
              <span className="ml-1 hidden text-[10px] text-muted-foreground/70 md:inline">
                Shift-clique p/ múltipla
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
