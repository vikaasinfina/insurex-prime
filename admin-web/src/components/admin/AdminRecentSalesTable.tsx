import { SaleStatusBadge } from "@/components/agent/agent-ui";
import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  Clock,
  HeartPulse,
  Shield,
  ShieldCheck,
  Tag,
  Umbrella,
} from "lucide-react";
import { formatINR, type RecentPolicySale } from "./admin-mock-data";

export interface AdminRecentSalesTableProps {
  policies: RecentPolicySale[];
}

export function AdminRecentSalesTable({ policies }: AdminRecentSalesTableProps) {
  const getStatusBadge = (status: RecentPolicySale["status"]) => {
    switch (status) {
      case "Active":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> Active
          </span>
        );
      case "In Review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-400">
            <Tag className="size-3" /> In Review
          </span>
        );
      case "Expired":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
            Expired
          </span>
        );
      default:
        return null;
    }
  };

  const getPolicyTypeIcon = (type: RecentPolicySale["policyType"]) => {
    if (type === "Health") {
      return (
        <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
          <HeartPulse className="size-3.5" />
        </span>
      );
    }
    if (type === "Motor") {
      return (
        <span className="grid size-6 place-items-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          <CarFront className="size-3.5" />
        </span>
      );
    }
    if (type === "Life") {
      return (
        <span className="grid size-6 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <Umbrella className="size-3.5" />
        </span>
      );
    }
    if (type === "Commercial") {
      return (
        <span className="grid size-6 place-items-center rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-400">
          <Building2 className="size-3.5" />
        </span>
      );
    }
    return (
      <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
        <Shield className="size-3.5" />
      </span>
    );
  };

  return (
    <section aria-label="Recent Policy Sales" className="w-full">
      <div className="rounded-xl border border-border/80 bg-background/90 p-3.5 shadow-xs sm:rounded-2xl sm:p-5 backdrop-blur-sm">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4.5 text-primary" />
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                Recent Policy Sales
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time audit log of newly underwritten health and motor policies
            </p>
          </div>

          <Link
            to="/admin/policies"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <span>View All Policies</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Table with responsive horizontal scroll */}
        <div className="mt-4 overflow-x-auto">
          <table data-cards className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pr-4 pl-1">Policy Number</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Policy Type</th>
                <th className="py-3 px-4">Policy Name</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4 text-right">Premium</th>
                <th className="py-3 px-4 text-center">Issue Date</th>
                <th className="py-3 pl-4 pr-1 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 font-medium">
              {policies.map((policy) => (
                <tr key={policy.id} className="transition-colors hover:bg-muted/40 group">
                  {/* Policy Number */}
                  <td className="py-3.5 pr-4 pl-1 font-mono font-bold text-foreground">
                    <span className="rounded-md bg-surface/80 px-2 py-1 border border-border/50">
                      {policy.policyNumber}
                    </span>
                  </td>

                  {/* Customer */}
                  <td className="py-3.5 px-4 font-bold text-foreground">
                    <div>
                      <p>{policy.customerName}</p>
                      <p className="text-[11px] font-normal text-muted-foreground">
                        {policy.customerEmail}
                      </p>
                    </div>
                  </td>

                  {/* Policy Type */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      {getPolicyTypeIcon(policy.policyType)}
                      <span className="font-semibold text-foreground">{policy.policyType}</span>
                    </div>
                  </td>

                  {/* Policy Name */}
                  <td className="py-3.5 px-4 text-foreground font-medium">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {policy.policyName}
                      <SaleTypeBadge renewal={policy.isRenewal ?? false} />
                    </div>
                  </td>

                  {/* Agent */}
                  <td className="py-3.5 px-4 text-muted-foreground">
                    <span className="font-semibold text-foreground">{policy.agentName}</span>
                    <span className="text-[10px] text-muted-foreground block">
                      ({policy.agentCode})
                    </span>
                  </td>

                  {/* Premium */}
                  <td className="py-3.5 px-4 text-right font-display font-extrabold text-foreground">
                    {formatINR(policy.premium)}
                  </td>

                  {/* Issue Date */}
                  <td className="py-3.5 px-4 text-center text-muted-foreground whitespace-nowrap">
                    {policy.issueDate}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 pl-4 pr-1 text-right whitespace-nowrap">
                    {policy.live ? (
                      <SaleStatusBadge
                        status={policy.live.policyStatus}
                        expiryDate={policy.live.expiryDate}
                        renewed={policy.live.isRenewed}
                      />
                    ) : (
                      getStatusBadge(policy.status)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span>Showing latest {policies.length} records</span>
          <Link
            to="/admin/policies"
            className="font-medium text-primary hover:underline flex items-center gap-1"
          >
            Access Full Policy Ledger <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
