import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FilePlus2, Loader2, Pencil, ShieldAlert, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  customersApi,
  retryUnlessClientError,
  type ApiCustomer,
  type CustomerInput,
} from "@/lib/api";
import type { CustomerStatus, Gender } from "@/lib/api/types";
import { agentKeys } from "@/lib/agent-queries";
import { formatDate, formatINR } from "@/lib/format";
import {
  CodeChip,
  CustomerStatusBadge,
  DetailRow,
  ErrorState,
  errorText,
  InsuranceTypeBadge,
  NativeSelect,
  PaymentStatusBadge,
  SaleStatusBadge,
} from "./agent-ui";

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: Gender | "";
  address: string;
  city: string;
  state: string;
  status: CustomerStatus;
}

const emptyForm: FormState = {
  fullName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  city: "",
  state: "",
  status: "ACTIVE",
};

const toForm = (customer: ApiCustomer): FormState => ({
  fullName: customer.fullName,
  phone: customer.phone,
  email: customer.email ?? "",
  dateOfBirth: customer.dateOfBirth ?? "",
  gender: customer.gender ?? "",
  address: customer.address ?? "",
  city: customer.city ?? "",
  state: customer.state ?? "",
  status: customer.status,
});

/** Same rules as the API, so most mistakes are caught before a request. */
function validate(form: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.fullName.trim().length < 2) errors.fullName = "Enter the customer's full name.";
  const phone = form.phone.trim();
  if (!/^[+\d][\d\s-]*$/.test(phone) || phone.length < 7 || phone.length > 20) {
    errors.phone = "Enter a valid phone number (digits, spaces, + and - only).";
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    errors.dateOfBirth = "Date of birth cannot be in the future.";
  }
  return errors;
}

/** Only fields with a value are sent; the API assigns the customer to the signed-in agent. */
function toInput(form: FormState, editing: boolean): CustomerInput {
  const text = (value: string) => value.trim();
  const optional = (value: string) => (text(value) || editing ? text(value) : undefined);
  const input: CustomerInput = {
    fullName: text(form.fullName),
    phone: text(form.phone),
    status: form.status,
  };
  if (text(form.email)) input.email = text(form.email);
  if (form.dateOfBirth) input.dateOfBirth = form.dateOfBirth;
  if (form.gender) input.gender = form.gender;
  for (const key of ["address", "city", "state"] as const) {
    const value = optional(form[key]);
    if (value !== undefined) input[key] = value;
  }
  return input;
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-bold uppercase tracking-wider">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CustomerFormDialog({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Present when editing. */
  customer?: ApiCustomer | null | undefined;
  onClose: () => void;
  onSaved?: (customer: ApiCustomer) => void;
}) {
  const editing = Boolean(customer);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => (customer ? toForm(customer) : emptyForm));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: CustomerInput) =>
      customer
        ? customersApi.update(customer.id, input)
        : customersApi.create({ ...input, fullName: input.fullName!, phone: input.phone! }),
    onSuccess: async (saved) => {
      toast.success(editing ? "Customer updated." : `${saved.fullName} added to your customers.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentKeys.customersAll }),
        queryClient.invalidateQueries({ queryKey: agentKeys.customer(saved.id) }),
        queryClient.invalidateQueries({ queryKey: agentKeys.dashboardAll }),
      ]);
      onSaved?.(saved);
      onClose();
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems = validate(form);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    mutation.mutate(toInput(form, editing));
  };

  const inputClass = (key: keyof FormState) =>
    `h-10 rounded-xl ${errors[key] ? "border-destructive focus-visible:ring-destructive/30" : ""}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing ? "Edit customer" : "Add a customer"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the customer's contact details."
              : "New customers are assigned to you automatically."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="cf-name" label="Full name" required error={errors.fullName}>
              <Input
                id="cf-name"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                autoComplete="off"
                maxLength={120}
                aria-invalid={Boolean(errors.fullName)}
                className={inputClass("fullName")}
              />
            </Field>
            <Field id="cf-phone" label="Phone" required error={errors.phone}>
              <Input
                id="cf-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+91 98765 43210"
                maxLength={20}
                aria-invalid={Boolean(errors.phone)}
                className={inputClass("phone")}
              />
            </Field>
            <Field id="cf-email" label="Email" error={errors.email}>
              <Input
                id="cf-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                maxLength={254}
                aria-invalid={Boolean(errors.email)}
                className={inputClass("email")}
              />
            </Field>
            <Field id="cf-dob" label="Date of birth" error={errors.dateOfBirth}>
              <Input
                id="cf-dob"
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                className={inputClass("dateOfBirth")}
              />
            </Field>
            <Field id="cf-gender" label="Gender">
              <NativeSelect
                id="cf-gender"
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as Gender | "")}
                className="h-10 w-full text-sm"
              >
                <option value="">Not specified</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            </Field>
            <Field id="cf-status" label="Status">
              <NativeSelect
                id="cf-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value as CustomerStatus)}
                className="h-10 w-full text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="INACTIVE">Inactive</option>
              </NativeSelect>
            </Field>
          </div>

          <Field id="cf-address" label="Address">
            <Textarea
              id="cf-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              maxLength={500}
              rows={2}
              className="rounded-xl"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="cf-city" label="City">
              <Input
                id="cf-city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                maxLength={80}
                className="h-10 rounded-xl"
              />
            </Field>
            <Field id="cf-state" label="State">
              <Input
                id="cf-state"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                maxLength={80}
                className="h-10 rounded-xl"
              />
            </Field>
          </div>

          {mutation.error != null && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-xs font-medium text-destructive"
            >
              <ShieldAlert className="size-3.5 shrink-0" />
              {errorText(mutation.error, "The customer could not be saved.")}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="rounded-xl">
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerDetailDialog({
  customerId,
  onClose,
  onEdit,
  onViewPolicy,
}: {
  customerId: string | null;
  onClose: () => void;
  onEdit: (customer: ApiCustomer) => void;
  onViewPolicy: (soldPolicyId: string) => void;
}) {
  const query = useQuery({
    queryKey: agentKeys.customer(customerId ?? ""),
    queryFn: () => customersApi.get(customerId!),
    enabled: Boolean(customerId),
    retry: retryUnlessClientError,
  });
  const customer = query.data;

  return (
    <Dialog open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <UserRound className="size-5 text-primary" />
            {customer?.fullName ?? "Customer"}
          </DialogTitle>
          <DialogDescription>
            {customer ? `Customer since ${formatDate(customer.createdAt)}` : "Loading details"}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading && <Skeleton className="h-64 rounded-xl" />}
        {query.error != null && (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
        {customer && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CodeChip>{customer.customerCode}</CodeChip>
              <CustomerStatusBadge status={customer.status} />
            </div>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DetailRow label="Phone" value={customer.phone} />
              <DetailRow label="Email" value={customer.email ?? "—"} />
              <DetailRow label="Date of birth" value={formatDate(customer.dateOfBirth)} />
              <DetailRow
                label="Gender"
                value={
                  customer.gender
                    ? customer.gender.charAt(0) + customer.gender.slice(1).toLowerCase()
                    : "—"
                }
              />
              <DetailRow
                label="Address"
                value={
                  [customer.address, customer.city, customer.state].filter(Boolean).join(", ") ||
                  "—"
                }
              />
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Policies
              </h3>
              {customer.policies.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-surface/40 p-4 text-sm text-muted-foreground">
                  No policies sold to this customer yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {customer.policies.map((policy) => (
                    <li key={policy.id}>
                      <button
                        type="button"
                        onClick={() => onViewPolicy(policy.id)}
                        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-left text-xs transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{policy.policyName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {policy.policyNumber} · {formatDate(policy.issueDate)} –{" "}
                            {formatDate(policy.expiryDate)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <InsuranceTypeBadge type={policy.insuranceType} />
                          <SaleTypeBadge renewal={policy.isRenewal} />
                          <span className="font-display font-extrabold">
                            {formatINR(policy.premium)}
                          </span>
                          <SaleStatusBadge
                            status={policy.policyStatus}
                            expiryDate={policy.expiryDate}
                            renewed={policy.isRenewed}
                          />
                          <PaymentStatusBadge status={policy.paymentStatus} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Close
          </Button>
          {customer && (
            <>
              <Button variant="outline" onClick={() => onEdit(customer)} className="rounded-xl">
                <Pencil /> Edit
              </Button>
              {customer.status !== "INACTIVE" && (
                <Button asChild className="rounded-xl">
                  <Link to="/agent/sell-policy">
                    <FilePlus2 /> Record sold policy
                  </Link>
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
