import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Sidebar } from "@/components/pricing/Sidebar";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import { useSidebarState } from "@/store/sidebar";

export default function AppShell() {
  const setCollapsed = useSidebarState((s) => s.setCollapsed);

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
        <Outlet />
      </main>
    </div>
  );
}
