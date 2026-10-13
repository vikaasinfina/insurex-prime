import { keepPreviousData } from "@tanstack/react-query";
import type { CustomerListParams, SoldPolicyListParams } from "@/lib/api";

/**
 * React Query keys for the Super Admin workspace, all under ["admin"]. The agent portal
 * writes through the same backend, so these queries poll and refetch on focus: a sale
 * recorded by an agent shows up here without a manual reload.
 */
export const adminKeys = {
  all: ["admin"] as const,
  summary: (filters: object = {}) => ["admin", "dashboard", "summary", filters] as const,
  portfolioSummary: (filters: object = {}) =>
    ["admin", "dashboard", "portfolio-summary", filters] as const,
  policyDistribution: (filters: object = {}) =>
    ["admin", "dashboard", "policy-distribution", filters] as const,
  policySales: (interval: string, filters: object) =>
    ["admin", "dashboard", "policy-sales", interval, filters] as const,
  recentSales: (limit: number, filters: object = {}) =>
    ["admin", "dashboard", "recent-sales", limit, filters] as const,
  agentPerformance: (limit: number, filters: object = {}) =>
    ["admin", "dashboard", "agent-performance", limit, filters] as const,
  soldPolicies: (params: SoldPolicyListParams) => ["admin", "sold-policies", params] as const,
  soldPoliciesAll: ["admin", "sold-policies"] as const,
  customers: (params: CustomerListParams) => ["admin", "customers", params] as const,
  customersAll: ["admin", "customers"] as const,
  agents: ["admin", "agents"] as const,
};

/** How often admin tables re-poll the backend while the tab is visible. */
export const ADMIN_POLL_MS = 60_000;

export const liveQueryOptions = {
  refetchInterval: ADMIN_POLL_MS,
  // Revisiting a page shows its cached data at once and refreshes it in the background.
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  placeholderData: keepPreviousData,
} as const;
