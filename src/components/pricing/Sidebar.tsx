import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useSidebarState } from "@/store/sidebar";
import { useHasActiveFilters } from "./ActiveFiltersBar";
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Coins,
  Database,
  FileSpreadsheet,
  Home,
  KanbanSquare,
  LineChart,
  Monitor,
  Moon,
  Network,
  Presentation,
  Search,
  Sun,
  TableProperties,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useTheme, type Theme } from "@/store/theme";
import { useMemo, useState } from "react";
import { GlobalSearch } from "./GlobalSearch";

const dashItems = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/visao-geral", label: "Visão Geral", icon: BarChart3 },
  { to: "/bridge-pvm", label: "Bridge PVM", icon: TrendingUp },
  { to: "/dre", label: "DRE", icon: FileSpreadsheet },
  { to: "/canais", label: "Canais", icon: Network },
  { to: "/custos", label: "Custos", icon: Coins },
  { to: "/abc", label: "Portfólio de SKUs", icon: LineChart },
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/detalhe", label: "Tabela Dinâmica", icon: TableProperties },
];

const workItems = [
  { to: "/atividades", label: "Atividades", icon: KanbanSquare },
  { to: "/slides", label: "Slides", icon: Presentation },
];

export function Sidebar() {
  const metric = usePricing((s) => s.metric);
  const setMetric = usePricing((s) => s.setMetric);
  const missing = usePricing((s) => s.missing);
  const monthsCount = useMonthsInfo().length;
  const hasFilters = useHasActiveFilters();

  const collapsed = useSidebarState((s) => s.collapsed);
  const toggleCollapsed = useSidebarState((s) => s.toggleCollapsed);
  const mobileOpen = useSidebarState((s) => s.mobileOpen);
  const setMobileOpen = useSidebarState((s) => s.setMobileOpen);
  const [searchOpen, setSearchOpen] = useState(false);

  const cm = useMemo(() => metric === "cm", [metric]);
  const missingCount = useMemo(
    () => missing.skus.length + missing.canais.length + missing.regioes.length + missing.ufs.length,
    [missing],
  );

  // On mobile, the drawer is full-width sidebar (230px) regardless of `collapsed`.
  // On desktop (md+), `collapsed` controls the width.
  const desktopWidth = collapsed ? "md:w-14" : "md:w-[230px]";
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[230px] flex-col border-r border-border/40 bg-sidebar/90 backdrop-blur-2xl transition-[transform,width] duration-200 ease-out md:sticky md:top-0 md:z-30 md:translate-x-0 md:bg-sidebar/60 ${desktopWidth} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Navegação principal"
      >
        {/* Logo + mobile close */}
        <div
          className={`flex items-center gap-2.5 px-5 pb-7 pt-6 ${collapsed ? "md:px-3 md:justify-center" : ""}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-lg shadow-glow">
            🍫
          </div>
          <div
            className={`leading-tight transition-opacity duration-150 ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            <div className="text-[13px] font-semibold tracking-tight">Pricing Analytics</div>
            <div className="text-[11px] text-muted-foreground">Harald</div>
          </div>
          <button
            onClick={closeMobile}
            aria-label="Fechar menu"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Busca global (Ctrl/Cmd+K) */}
        <div className={`px-3 pb-3 ${collapsed ? "md:px-2" : ""}`}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Buscar (Ctrl+K)"
            aria-label="Buscar"
            className={`flex w-full items-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 px-2.5 py-2 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
              collapsed ? "md:justify-center md:px-2" : ""
            }`}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}>Buscar…</span>
            <kbd
              className={`ml-auto hidden rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ${
                collapsed ? "md:hidden" : "md:inline-block"
              }`}
            >
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? "md:px-2" : "px-3"}`}>
          <SectionLabel collapsed={collapsed}>Dashboards</SectionLabel>
          <ul className="space-y-0.5">
            {dashItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={closeMobile}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    collapsed ? "md:justify-center md:px-2" : ""
                  }`}
                  activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                >
                  <span className="relative inline-flex">
                    <item.icon className="h-4 w-4" />
                    {hasFilters && (
                      <span
                        className="absolute -right-1 -top-1 h-[5px] w-[5px] rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary))]"
                        title="Filtros ativos aplicados"
                      />
                    )}
                  </span>
                  <span
                    className={`transition-opacity duration-150 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>

          <SectionLabel collapsed={collapsed} className="mt-6">
            Workspace
          </SectionLabel>
          <ul className="space-y-0.5">
            {workItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={closeMobile}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    collapsed ? "md:justify-center md:px-2" : ""
                  }`}
                  activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                >
                  <item.icon className="h-4 w-4" />
                  <span
                    className={`transition-opacity duration-150 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>

          <SectionLabel collapsed={collapsed} className="mt-6">
            Dados
          </SectionLabel>
          <ul>
            <li>
              <NavLink
                to="/upload"
                onClick={closeMobile}
                title={collapsed ? "Upload / Bases" : undefined}
                aria-label="Upload / Bases"
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  collapsed ? "md:justify-center md:px-2" : ""
                }`}
                activeClassName="bg-sidebar-accent !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
              >
                <span className="flex items-center gap-2.5">
                  <Database className="h-4 w-4" />
                  <span
                    className={`transition-opacity duration-150 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    Upload / Bases
                  </span>
                  {missingCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                </span>
                {(monthsCount > 0 || missingCount > 0) && !collapsed && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                    {missingCount > 0 ? `${monthsCount} · !` : monthsCount}
                  </Badge>
                )}
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* Metric toggle (oculto quando colapsado em desktop) */}
        <div
          className={`m-3 rounded-xl border border-border/50 bg-sidebar-accent/40 p-3 ${
            collapsed ? "md:hidden" : ""
          }`}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Métrica
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-medium ${!cm ? "text-foreground" : "text-muted-foreground"}`}>
              Margem Bruta
            </span>
            <Switch
              checked={cm}
              onCheckedChange={(c) => setMetric(c ? "cm" : "mb")}
              aria-label="Alternar métrica entre Margem Bruta e Contribuição Marginal"
            />
            <span className={`text-xs font-medium ${cm ? "text-primary" : "text-muted-foreground"}`}>
              Contrib. Marg.
            </span>
          </div>
        </div>

        {/* Theme toggle */}
        <ThemeToggle collapsed={collapsed} />

        {/* Toggle collapse — só desktop */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
          className="mx-3 mb-3 hidden h-8 items-center justify-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 text-xs text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 md:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Colapsar</span>}
        </button>
      </aside>
    </>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const opts: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Claro" },
    { value: "system", icon: Monitor, label: "Sistema" },
    { value: "dark", icon: Moon, label: "Escuro" },
  ];
  return (
    <div
      className={`mx-3 mb-2 flex items-center gap-1 rounded-lg border border-border/50 bg-sidebar-accent/30 p-1 ${
        collapsed ? "md:flex-col" : ""
      }`}
    >
      {opts.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-label={o.label}
            aria-pressed={active}
            title={o.label}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className={collapsed ? "md:hidden" : ""}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({
  children,
  collapsed,
  className = "",
}: {
  children: React.ReactNode;
  collapsed: boolean;
  className?: string;
}) {
  if (collapsed) {
    return <div className={`mx-1 my-2 hidden h-px bg-border/40 md:block ${className}`} />;
  }
  return (
    <div
      className={`px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 ${className}`}
    >
      {children}
    </div>
  );
}
