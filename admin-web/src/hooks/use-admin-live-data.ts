import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { adminKeys, liveQueryOptions } from "@/lib/admin-queries";
import {
  agentsApi,
  customersApi,
  dashboardApi,
  isApiConfigured,
  soldPoliciesApi,
  type ApiSoldPolicy,
  type SoldPolicyListParams,
} from "@/lib/api";
import type { DashboardQuery } from "@/lib/dashboard-filters";
import { toAgentPerformance, toCustomer, toRecentSale } from "@/lib/api/admin-mappers";

// Queries only run in the browser: the admin token lives in the Firebase client session.
const enabled = isApiConfigured && typeof window !== "undefined";

export function useAdminRecentSales(limit = 10, filters: DashboardQuery = {}) {
  const query = useQuery({
    queryKey: adminKeys.recentSales(limit, filters),
    queryFn: () => dashboardApi.recentSales(limit, filters),
    enabled,
    ...liveQueryOptions,
  });
  const sales = useMemo(() => query.data?.map(toRecentSale), [query.data]);
  return { query, sales };
}

export function useAdminAgentPerformance(limit = 10, filters: DashboardQuery = {}) {
  const query = useQuery({
    queryKey: adminKeys.agentPerformance(limit, filters),
    queryFn: () => dashboardApi.agentPerformance({ limit, ...filters }),
    enabled,
    ...liveQueryOptions,
  });
  const agents = useMemo(() => query.data?.map(toAgentPerformance), [query.data]);
  return { query, agents };
}

export function useAdminSoldPolicies(params: SoldPolicyListParams) {
  const query = useQuery({
    queryKey: adminKeys.soldPolicies(params),
    queryFn: () => soldPoliciesApi.list(params),
    enabled,
    ...liveQueryOptions,
  });
  const sales = useMemo(() => query.data?.data.map(toRecentSale), [query.data]);
  return { query, sales };
}

export function useAdminAgents() {
  return useQuery({
    queryKey: adminKeys.agents,
    queryFn: () => agentsApi.list({ limit: 100 }),
    enabled,
    ...liveQueryOptions,
  });
}

/** Customers merged with their sold policies, both refreshed on the same poll. */
export function useAdminCustomers() {
  const customers = useQuery({
    queryKey: adminKeys.customers({ limit: 100 }),
    queryFn: () => customersApi.list({ limit: 100, sortBy: "createdAt", order: "desc" }),
    enabled,
    ...liveQueryOptions,
  });
  const sales = useQuery({
    queryKey: adminKeys.soldPolicies({ limit: 100 }),
    queryFn: () => soldPoliciesApi.list({ limit: 100 }),
    enabled,
    ...liveQueryOptions,
  });
  const ledger = sales.data?.data;
  const rows = useMemo(() => {
    if (!customers.data) return undefined;
    const byCustomer = new Map<string, ApiSoldPolicy[]>();
    for (const sale of ledger ?? []) {
      byCustomer.set(sale.customer.id, [...(byCustomer.get(sale.customer.id) ?? []), sale]);
    }
    return customers.data.data.map((customer) =>
      toCustomer(customer, byCustomer.get(customer.id) ?? []),
    );
  }, [customers.data, ledger]);
  return { customers, sales, rows };
}
