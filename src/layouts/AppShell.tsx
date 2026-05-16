import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sidebar } from "@/components/pricing/Sidebar";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import { NoResultsBanner } from "@/components/pricing/NoResultsBanner";
import { ShortcutsHelp } from "@/components/pricing/ShortcutsHelp";
import { useSidebarState } from "@/store/sidebar";
import { useTheme, applyTheme } from "@/store/theme";
import { usePricing } from "@/store/pricing";

const NAV_MAP: Record<string, { path: string; label: string }> = {
  h: { path: "/", label: "Home" },
  v: { path: "/visao-geral", label: "Visão Geral" },
  b: { path: "/bridge-pvm", label: "Bridge PVM" },
  d: { path: "/dre", label: "DRE" },
  c: { path: "/canais", label: "Canais" },
  p: { path: "/abc", label: "Portfólio de SKUs" },
  u: { path: "/budget", label: "Budget" },
  s: { path: "/slides", label: "Slides" },
};

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export default function AppShell() {
  const setCollapsed = useSidebarState((s) => s.setCollapsed);
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const clearFilters = usePricing((s) => s.clearFilters);
  const [helpOpen, setHelpOpen] = useState(false);

  // Aplica tema (classe `light` / `dark` no <html>) e reage a mudanças do sistema quando "system"
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  // Auto-colapsar quando viewport < 1400px; expandir acima disso
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1399px)");
    const apply = (matches: boolean) => setCollapsed(matches);
    apply(mql.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [setCollapsed]);

  // Atalhos de teclado globais
  const chordRef = useRef<{ active: boolean; timer: number | null }>({ active: false, timer: null });
  useEffect(() => {
    const clearChord = () => {
      if (chordRef.current.timer !== null) {
        window.clearTimeout(chordRef.current.timer);
      }
      chordRef.current = { active: false, timer: null };
    };

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      const key = e.key.toLowerCase();

      // Segundo passo do chord G + letra
      if (chordRef.current.active) {
        if (key === "f") {
          e.preventDefault();
          const grid = document.querySelector<HTMLElement>('[data-shortcut-target="filter-grid"]');
          const first = grid?.querySelector<HTMLElement>(
            'button, [role="combobox"], input, [tabindex]:not([tabindex="-1"])',
          );
          first?.focus();
          clearChord();
          return;
        }
        const target = NAV_MAP[key];
        if (target) {
          e.preventDefault();
          navigate(target.path);
          toast.info(`Navegando para ${target.label}`, { duration: 1500 });
        }
        clearChord();
        return;
      }

      // Início do chord
      if (key === "g") {
        e.preventDefault();
        chordRef.current.active = true;
        chordRef.current.timer = window.setTimeout(clearChord, 800);
        return;
      }

      // Escape: limpar filtros (se não houver dialog/popover aberto)
      if (e.key === "Escape") {
        const hasOverlay = document.querySelector(
          '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]',
        );
        if (!hasOverlay) {
          clearFilters();
        }
        return;
      }

      // "?" abre a ajuda
      if (e.key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearChord();
    };
  }, [navigate, clearFilters]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ActiveFiltersBar />
        <NoResultsBanner />
        <Outlet />
      </main>
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
