import type { AgentDashboardRange } from "@/lib/api/types";

/**
 * React Query keys for the agent workspace. Everything lives under ["agent"] so a
 * sign-out can drop all cached agent data in one call.
 */
export const agentKeys = {
  all: ["agent"] as const,
  me: ["agent", "me"] as const,
  dashboard: (range: AgentDashboardRange) => ["agent", "dashboard", range] as const,
  dashboardAll: ["agent", "dashboard"] as const,
  profile: ["agent", "profile"] as const,
  customers: (params: object) => ["agent", "customers", params] as const,
  customersAll: ["agent", "customers"] as const,
  customer: (id: string) => ["agent", "customer", id] as const,
  policies: (params: object) => ["agent", "policies", params] as const,
  policy: (id: string) => ["agent", "policy", id] as const,
  soldPolicies: (params: object) => ["agent", "sold-policies", params] as const,
  soldPoliciesAll: ["agent", "sold-policies"] as const,
  soldPolicy: (id: string) => ["agent", "sold-policy", id] as const,
  quote: (params: object) => ["agent", "quote", params] as const,
  receipts: (params: object) => ["agent", "receipts", params] as const,
  goals: ["agent", "goals"] as const,
  receipt: (id: string) => ["agent", "receipt", id] as const,
};
