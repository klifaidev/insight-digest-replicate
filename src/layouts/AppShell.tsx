import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Sidebar } from "@/components/pricing/Sidebar";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import { NoResultsBanner } from "@/components/pricing/NoResultsBanner";
import { useSidebarState } from "@/store/sidebar";
import { useTheme, applyTheme } from "@/store/theme";

export default function AppShell() {
  const setCollapsed = useSidebarState((s) => s.setCollapsed);
  const theme = useTheme((s) => s.theme);

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

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ActiveFiltersBar />
        <NoResultsBanner />
        <Outlet />
      </main>
    </div>
  );
}
