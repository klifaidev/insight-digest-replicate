import { GlassCard } from "./GlassCard";
import { UploadIcon, FilterX } from "lucide-react";
import { usePricing } from "@/store/pricing";
import { useHasFilteredData } from "@/store/selectors";
import { useHasActiveFilters } from "./ActiveFiltersBar";

export function EmptyState({ message }: { message?: string }) {
  const rows = usePricing((s) => s.rows);
  const hasActive = useHasActiveFilters();
  const hasData = useHasFilteredData();

  // Quando há base + filtros ativos mas zero linhas filtradas, mostra mensagem específica
  const isFilterEmpty = rows.length > 0 && hasActive && !hasData;

  const finalMessage =
    message ?? (isFilterEmpty ? "Sem dados para os filtros aplicados." : "Carregue um CSV para começar.");
  const title = isFilterEmpty ? "Nenhum resultado" : "Sem dados ainda";
  const Icon = isFilterEmpty ? FilterX : UploadIcon;
  const tone = isFilterEmpty ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";

  return (
    <GlassCard className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{finalMessage}</p>
      </div>
    </GlassCard>
  );
}
