import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Pencil, RotateCcw, Search, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SoldPolicyDialog } from "@/components/agent/SoldPolicyDialog";
import {
  DeleteSoldPolicyDialog,
  EditSoldPolicyDialog,
} from "@/components/agent/SoldPolicyEditDialogs";
import {
  CodeChip,
  EmptyState,
  ErrorState,
  InsuranceTypeBadge,
  NativeSelect,
  PaginationBar,
  SectionCard,
  TableScroller,
  TableSkeleton,
  tdClass,
  thClass,
} from "@/components/agent/agent-ui";
import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminKeys } from "@/lib/admin-queries";
import { agentsApi, retryUnlessClientError, soldPoliciesApi } from "@/lib/api";
import type { ApiSoldPolicy, InsuranceType } from "@/lib/api/types";
import { agentKeys } from "@/lib/agent-queries";
import { expiryStatus } from "@/lib/expiry-status";
import { formatDate, formatINR } from "@/lib/format";
import { policyAge } from "@/lib/policy-age";

const PAGE_SIZE = 10;
type SortKey = "issueDate" | "expiryDate" | "premium" | "createdAt";

const ageTone = {
  new: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  one: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  three: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  ten: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
} as const;

function PolicyAgeBadge({ inceptionDate }: { inceptionDate: string }) {
  const age = policyAge(inceptionDate);
  return (
    <span
      title={`First issued ${formatDate(inceptionDate)}`}
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${ageTone[age.tone]}`}
    >
      {age.label}
    </span>
  );
}

interface LedgerProps {
  /** Admins see every agent's sales (with an Agent column and filter); agents only their own. */
  adminMode?: boolean;
  title: string;
  description: string;
  /** Sale open in the details dialog; the caller decides where this lives (URL or state). */
  viewId: string | null;
  onViewChange: (id: string | undefined) => void;
  initialSearch?: string | undefined;
  /** Called when the filters are reset, e.g. to clear URL parameters. */
  onReset?: () => void;
  actions: ReactNode;
  /** Shown in the empty state when no sale exists yet. */
  emptyAction: ReactNode;
}

/** The sold-policies table shared by the agent workspace and the admin ledger. */
export function SoldPoliciesLedger({
  adminMode = false,
  title,
  description,
  viewId,
  onViewChange,
  initialSearch,
  onReset,
  actions,
  emptyAction,
}: LedgerProps) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [agentId, setAgentId] = useState("");
  const agents = useQuery({
    queryKey: [...adminKeys.agents, "ledger-filter"],
    queryFn: () => agentsApi.list({ limit: 100 }),
    enabled: adminMode,
    retry: retryUnlessClientError,
  });
  const [insuranceType, setInsuranceType] = useState<InsuranceType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<`${SortKey}:${"asc" | "desc"}`>("issueDate:desc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());
  const [editSale, setEditSale] = useState<ApiSoldPolicy | null>(null);
  const [deleteSale, setDeleteSale] = useState<ApiSoldPolicy | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  useEffect(() => setPage(1), [debouncedSearch, insuranceType, from, to, sort, agentId]);

  const [sortBy, order] = sort.split(":") as [SortKey, "asc" | "desc"];
  const listParams = {
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    insuranceType: insuranceType || undefined,
    agentId: adminMode ? agentId || undefined : undefined,
    from: !rangeInvalid ? from || undefined : undefined,
    to: !rangeInvalid ? to || undefined : undefined,
    sortBy,
    order,
  };
  const sold = useQuery({
    queryKey: agentKeys.soldPolicies(listParams),
    queryFn: () => soldPoliciesApi.list(listParams),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const rows = sold.data?.data ?? [];
  const filtersActive = Boolean(debouncedSearch || insuranceType || from || to || agentId);

  const resetFilters = () => {
    setSearch("");
    setInsuranceType("");
    setFrom("");
    setTo("");
    setSort("issueDate:desc");
    setAgentId("");
    onReset?.();
  };

  return (
    <>
      <SectionCard title={title} icon={ShoppingBag} description={description} actions={actions}>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative col-span-2 md:col-span-4 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Policy no., customer or policy"
              aria-label="Search sold policies"
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>
          <NativeSelect
            value={insuranceType}
            onChange={(event) => setInsuranceType(event.target.value as InsuranceType | "")}
            aria-label="Insurance type"
          >
            <option value="">All types</option>
            <option value="HEALTH">Health</option>
            <option value="MOTOR">Motor</option>
            <option value="LIFE">Life</option>
            <option value="COMMERCIAL">Commercial</option>
          </NativeSelect>
          {adminMode && (
            <NativeSelect
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              aria-label="Agent"
            >
              <option value="">All agents</option>
              {(agents.data?.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName} ({agent.agentCode})
                </option>
              ))}
            </NativeSelect>
          )}
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="Issued from"
            title="Issued from"
            className="h-9 rounded-xl text-xs"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Issued to"
            title="Issued to"
            aria-invalid={rangeInvalid}
            className={`h-9 rounded-xl text-xs ${rangeInvalid ? "border-destructive" : ""}`}
          />
          <NativeSelect
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            aria-label="Sort by"
          >
            <option value="issueDate:desc">Newest issued</option>
            <option value="issueDate:asc">Oldest issued</option>
            <option value="expiryDate:asc">Expiring first</option>
            <option value="premium:desc">Highest premium</option>
            <option value="premium:asc">Lowest premium</option>
          </NativeSelect>
        </div>
        {rangeInvalid && (
          <p className="-mt-2 mb-3 text-xs text-destructive">
            The "from" date must be on or before the "to" date.
          </p>
        )}

        {sold.isLoading && <TableSkeleton columns={adminMode ? 11 : 10} />}
        {sold.error != null && !sold.data && (
          <ErrorState error={sold.error} onRetry={() => void sold.refetch()} />
        )}
        {sold.data &&
          rows.length === 0 &&
          (filtersActive ? (
            <EmptyState
              icon={Search}
              title="No sales match these filters"
              action={
                <Button variant="outline" className="rounded-xl" onClick={resetFilters}>
                  <RotateCcw /> Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="No policies sold yet"
              description="Record the first policy sale to see it here."
              action={emptyAction}
            />
          ))}
        {rows.length > 0 && (
          <div className={sold.isPlaceholderData ? "opacity-60 transition-opacity" : ""}>
            <TableScroller>
              <thead>
                <tr className="border-b border-border/70">
                  {[
                    "Policy Number",
                    "Customer",
                    "Policy",
                    ...(adminMode ? ["Agent"] : []),
                    "Insurance Type",
                    "Premium",
                    "Sale Type",
                    "Policy Age",
                    "Issue Date",
                    "Expiry Date",
                    "Renewal Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className={`${thClass} ${heading === "Premium" || heading === "Actions" ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-medium">
                {rows.map((sale) => {
                  const expiry = expiryStatus(sale.expiryDate, sale.isRenewed);
                  return (
                    <tr
                      key={sale.id}
                      className={`transition-colors hover:bg-muted/40 ${expiry.row}`}
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
                      <td className={tdClass}>{sale.policy.policyName}</td>
                      {adminMode && (
                        <td className={tdClass}>
                          <p className="whitespace-nowrap font-semibold text-foreground">
                            {sale.agent.fullName}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {sale.agent.agentCode}
                          </p>
                        </td>
                      )}
                      <td className={tdClass}>
                        <InsuranceTypeBadge type={sale.policy.insuranceType} />
                      </td>
                      <td
                        className={`${tdClass} whitespace-nowrap text-right font-display font-extrabold`}
                      >
                        {formatINR(sale.premium)}
                      </td>
                      <td className={tdClass}>
                        <SaleTypeBadge renewal={sale.isRenewal} />
                      </td>
                      <td className={tdClass}>
                        <PolicyAgeBadge inceptionDate={sale.inceptionDate} />
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
                        {formatDate(sale.issueDate)}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
                        {formatDate(sale.expiryDate)}
                      </td>
                      <td className={tdClass}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${expiry.badge}`}
                        >
                          {expiry.label}
                        </span>
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-xs"
                            onClick={() => onViewChange(sale.id)}
                          >
                            <Eye /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-xs"
                            onClick={() => setEditSale(sale)}
                          >
                            <Pencil /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteSale(sale)}
                          >
                            <Trash2 /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroller>
          </div>
        )}
        <PaginationBar meta={sold.data?.meta} onPageChange={setPage} noun="sales" />
      </SectionCard>

      <SoldPolicyDialog soldPolicyId={viewId} onClose={() => onViewChange(undefined)} />
      <EditSoldPolicyDialog sale={editSale} onClose={() => setEditSale(null)} />
      <DeleteSoldPolicyDialog sale={deleteSale} onClose={() => setDeleteSale(null)} />
    </>
  );
}
