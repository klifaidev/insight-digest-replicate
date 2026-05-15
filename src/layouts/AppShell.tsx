import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/pricing/Sidebar";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";

export default function AppShell() {
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
