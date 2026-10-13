import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  IndianRupee,
  Shield,
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
import { SoldPoliciesLedger, type ExpiryFilter } from "@/components/agent/SoldPoliciesLedger";
import { useAgentSession } from "@/components/agent/agent-session-context";
import {
  CustomerStatusBadge,
  EmptyState,
  ErrorState,
  SectionCard,
} from "@/components/agent/agent-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { agentApi, retryUnlessClientError, type AgentDashboard } from "@/lib/api";
import type { AgentDashboardRange } from "@/lib/api/types";
import { agentKeys } from "@/lib/agent-queries";
import { formatDate, formatINR, formatNumber } from "@/lib/format";

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

type SaleFilter = ExpiryFilter;

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

/** Recent sales: the same table as Sold Policies, filtered by the KPI cards or its own status filter. */
function RecentSales({
  filter,
  onFilterChange,
}: {
  filter: SaleFilter;
  onFilterChange: (filter: SaleFilter) => void;
}) {
  const [viewId, setViewId] = useState<string | null>(null);
  return (
    <SoldPoliciesLedger
      title="Recent Policy Sales"
      description="Your latest policy sales"
      pageSize={5}
      expiry={filter}
      onExpiryChange={onFilterChange}
      viewId={viewId}
      onViewChange={(id) => setViewId(id ?? null)}
      actions={
        <Link
          to="/agent/sold-policies"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
        >
          View all sales <ArrowRight className="size-3.5" />
        </Link>
      }
      emptyAction={
        <Button asChild className="rounded-xl">
          <Link to="/agent/sell-policy">
            <FilePlus2 /> Record your first sold policy
          </Link>
        </Button>
      }
    />
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
            <RecentSales filter={saleFilter} onFilterChange={setSaleFilter} />
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
    </>
  );
}
