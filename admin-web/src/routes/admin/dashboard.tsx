import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdminSession } from "@/lib/admin-route-guard";
import { useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminKpiCards } from "@/components/admin/AdminKpiCards";
import { AdminFilters, type FilterState } from "@/components/admin/AdminFilters";
import { AdminAnalyticsCharts } from "@/components/admin/AdminAnalyticsCharts";
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { AdminPolicySummary } from "@/components/admin/AdminPolicySummary";
import { AdminAgentPerformanceTable } from "@/components/admin/AdminAgentPerformanceTable";
import { AdminRecentSalesTable } from "@/components/admin/AdminRecentSalesTable";
import { AdminActionModals, type ModalType } from "@/components/admin/AdminActionModals";
import {
  formatINR,
  type AgentPerformanceRecord,
  type KpiStats,
  type PolicyCategorySummary,
  type RecentPolicySale,
} from "@/components/admin/admin-mock-data";
import { dashboardApi, isApiConfigured, type DashboardSummary } from "@/lib/api";
import { insuranceTypeLabel } from "@/lib/format";
import { adminKeys, liveQueryOptions } from "@/lib/admin-queries";
import { useAdminAgentPerformance, useAdminRecentSales } from "@/hooks/use-admin-live-data";
import { AdminFooter } from "@/components/admin/AdminFooter";

const NO_SALES: RecentPolicySale[] = [];
const NO_AGENTS: AgentPerformanceRecord[] = [];

export const Route = createFileRoute("/admin/dashboard")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: () => ({
    meta: [
      { title: "Dashboard — InsuroX Prime" },
      {
        name: "description",
        content:
          "Centralized insurance operations dashboard for Super Admins: enterprise analytics, policy ledger, agent production, and data export.",
      },
    ],
  }),
  component: SuperAdminDashboard,
});

const LIVE_LABEL = "Live";

/** Maps the backend summary onto the existing KPI cards (no growth data yet). */
function toKpiStats(summary: DashboardSummary | undefined, label: string): KpiStats {
  return {
    totalPolicies: summary?.totalPolicies ?? 0,
    policiesSold: summary?.policiesSold ?? 0,
    activePolicies: summary?.activeSoldPolicies ?? 0,
    totalPremium: summary?.totalPremium ?? 0,
    totalAgents: summary?.totalAgents ?? 0,
    policiesGrowth: label,
    soldGrowth: label,
    activeGrowth: label,
    premiumGrowth: label,
    agentsGrowth: label,
  };
}

function SuperAdminDashboard() {
  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Quick action modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Global operations filters
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "All Time",
    policyType: "All",
    agent: "All",
    status: "All",
  });

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      dateRange: "All Time",
      policyType: "All",
      agent: "All",
      status: "All",
    });
  };

  // Filtered recent policies
  const liveSales = useAdminRecentSales(10).sales;
  const liveAgents = useAdminAgentPerformance(10).agents;
  const salesSource = liveSales ?? NO_SALES;
  const agentsSource = liveAgents ?? NO_AGENTS;

  const filteredPolicies: RecentPolicySale[] = useMemo(() => {
    return salesSource.filter((item) => {
      // Policy Type filter
      if (filters.policyType !== "All" && item.policyType !== filters.policyType) {
        return false;
      }
      // Agent filter
      if (filters.agent !== "All" && item.agentName !== filters.agent) {
        return false;
      }
      // Status filter
      if (filters.status !== "All" && item.status !== filters.status) {
        return false;
      }
      return true;
    });
  }, [salesSource, filters]);

  // Filtered agents
  const filteredAgents: AgentPerformanceRecord[] = useMemo(() => {
    return agentsSource.filter((agent) => {
      if (filters.agent !== "All" && agent.name !== filters.agent) {
        return false;
      }
      return true;
    });
  }, [agentsSource, filters.agent]);

  // KPI cards and the portfolio matrix show real backend figures only.
  const liveSummary = useQuery({
    queryKey: adminKeys.summary,
    queryFn: () => dashboardApi.summary(),
    enabled: isApiConfigured && typeof window !== "undefined",
    ...liveQueryOptions,
  });
  const kpiStats: KpiStats = toKpiStats(
    liveSummary.data,
    liveSummary.error ? "Unavailable" : liveSummary.data ? LIVE_LABEL : "Loading…",
  );

  const portfolio = useQuery({
    queryKey: adminKeys.portfolioSummary,
    queryFn: () => dashboardApi.portfolioSummary(),
    enabled: isApiConfigured && typeof window !== "undefined",
    ...liveQueryOptions,
  });
  const portfolioCategories: PolicyCategorySummary[] = useMemo(
    () =>
      (portfolio.data ?? []).map((row) => ({
        category:
          `${insuranceTypeLabel[row.insuranceType]} Insurance` as PolicyCategorySummary["category"],
        total: row.total,
        active: row.active,
        pending: row.pending,
        expired: row.expired,
        renewed: row.renewed,
        totalPremium: formatINR(row.totalPremium),
      })),
    [portfolio.data],
  );

  return (
    <div className="min-h-screen bg-surface/30 text-foreground selection:bg-primary/20 selection:text-primary">
      <Toaster position="top-right" richColors />

      {/* Sidebar (Desktop Fixed + Mobile Drawer) */}
      <AdminSidebar
        currentPath="/admin/dashboard"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Wrapper (shifted left on desktop for fixed sidebar) */}
      <div className="app-shell-pad flex flex-col min-h-screen">
        {/* Top Header */}
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />

        {/* Dashboard Content Container */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col space-y-6 p-4 sm:p-6 lg:p-8">
          {/* Phones show: filters, KPIs, quick actions, charts, then the lists. */}
          <div className="max-lg:order-1">
            <AdminFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onReset={handleResetFilters}
            />
          </div>

          <div className="max-lg:order-2">
            <AdminKpiCards stats={kpiStats} />
          </div>

          <div className="max-lg:order-4">
            <AdminAnalyticsCharts
              initialTimeframe={
                filters.dateRange === "7D"
                  ? "7D"
                  : filters.dateRange === "6M"
                    ? "6M"
                    : filters.dateRange === "1Y"
                      ? "1Y"
                      : "30D"
              }
            />
          </div>

          <div className="max-lg:order-3">
            <AdminQuickActions
              onOpenAddAgent={() => setActiveModal("add_agent")}
              onOpenAddPolicy={() => setActiveModal("add_policy")}
              onOpenGenerateReport={() => setActiveModal("generate_report")}
            />
          </div>

          <div className="max-lg:order-5">
            <AdminPolicySummary categories={portfolioCategories} />
          </div>

          <div className="max-lg:order-7">
            <AdminAgentPerformanceTable agents={filteredAgents} />
          </div>

          <div className="max-lg:order-6">
            <AdminRecentSalesTable policies={filteredPolicies} />
          </div>
        </main>
        <AdminFooter />
      </div>

      {/* Action Dialogs (Add Agent, Customer, Policy, Report) */}
      <AdminActionModals modalType={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
