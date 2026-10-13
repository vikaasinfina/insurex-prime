import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarRange, FilePlus2, Info, Search, Shield, Umbrella } from "lucide-react";
import { useEffect, useState } from "react";
import { PolicyDetailDialog } from "@/components/agent/PolicyDetailDialog";
import {
  CodeChip,
  EmptyState,
  ErrorState,
  InsuranceTypeBadge,
  PaginationBar,
  SectionCard,
} from "@/components/agent/agent-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { policiesApi, retryUnlessClientError, type ApiPolicy } from "@/lib/api";
import type { InsuranceType } from "@/lib/api/types";
import { agentKeys } from "@/lib/agent-queries";
import { formatDuration, formatINR, premiumFrequencyLabel } from "@/lib/format";

export const Route = createFileRoute("/agent/policies")({
  head: () => ({ meta: [{ title: "Policies — InsuroX Prime" }] }),
  component: AgentPoliciesPage,
});

const PAGE_SIZE = 9;
const TYPE_TABS: { id: InsuranceType | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "HEALTH", label: "Health" },
  { id: "MOTOR", label: "Motor" },
  { id: "LIFE", label: "Life" },
  { id: "COMMERCIAL", label: "Commercial" },
];

function PolicyCard({ policy, onView }: { policy: ApiPolicy; onView: () => void }) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-border/80 bg-background p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="shrink-0">
          <InsuranceTypeBadge type={policy.insuranceType} />
        </span>
        <CodeChip>{policy.policyCode}</CodeChip>
      </div>
      <h3 className="mt-3 font-display text-lg font-bold leading-snug text-foreground">
        {policy.policyName}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{policy.description || "—"}</p>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-extrabold text-foreground">
            {formatINR(policy.premium)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {premiumFrequencyLabel[policy.premiumFrequency]} premium
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-surface/60 p-2.5">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Umbrella className="size-3" /> Coverage
          </dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {formatINR(policy.coverageAmount)}
          </dd>
        </div>
        <div className="rounded-xl bg-surface/60 p-2.5">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarRange className="size-3" /> Duration
          </dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {formatDuration(policy.durationMonths)}
          </dd>
        </div>
      </dl>
      {policy.benefits.length > 0 && (
        <p className="mt-3 line-clamp-1 text-[11px] text-muted-foreground">
          {policy.benefits.slice(0, 3).join(" · ")}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={onView}>
          <Info /> Details
        </Button>
        <Button asChild size="sm" className="flex-1 rounded-xl">
          <Link to="/agent/sell-policy" search={{ policyId: policy.id }}>
            <FilePlus2 /> Record
          </Link>
        </Button>
      </div>
    </article>
  );
}

function AgentPoliciesPage() {
  const [search, setSearch] = useState("");
  const [insuranceType, setInsuranceType] = useState<InsuranceType | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiPolicy | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  useEffect(() => setPage(1), [debouncedSearch, insuranceType]);

  const params = {
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    insuranceType: insuranceType || undefined,
    sortBy: "policyName",
    order: "asc" as const,
  };
  const policies = useQuery({
    queryKey: agentKeys.policies(params),
    queryFn: () => policiesApi.list(params),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const rows = policies.data?.data ?? [];

  return (
    <>
      <SectionCard
        title="Active policy catalog"
        icon={Shield}
        description="Policies currently open for sale. The catalog is managed by your Super Admin."
      >
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search policy name or code"
              aria-label="Search policies"
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>
          <div
            role="group"
            aria-label="Insurance type"
            className="flex items-center self-start rounded-xl border border-border bg-surface/60 p-1"
          >
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={insuranceType === tab.id}
                onClick={() => setInsuranceType(tab.id)}
                className={`cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  insuranceType === tab.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {policies.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-80 rounded-2xl" />
            ))}
          </div>
        )}
        {policies.error != null && !policies.data && (
          <ErrorState error={policies.error} onRetry={() => void policies.refetch()} />
        )}
        {policies.data && rows.length === 0 && (
          <EmptyState
            icon={Shield}
            title={debouncedSearch || insuranceType ? "No matching policies" : "No active policies"}
            description={
              debouncedSearch || insuranceType
                ? "Try a different search or insurance type."
                : "Your Super Admin hasn't published any policies for sale yet."
            }
          />
        )}
        {rows.length > 0 && (
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${
              policies.isPlaceholderData ? "opacity-60 transition-opacity" : ""
            }`}
          >
            {rows.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} onView={() => setSelected(policy)} />
            ))}
          </div>
        )}
        <PaginationBar meta={policies.data?.meta} onPageChange={setPage} noun="policies" />
      </SectionCard>

      <PolicyDetailDialog policy={selected} onClose={() => setSelected(null)} />
    </>
  );
}
