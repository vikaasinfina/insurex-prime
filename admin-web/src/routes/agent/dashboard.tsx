import { expiryStatus } from "@/lib/expiry-status";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  FilePlus2,
  IndianRupee,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBag,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  PolicyDistributionChart,
  SalesOverviewChart,
} from "@/components/agent/AgentDashboardCharts";
import { SoldPolicyDialog } from "@/components/agent/SoldPolicyDialog";
import { useAgentSession } from "@/components/agent/agent-session-context";
import {
  CodeChip,
  CustomerStatusBadge,
  EmptyState,
  ErrorState,
  InsuranceTypeBadge,
  NativeSelect,
  SaleStatusBadge,
  SectionCard,
  TableScroller,
  tdClass,
  thClass,
} from "@/components/agent/agent-ui";
import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Skeleton } from "@/components/ui/skeleton";
import { agentApi, retryUnlessClientError, soldPoliciesApi, type AgentDashboard } from "@/lib/api";
import type { AgentDashboardRange } from "@/lib/api/types";
import { agentKeys } from "@/lib/agent-queries";
import { daysUntil, formatDate, formatINR, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/agent/dashboard")({
  head: () => ({ meta: [{ title: "Agent Dashboard — InsuroX Prime" }] }),
  component: AgentDashboardPage,
});

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  onClick,
  selected,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  /** Makes the card a button that filters Recent Policy Sales. */
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <article
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      className={`${onClick ? "cursor-pointer " : ""}${selected ? "border-primary ring-1 ring-primary/40 " : ""}group min-w-0 rounded-xl border border-border/80 bg-background/90 p-3 shadow-xs transition-all duration-300 last:col-span-2 hover:border-primary/40 hover:shadow-md sm:rounded-2xl sm:p-5 sm:last:col-span-1 sm:hover:-translate-y-0.5`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold tracking-wide text-muted-foreground sm:uppercase sm:tracking-wider">
          {label}
        </span>
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110 sm:size-9 sm:rounded-xl ${accent}`}
        >
          <Icon className="size-3.5 sm:size-4.5" />
        </span>
      </div>
      <p className="mt-2 truncate font-display text-[22px] font-extrabold leading-none tracking-tight text-foreground sm:mt-3 sm:text-[1.7rem]">
        {value}
      </p>
      <p className="mt-1.5 hidden truncate text-[11px] text-muted-foreground sm:block">{hint}</p>
    </article>
  );
}

type SaleFilter = "" | "ACTIVE" | "EXPIRING" | "EXPIRED";

const saleFilterLabel: Record<SaleFilter, string> = {
  "": "All status",
  ACTIVE: "Active",
  EXPIRING: "Expiring soon",
  EXPIRED: "Expired",
};

function KpiGrid({
  summary,
  filter,
  onFilter,
}: {
  summary: AgentDashboard["summary"];
  filter: SaleFilter;
  onFilter: (filter: SaleFilter) => void;
}) {
  const cards = [
    {
      label: "Policies Sold",
      value: formatNumber(summary.policiesSold),
      hint: "Excluding cancelled",
      icon: ShoppingBag,
      accent: "bg-signal/30 text-signal-foreground",
    },
    {
      label: "Active Policies",
      value: formatNumber(summary.activePolicies),
      hint: "In force today",
      icon: CheckCircle2,
      accent: "bg-emerald-500/10 text-emerald-700",
      filter: "ACTIVE" as const,
    },
    {
      label: "Total Premium",
      value: formatINR(summary.totalPremium),
      hint: `${formatINR(summary.premiumCollected)} collected`,
      icon: IndianRupee,
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "Expiring Soon",
      value: formatNumber(summary.expiringSoon),
      hint: "Within 30 days",
      icon: CalendarClock,
      accent: "bg-teal-500/15 text-teal-700",
      filter: "EXPIRING" as const,
    },
    {
      label: "Expired",
      value: formatNumber(summary.expiredPolicies),
      hint: "Due for renewal",
      icon: AlertTriangle,
      accent: "bg-red-500/10 text-red-700 dark:text-red-400",
      filter: "EXPIRED" as const,
    },
  ];
  return (
    <section
      aria-label="Key figures"
      className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5"
    >
      {cards.map(({ filter: cardFilter, ...card }) => (
        <KpiCard
          key={card.label}
          {...card}
          {...(cardFilter
            ? {
                onClick: () => onFilter(filter === cardFilter ? "" : cardFilter),
                selected: filter === cardFilter,
              }
            : {})}
        />
      ))}
    </section>
  );
}

function QuickActions() {
  const actions = [
    {
      label: "Record Sold Policy",
      description: "Log a policy you sold offline",
      icon: FilePlus2,
      to: "/agent/sell-policy" as const,
      primary: true,
    },
    {
      label: "View Customers",
      description: "Your customer book",
      icon: Users,
      to: "/agent/customers" as const,
    },
    {
      label: "View Policies",
      description: "Active catalog",
      icon: Shield,
      to: "/agent/policies" as const,
    },
  ];
  return (
    <SectionCard title="Quick Actions" icon={Zap} description="Jump straight into common tasks">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              to={action.to}
              className={`group flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                action.primary
                  ? "border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10"
                  : "border-border/70 hover:border-primary/30 hover:bg-muted/40"
              }`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                  action.primary ? "bg-primary text-primary-foreground" : "bg-surface text-primary"
                }`}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {action.primary ? `+ ${action.label}` : action.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {action.description}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** Phones: the four most common jumps as one compact strip. */
function QuickStrip() {
  const items = [
    {
      label: "+ Sale",
      icon: FilePlus2,
      to: "/agent/sell-policy" as const,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Customers",
      icon: Users,
      to: "/agent/customers" as const,
      tone: "bg-emerald-500/10 text-emerald-700",
    },
    {
      label: "Policies",
      icon: Shield,
      to: "/agent/policies" as const,
      tone: "bg-signal/30 text-signal-foreground",
    },
  ];
  return (
    <div className="flex items-stretch gap-1 rounded-xl bg-surface/70 p-1.5 lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            to={item.to}
            className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-background px-1 py-2 transition-transform active:scale-95"
          >
            <span className={`grid size-8 place-items-center rounded-full ${item.tone}`}>
              <Icon className="size-4" />
            </span>
            <span className="text-[10px] font-bold text-foreground">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

const RANGE_PILLS: [AgentDashboardRange, string][] = [
  ["7D", "7 Days"],
  ["30D", "30 Days"],
  ["6M", "6 Months"],
  ["1Y", "1 Year"],
];

const EXPIRY_WARNING_DAYS = 30;

/** Red "(18 days)" only while cover ends in fewer than 30 days; otherwise nothing. */
function DaysRemaining({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate);
  if (days < 0 || days >= EXPIRY_WARNING_DAYS) return null;
  return (
    <span className="font-bold text-destructive">
      {" "}
      ({days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"}`})
    </span>
  );
}

function RecentSales({
  sales: recentSales,
  filter,
  onFilterChange,
  onView,
}: {
  sales: AgentDashboard["recentSales"];
  filter: SaleFilter;
  onFilterChange: (filter: SaleFilter) => void;
  onView: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const filtering = Boolean(debouncedSearch || filter);
  const listParams = {
    limit: 20,
    search: debouncedSearch || undefined,
    expiry: filter || undefined,
    // Most recently lapsed first; soonest expiry first; otherwise newest sale.
    sortBy: filter === "EXPIRING" || filter === "EXPIRED" ? "expiryDate" : "issueDate",
    order: filter === "EXPIRING" ? ("asc" as const) : ("desc" as const),
  };
  const filtered = useQuery({
    queryKey: agentKeys.soldPolicies({ ...listParams, dashboardList: true }),
    queryFn: () => soldPoliciesApi.list(listParams),
    enabled: filtering,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const sales = filtering ? (filtered.data?.data ?? []) : recentSales;

  return (
    <SectionCard
      title="Recent Policy Sales"
      icon={ShieldCheck}
      description={
        filtering
          ? `${filtered.data?.meta.total ?? "…"} matching ${filtered.data?.meta.total === 1 ? "sale" : "sales"}`
          : "Your latest policy sales"
      }
      actions={
        <Link
          to="/agent/sold-policies"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
        >
          View all sales <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by customer, policy or number"
            aria-label="Search recent sales"
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>
        <NativeSelect
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as SaleFilter)}
          aria-label="Filter by status"
        >
          {(Object.keys(saleFilterLabel) as SaleFilter[]).map((key) => (
            <option key={key || "all"} value={key}>
              {saleFilterLabel[key]}
            </option>
          ))}
        </NativeSelect>
        {filtering && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => {
              setSearch("");
              onFilterChange("");
            }}
          >
            <RotateCcw /> Reset
          </Button>
        )}
      </div>

      {filtering && filtered.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : filtering && sales.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No sales match these filters"
          description="Try a different name or status."
        />
      ) : sales.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No policies recorded yet"
          description="Record your first offline sale — it will show up here straight away."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/agent/sell-policy">
                <FilePlus2 /> Record your first sold policy
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {sales.map((sale) => (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => onView(sale.id)}
                  className="flex w-full flex-col gap-2.5 rounded-lg bg-surface/60 p-3 text-left active:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-bold">
                            {sale.policyNumber}
                          </span>
                          <SaleTypeBadge renewal={sale.isRenewal} />
                          <SaleStatusBadge
                            status={sale.policyStatus}
                            expiryDate={sale.expiryDate}
                            renewed={sale.isRenewed}
                          />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {sale.policy.policyName}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-[15px] font-extrabold">
                        {formatINR(sale.premium)}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground">Premium</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {sale.customer.fullName} · {formatDate(sale.issueDate)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-bold text-primary">
                      <Eye className="size-3.5" /> View
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <TableScroller>
              <thead>
                <tr className="border-b border-border/70">
                  {[
                    "Policy Number",
                    "Customer",
                    "Policy",
                    "Insurance Type",
                    "Premium",
                    "Issue Date",
                    "Expiry Date",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className={`${thClass} ${heading === "Premium" ? "text-right" : ""} ${heading === "Actions" ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-medium">
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={`transition-colors hover:bg-muted/40 ${expiryStatus(sale.expiryDate, sale.isRenewed).row}`}
                  >
                    <td className={tdClass}>
                      <CodeChip>{sale.policyNumber}</CodeChip>
                    </td>
                    <td className={`${tdClass} font-bold text-foreground`}>
                      <p className="whitespace-nowrap">{sale.customer.fullName}</p>
                      <p className="font-mono text-[11px] font-normal text-muted-foreground">
                        {sale.customer.customerCode}
                      </p>
                    </td>
                    <td className={`${tdClass} text-foreground`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {sale.policy.policyName}
                        <SaleTypeBadge renewal={sale.isRenewal} />
                      </div>
                    </td>
                    <td className={tdClass}>
                      <InsuranceTypeBadge type={sale.policy.insuranceType} />
                    </td>
                    <td
                      className={`${tdClass} whitespace-nowrap text-right font-display font-extrabold`}
                    >
                      {formatINR(sale.premium)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
                      {formatDate(sale.issueDate)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
                      {formatDate(sale.expiryDate)}
                      <DaysRemaining expiryDate={sale.expiryDate} />
                    </td>
                    <td className={tdClass}>
                      <SaleStatusBadge
                        status={sale.policyStatus}
                        expiryDate={sale.expiryDate}
                        renewed={sale.isRenewed}
                      />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-xs"
                          onClick={() => onView(sale.id)}
                        >
                          <Eye /> View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableScroller>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function RecentCustomers({ customers }: { customers: AgentDashboard["recentCustomers"] }) {
  return (
    <SectionCard
      title="My Customers"
      icon={Users}
      description="Customers you added most recently"
      actions={
        <Button asChild size="sm" variant="outline" className="h-8 rounded-lg text-xs">
          <Link to="/agent/customers">View All Customers</Link>
        </Button>
      }
    >
      {customers.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          description="Customers appear here when you record a sold policy."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/agent/sell-policy">Record a sale</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                to="/agent/customers"
                search={{ view: customer.id }}
                className="flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {customer.fullName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {customer.fullName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <span className="font-mono">{customer.customerCode}</span> ·{" "}
                    {customer.policiesCount} {customer.policiesCount === 1 ? "policy" : "policies"}
                    {customer.lastPolicy
                      ? ` · Last: ${customer.lastPolicy.policyName} (${formatDate(customer.lastPolicy.issueDate)})`
                      : " · No policy yet"}
                  </p>
                </div>
                <CustomerStatusBadge status={customer.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[120px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

function AgentDashboardPage() {
  const { agent } = useAgentSession();
  const navigate = useNavigate();
  const [range, setRange] = useState<AgentDashboardRange>("30D");
  const [viewSaleId, setViewSaleId] = useState<string | null>(null);
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("");
  const salesRef = useRef<HTMLDivElement>(null);
  const filterSales = (next: SaleFilter) => {
    setSaleFilter(next);
    if (next) salesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const dashboard = useQuery({
    queryKey: agentKeys.dashboard(range),
    queryFn: () => agentApi.dashboard(range),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    staleTime: 30_000,
  });

  const data = dashboard.data;
  const firstName = agent.fullName.split(" ")[0];

  return (
    <>
      <div className="hidden flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:flex">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {agent.agentCode}
          </p>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here's how your insurance book is performing.
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link to="/agent/sell-policy">
            <FilePlus2 /> Record sold policy
          </Link>
        </Button>
      </div>

      <div
        role="group"
        aria-label="Time range"
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 max-lg:order-1 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {RANGE_PILLS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[11px] font-bold transition-transform active:scale-95 ${
              range === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {dashboard.isLoading && <DashboardSkeleton />}
      {dashboard.error != null && !data && (
        <ErrorState
          error={dashboard.error}
          title="We couldn't load your dashboard"
          onRetry={() => void dashboard.refetch()}
        />
      )}

      {data && (
        <>
          <div className="max-lg:order-2">
            <KpiGrid summary={data.summary} filter={saleFilter} onFilter={filterSales} />
          </div>

          <div className="max-lg:order-3">
            <QuickStrip />
          </div>

          <div className="grid grid-cols-1 gap-6 max-lg:order-4 lg:grid-cols-3">
            <SalesOverviewChart
              trend={data.salesTrend}
              range={range}
              onRangeChange={setRange}
              isFetching={dashboard.isFetching}
            />
            <PolicyDistributionChart distribution={data.policyDistribution} />
          </div>

          <div ref={salesRef} className="scroll-mt-20 max-lg:order-5">
            <RecentSales
              sales={data.recentSales}
              filter={saleFilter}
              onFilterChange={setSaleFilter}
              onView={setViewSaleId}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 max-lg:order-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentCustomers customers={data.recentCustomers} />
            </div>
            <div className="hidden lg:block">
              <QuickActions />
            </div>
          </div>
        </>
      )}

      <SoldPolicyDialog soldPolicyId={viewSaleId} onClose={() => setViewSaleId(null)} />
    </>
  );
}
