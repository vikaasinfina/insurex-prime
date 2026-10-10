import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { retryUnlessClientError, soldPoliciesApi } from "@/lib/api";
import { agentKeys } from "@/lib/agent-queries";
import { formatDate, formatDateTime, formatINR, paymentMethodLabel } from "@/lib/format";
import { CodeChip, DetailRow, ErrorState, InsuranceTypeBadge } from "./agent-ui";

export function SoldPolicyDialog({
  soldPolicyId,
  onClose,
}: {
  soldPolicyId: string | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: agentKeys.soldPolicy(soldPolicyId ?? ""),
    queryFn: () => soldPoliciesApi.get(soldPolicyId!),
    enabled: Boolean(soldPolicyId),
    retry: retryUnlessClientError,
  });
  const sale = query.data;

  return (
    <Dialog open={Boolean(soldPolicyId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <FileText className="size-5 text-primary" />
            {sale ? sale.policy.policyName : "Policy sale"}
          </DialogTitle>
          <DialogDescription>
            {sale ? `Sold to ${sale.customer.fullName}` : "Loading policy details"}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading && <Skeleton className="h-64 rounded-xl" />}
        {query.error != null && (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
        {sale && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CodeChip>{sale.policyNumber}</CodeChip>
              <InsuranceTypeBadge type={sale.policy.insuranceType} />
              <SaleTypeBadge renewal={sale.isRenewal} />
            </div>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DetailRow label="Customer" value={sale.customer.fullName} />
              <DetailRow label="Insurer policy number" value={sale.insurerPolicyNumber ?? "—"} />
              <DetailRow label="Premium" value={formatINR(sale.premium, true)} />
              <DetailRow label="Issue date" value={formatDate(sale.issueDate)} />
              <DetailRow label="Expiry date" value={formatDate(sale.expiryDate)} />
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
