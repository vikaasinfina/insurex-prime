import {
  AlertTriangle,
  Building2,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  HeartPulse,
  RotateCcw,
  Umbrella,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { expiryStatus } from "@/lib/expiry-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, type PaginationMeta } from "@/lib/api";
import type {
  CustomerStatus,
  InsuranceType,
  PaymentStatus,
  SoldPolicyStatus,
} from "@/lib/api/types";
import {
  customerStatusLabel,
  insuranceTypeLabel,
  paymentStatusLabel,
  policyStatusLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/ui/select-field";

// ─── Containers ───────────────────────────────────────────────────────────────
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border/80 bg-background/90 p-3.5 shadow-xs sm:rounded-2xl sm:p-5",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-2">
                {Icon && <Icon className="size-4.5 shrink-0 text-primary" />}
                <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                  {title}
                </h2>
              </div>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(title || actions ? "pt-4" : "", bodyClassName)}>{children}</div>
    </section>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 font-display text-base font-bold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function errorText(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export function ErrorState({
  error,
  onRetry,
  title = "We couldn't load this",
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <p className="mt-4 font-display text-base font-bold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{errorText(error)}</p>
      {error instanceof ApiError && error.requestId && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Reference: {error.requestId}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-5 rounded-xl">
          <RotateCcw /> Try again
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className="h-8 flex-1 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const toneClass: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
};

const toneIcon: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  neutral: CircleSlash,
  info: Clock,
};

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
        toneClass[tone],
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

const policyTone: Record<SoldPolicyStatus, Tone> = {
  ACTIVE: "success",
  PENDING: "warning",
  EXPIRED: "neutral",
  CANCELLED: "danger",
};
const paymentTone: Record<PaymentStatus, Tone> = {
  PAID: "success",
  PENDING: "warning",
  DUE: "danger",
  FAILED: "danger",
  REFUNDED: "neutral",
};
const customerTone: Record<CustomerStatus, Tone> = {
  ACTIVE: "success",
  PENDING: "warning",
  INACTIVE: "neutral",
};

export const PolicyStatusBadge = ({ status }: { status: SoldPolicyStatus }) => (
  <StatusPill tone={policyTone[status]} label={policyStatusLabel[status]} />
);
/**
 * Status of a sale as the agent cares about it: whether it is still in force or due for renewal.
 * Cancelled and pending sales keep their own status; the rest follow the expiry date.
 */
export function SaleStatusBadge({
  status,
  expiryDate,
  renewed = false,
}: {
  status: SoldPolicyStatus;
  expiryDate: string;
  renewed?: boolean;
}) {
  if (status === "CANCELLED" || status === "PENDING") return <PolicyStatusBadge status={status} />;
  const expiry = expiryStatus(expiryDate, renewed);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${expiry.badge}`}
    >
      {expiry.label}
    </span>
  );
}
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <StatusPill tone={paymentTone[status]} label={paymentStatusLabel[status]} />
);
export const CustomerStatusBadge = ({ status }: { status: CustomerStatus }) => (
  <StatusPill tone={customerTone[status]} label={customerStatusLabel[status]} />
);

const typeIcon = {
  HEALTH: HeartPulse,
  MOTOR: CarFront,
  LIFE: Umbrella,
  COMMERCIAL: Building2,
} as const;
const typeTone = {
  HEALTH: "bg-primary/10 text-primary",
  MOTOR: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  LIFE: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  COMMERCIAL: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
} as const;

export function InsuranceTypeBadge({ type }: { type: InsuranceType }) {
  const Icon = typeIcon[type];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cn("grid size-6 place-items-center rounded-md", typeTone[type])}>
        <Icon className="size-3.5" />
      </span>
      <span className="font-semibold text-foreground">{insuranceTypeLabel[type]}</span>
    </span>
  );
}

export function CodeChip({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-border/50 bg-surface/80 px-2 py-1 font-mono text-[11px] font-bold text-foreground">
      {children}
    </span>
  );
}

// ─── Tables & pagination ──────────────────────────────────────────────────────
/** Horizontal scroll inside the card so wide tables never widen the page. */
export function TableScroller({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 max-md:mx-0 max-md:overflow-visible max-md:px-0">
      <table data-cards className="w-full min-w-[720px] border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  );
}

export const thClass =
  "py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap first:pl-1 last:pr-1";
export const tdClass = "py-3.5 px-3 align-middle first:pl-1 last:pr-1";

export function PaginationBar({
  meta,
  onPageChange,
  noun = "records",
}: {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (!meta || meta.total === 0) return null;
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground sm:flex-row">
      <span>
        Showing <span className="font-semibold text-foreground">{first}</span>–
        <span className="font-semibold text-foreground">{last}</span> of{" "}
        <span className="font-semibold text-foreground">{meta.total.toLocaleString("en-IN")}</span>{" "}
        {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft /> Previous
        </Button>
        <span className="tabular-nums">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

// ─── Form controls ────────────────────────────────────────────────────────────
/** Select styled like the design system's inputs; renders a Radix menu so it opens in place. */
export function NativeSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <SelectField
      {...props}
      className={cn(
        "h-9 w-auto rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50",
        className,
      )}
    />
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-surface/40 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
