import {
  Calendar,
  Filter,
  HeartPulse,
  CarFront,
  History,
  RotateCcw,
  Shield,
  Tag,
  User,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";

export interface FilterState {
  dateRange: "All Time" | "7D" | "30D" | "6M" | "1Y";
  policyType: "All" | "Health" | "Motor" | "Life" | "Commercial";
  agent: string;
  status: "All" | "Active" | "Pending" | "Expired" | "Renewed";
}

export interface AdminFiltersProps {
  filters: FilterState;
  /** Agents to choose from; the filter value is the agent's id. */
  agents?: { id: string; name: string }[];
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onReset: () => void;
}

export function AdminFilters({ filters, agents = [], onFilterChange, onReset }: AdminFiltersProps) {
  const isFiltered =
    filters.dateRange !== "All Time" ||
    filters.policyType !== "All" ||
    filters.agent !== "All" ||
    filters.status !== "All";

  const pill = (
    key: string,
    label: string,
    active: boolean,
    onClick: () => void,
    Icon?: ComponentType<{ className?: string }>,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-bold transition-transform active:scale-95",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-surface text-muted-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
    </button>
  );
  const ranges: [FilterState["dateRange"], string][] = [
    ["All Time", "All Time"],
    ["7D", "7 Days"],
    ["30D", "30 Days"],
    ["6M", "6 Months"],
    ["1Y", "1 Year"],
  ];

  return (
    <>
      {/* Phones: one scrollable row of quick filters */}
      <div
        role="group"
        aria-label="Quick filters"
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {ranges.map(([value, label], index) =>
          pill(
            value,
            label,
            filters.dateRange === value,
            () => onFilterChange("dateRange", value),
            index === 0 ? History : undefined,
          ),
        )}
        {pill(
          "health",
          "Health Only",
          filters.policyType === "Health",
          () => onFilterChange("policyType", filters.policyType === "Health" ? "All" : "Health"),
          HeartPulse,
        )}
        {pill(
          "motor",
          "Motor Only",
          filters.policyType === "Motor",
          () => onFilterChange("policyType", filters.policyType === "Motor" ? "All" : "Motor"),
          CarFront,
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset filters"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-surface text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
      <div className="hidden rounded-2xl border border-border/80 bg-background/80 p-4 shadow-xs backdrop-blur-md lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Left Label */}
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Filter className="size-3.5 text-primary" />
            <span>Global Operations Filter</span>
            {isFiltered && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                Active
              </span>
            )}
          </div>

          {/* Filter Controls Grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:flex lg:items-center lg:gap-3">
            {/* Date Range */}
            <div className="relative">
              <label htmlFor="filter-date-range" className="sr-only">
                Date Range
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground">
                <Calendar className="size-3.5" />
              </div>
              <SelectField
                id="filter-date-range"
                aria-label="Filter by Date Range"
                value={filters.dateRange}
                onChange={(e) => onFilterChange("dateRange", e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-border bg-surface/50 pl-8 pr-7 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="All Time">Date: All Time</option>
                <option value="7D">Last 7 Days</option>
                <option value="30D">Last 30 Days</option>
                <option value="6M">Last 6 Months</option>
                <option value="1Y">Last 1 Year</option>
              </SelectField>
            </div>

            {/* Policy Type */}
            <div className="relative">
              <label htmlFor="filter-policy-type" className="sr-only">
                Policy Type
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground">
                <Shield className="size-3.5" />
              </div>
              <SelectField
                id="filter-policy-type"
                aria-label="Filter by Policy Type"
                value={filters.policyType}
                onChange={(e) => onFilterChange("policyType", e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-border bg-surface/50 pl-8 pr-7 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="All">Type: All Policies</option>
                <option value="Health">Health Insurance</option>
                <option value="Motor">Motor Insurance</option>
                <option value="Life">Life Insurance</option>
                <option value="Commercial">Commercial Insurance</option>
              </SelectField>
            </div>

            {/* Agent */}
            <div className="relative">
              <label htmlFor="filter-agent" className="sr-only">
                Agent
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground">
                <User className="size-3.5" />
              </div>
              <SelectField
                id="filter-agent"
                aria-label="Filter by Agent"
                value={filters.agent}
                onChange={(e) => onFilterChange("agent", e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-border bg-surface/50 pl-8 pr-7 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="All">Agent: All Field</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </SelectField>
            </div>

            {/* Policy Status */}
            <div className="relative">
              <label htmlFor="filter-status" className="sr-only">
                Policy Status
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground">
                <Tag className="size-3.5" />
              </div>
              <SelectField
                id="filter-status"
                aria-label="Filter by Policy Status"
                value={filters.status}
                onChange={(e) => onFilterChange("status", e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-border bg-surface/50 pl-8 pr-7 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="All">Status: All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Expired">Expired</option>
                <option value="Renewed">Renewed</option>
              </SelectField>
            </div>

            {/* Reset Filters */}
            {isFiltered && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-9 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted col-span-2 sm:col-span-4 lg:col-span-1 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="size-3" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
