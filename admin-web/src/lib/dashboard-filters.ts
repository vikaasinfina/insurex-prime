import type { InsuranceType } from "@/lib/api";
import type { FilterState } from "@/components/admin/AdminFilters";

const DATE_RANGE_DAYS: Record<Exclude<FilterState["dateRange"], "All Time">, number> = {
  "7D": 7,
  "30D": 30,
  "6M": 182,
  "1Y": 365,
};

const POLICY_TYPES: Record<Exclude<FilterState["policyType"], "All">, InsuranceType> = {
  Health: "HEALTH",
  Motor: "MOTOR",
  Life: "LIFE",
  Commercial: "COMMERCIAL",
};

export type DashboardStatus = "ACTIVE" | "PENDING" | "EXPIRED" | "RENEWED";

const STATUSES: Record<Exclude<FilterState["status"], "All">, DashboardStatus> = {
  Active: "ACTIVE",
  Pending: "PENDING",
  Expired: "EXPIRED",
  Renewed: "RENEWED",
};

/** The dashboard filters in the shape the dashboard API expects (undefined = no filter). */
export interface DashboardQuery {
  from?: string | undefined;
  to?: string | undefined;
  insuranceType?: InsuranceType | undefined;
  agentId?: string | undefined;
  status?: DashboardStatus | undefined;
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function toDashboardQuery(filters: FilterState): DashboardQuery {
  const days = filters.dateRange === "All Time" ? undefined : DATE_RANGE_DAYS[filters.dateRange];
  return {
    from: days ? isoDay(new Date(Date.now() - days * 86_400_000)) : undefined,
    insuranceType: filters.policyType === "All" ? undefined : POLICY_TYPES[filters.policyType],
    agentId: filters.agent === "All" ? undefined : filters.agent,
    status: filters.status === "All" ? undefined : STATUSES[filters.status],
  };
}
