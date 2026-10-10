import { apiRequest, apiRequestPaginated, toQuery } from "./client";
import type {
  AgentPerformanceRow,
  AgentStatus,
  ApiSoldPolicy,
  DashboardSummary,
  InsuranceType,
  PaymentStatus,
  PolicyDistributionRow,
  PolicyPerformanceRow,
  PortfolioSummaryRow,
  PolicyStatus,
  SalesSeries,
  SoldPolicyStatus,
} from "./types";

type Range = { from?: string; to?: string };

/** Platform dashboard (SUPER_ADMIN; agents use agentApi.dashboard). */
export const dashboardApi = {
  summary: (range?: Range) =>
    apiRequest<DashboardSummary>("/dashboard/summary", { query: toQuery(range) }),
  policySales: (
    params?: Range & { interval?: "day" | "week" | "month"; insuranceType?: InsuranceType },
  ) => apiRequest<SalesSeries>("/dashboard/policy-sales", { query: toQuery(params) }),
  policyDistribution: (range?: Range) =>
    apiRequest<PolicyDistributionRow[]>("/dashboard/policy-distribution", {
      query: toQuery(range),
    }),
  portfolioSummary: (range?: Range) =>
    apiRequest<PortfolioSummaryRow[]>("/dashboard/portfolio-summary", { query: toQuery(range) }),
  agentPerformance: (
    params?: Range & { limit?: number; sortBy?: "premium" | "policiesSold" | "customers" },
  ) =>
    apiRequest<AgentPerformanceRow[]>("/dashboard/agent-performance", { query: toQuery(params) }),
  recentSales: (limit = 10) =>
    apiRequest<ApiSoldPolicy[]>("/dashboard/recent-sales", { query: { limit } }),
};

/** Reports (SUPER_ADMIN). */
export const reportsApi = {
  sales: (
    params?: Range & {
      interval?: "day" | "week" | "month";
      agentId?: string;
      insuranceType?: InsuranceType;
    },
  ) =>
    apiRequest<{
      summary: DashboardSummary;
      timeline: SalesSeries;
      byType: PolicyDistributionRow[];
      byPolicyStatus: {
        status: SoldPolicyStatus | "RENEWED";
        count: number;
        premium: number;
      }[];
      byPaymentStatus: { status: PaymentStatus; count: number; premium: number }[];
    }>("/reports/sales", { query: toQuery(params) }),
  policies: (
    params?: Range & {
      page?: number;
      limit?: number;
      insuranceType?: InsuranceType;
      status?: PolicyStatus;
      sortBy?: "policiesSold" | "premium" | "policyName";
    },
  ) => apiRequestPaginated<PolicyPerformanceRow>("/reports/policies", { query: toQuery(params) }),
  agents: (
    params?: Range & {
      page?: number;
      limit?: number;
      status?: AgentStatus;
      sortBy?: "premium" | "policiesSold" | "customers" | "fullName";
    },
  ) => apiRequestPaginated<AgentPerformanceRow>("/reports/agents", { query: toQuery(params) }),
};
