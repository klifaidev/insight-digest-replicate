// Slides 2.0 — Welcome screen mostrado quando o deck está vazio.
import { Presentation, Sparkles, GitBranch, Target, Hash, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WelcomeScreenProps {
  onOpenGallery: () => void;
  onNewBlankSlide: () => void;
}

const SHORTCUTS = [
  { icon: GitBranch, label: "Bridge PVM" },
  { icon: Target,    label: "Budget" },
  { icon: Hash,      label: "KPIs" },
  { icon: BookOpen,  label: "Capa" },
] as const;

export function WelcomeScreen({ onOpenGallery, onNewBlankSlide }: WelcomeScreenProps) {
  const handleShortcut = (label: string) => {
    onNewBlankSlide();
    toast.message(
      `Slide criado! Clique no ícone "${label}" na paleta para adicionar o bloco.`,
    );
  };

  return (
    <div className="s2-welcome-in flex h-full w-full flex-col items-center justify-center gap-6 px-6">
      <Presentation className="text-primary/30" size={40} strokeWidth={1.5} />

      <h2 className="text-2xl font-semibold text-center">
        Seu próximo deck começa aqui
      </h2>
      <p className="-mt-4 max-w-xs text-center text-sm text-muted-foreground">
        Escolha um template ou comece com um slide em branco
      </p>

      <div className="flex gap-3">
        <Button onClick={onOpenGallery} className="gap-1.5">
          <Sparkles className="h-4 w-4" /> Escolher template
        </Button>
        <Button variant="outline" onClick={onNewBlankSlide}>
          Slide em branco
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {SHORTCUTS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => handleShortcut(label)}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border border-border/40 bg-card/50",
              "transition-all duration-150 hover:border-primary/30 hover:bg-card/80",
            )}
            style={{ width: 120, height: 80 }}
          >
            <Icon size={16} className="text-muted-foreground" />
            <span className="mt-1 text-xs">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
