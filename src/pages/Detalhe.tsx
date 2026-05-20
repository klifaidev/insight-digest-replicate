import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { PivotBuilder } from "@/components/pricing/PivotBuilder";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { applyFilters } from "@/lib/analytics";
import { applyBudgetFilters } from "@/lib/budget";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoveHorizontal, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";

/**
 * Wrapper que dá overflow-x controlado à tabela pivot, com indicadores
 * visuais de scroll (sombra à direita) e sticky na primeira coluna.
 * Aplica os estilos sticky via seletores de arbitrary variant do Tailwind,
 * sem tocar na lógica interna do PivotBuilder.
 */
function HorizontalScrollWrap({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1280 : false,
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1280);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      setOverflowing(over);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    update();
    const onScroll = () => {
      if (el.scrollLeft > 4) setHasScrolled(true);
      update();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const showHint = overflowing && isNarrow && !hasScrolled;

  return (
    <div className="relative w-full">
      {showHint && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground animate-fade-in">
          <MoveHorizontal className="h-3 w-3" />
          ← → Role para ver mais colunas
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          className={cn(
            "w-full overflow-x-auto",
            // Sticky para primeira célula de cada linha (header e body)
            "[&_table_tr>th:first-child]:sticky [&_table_tr>th:first-child]:left-0 [&_table_tr>th:first-child]:z-20 [&_table_tr>th:first-child]:bg-[hsl(var(--card))]",
            "[&_table_tr>td:first-child]:sticky [&_table_tr>td:first-child]:left-0 [&_table_tr>td:first-child]:z-10 [&_table_tr>td:first-child]:bg-[hsl(var(--card))]",
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
        {/* Sombra gradiente indicando mais conteúdo à direita */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/90 to-transparent transition-opacity duration-200",
            overflowing && !atEnd ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}

export default function Detalhe() {
  usePageTitle("Tabela Dinâmica");
  const realRows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const budgetRows = useBudget((s) => s.rows);

  const filteredReal = useMemo(
    () => applyFilters(realRows, filters, selected),
    [realRows, filters, selected],
  );
  const filteredBudget = useMemo(
    () => applyBudgetFilters(budgetRows, filters, selected),
    [budgetRows, filters, selected],
  );

  if (realRows.length === 0 && budgetRows.length === 0) {
    return (
      <>
        <Topbar title="Tabela Dinâmica" />
        <div className="px-8 py-6">
          <EmptyState />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Tabela Dinâmica"
        subtitle={`${filteredReal.length.toLocaleString("pt-BR")} linhas Real · ${filteredBudget.length.toLocaleString("pt-BR")} linhas Budget`}
      />
      <div className="px-8 py-6">
        <GlassCard>
          <HorizontalScrollWrap>
            <PivotBuilder realRows={filteredReal} budgetRows={filteredBudget} />
          </HorizontalScrollWrap>
        </GlassCard>
      </div>
    </>
  );
}
