import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { AlertTriangle, BarChart3, Coins, Database, FileSpreadsheet, Home, KanbanSquare, LineChart, Network, Presentation, TableProperties, Target, TrendingUp } from "lucide-react";
import { useMemo } from "react";

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
  { to: "/slides", label: "Slides (Beta)", icon: Presentation },
];

export function Sidebar() {
  const metric = usePricing((s) => s.metric);
  const setMetric = usePricing((s) => s.setMetric);
  const missing = usePricing((s) => s.missing);
  const monthsCount = useMonthsInfo().length;

  const cm = useMemo(() => metric === "cm", [metric]);
  const missingCount = useMemo(
    () => missing.skus.length + missing.canais.length + missing.regioes.length + missing.ufs.length,
    [missing],
  );

  return (
    <aside className="flex h-screen w-[230px] shrink-0 flex-col border-r border-border/40 bg-sidebar/60 backdrop-blur-2xl">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-7">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 text-lg shadow-glow">
          🍫
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Pricing Analytics</div>
          <div className="text-[11px] text-muted-foreground">Harald</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Dashboards
        </div>
        <ul className="space-y-0.5">
          {dashItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {workItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Dados
        </div>
        <ul>
          <li>
            <NavLink
              to="/upload"
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeClassName="bg-sidebar-accent !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
            >
              <span className="flex items-center gap-2.5">
                <Database className="h-4 w-4" />
                Upload / Bases
                {missingCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
              </span>
              {(monthsCount > 0 || missingCount > 0) && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                  {missingCount > 0 ? `${monthsCount} · !` : monthsCount}
                </Badge>
              )}
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Metric toggle */}
      <div className="m-3 rounded-xl border border-border/50 bg-sidebar-accent/40 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Métrica
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-medium ${!cm ? "text-foreground" : "text-muted-foreground"}`}>
            Margem Bruta
          </span>
          <Switch checked={cm} onCheckedChange={(c) => setMetric(c ? "cm" : "mb")} />
          <span className={`text-xs font-medium ${cm ? "text-primary" : "text-muted-foreground"}`}>
            Contrib. Marg.
          </span>
        </div>
      </div>
    </aside>
  );
}
