import { SaleTypeBadge } from "@/components/SaleTypeBadge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
  FileText,
  Filter,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Toaster } from "@/components/ui/sonner";
import { requireAdminSession } from "@/lib/admin-route-guard";
import { useAdminAgents, useAdminCustomers } from "@/hooks/use-admin-live-data";
import { adminKeys } from "@/lib/admin-queries";
import { ApiError, customersApi, isApiConfigured } from "@/lib/api";
import { toCustomerInput } from "@/lib/api/admin-mappers";
import {
  agentFilterOptions,
  customerKpiData,
  customersFullList,
  formatINR,
  type Customer,
  type CustomerStatus,
  type InsuranceType,
} from "@/components/admin/customers-mock-data";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { SelectField } from "@/components/ui/select-field";

const NO_CUSTOMERS: Customer[] = [];

export const Route = createFileRoute("/admin/customers")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: () => ({
    meta: [
      { title: "Customers Directory — InsuroX Prime" },
      { name: "description", content: "Manage InsuroX policyholder customer records." },
    ],
  }),
  component: AdminCustomersPage,
});

type AgentOption = { code: string; name: string; id?: string };

type CustomerFormData = Pick<
  Customer,
  | "name"
  | "phone"
  | "email"
  | "dob"
  | "gender"
  | "address"
  | "city"
  | "state"
  | "nomineeName"
  | "nomineeRelation"
  | "insuranceTypes"
  | "agentName"
  | "agentCode"
  | "status"
>;

const emptyCustomerForm: CustomerFormData = {
  name: "",
  phone: "",
  email: "",
  dob: "",
  gender: "Other",
  address: "",
  city: "",
  state: "",
  nomineeName: "",
  nomineeRelation: "",
  insuranceTypes: ["Health"],
  agentName: "",
  agentCode: "",
  status: "Active",
};

const statusStyles: Record<CustomerStatus, string> = {
  Active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Pending: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Expired: "border-destructive/20 bg-destructive/10 text-destructive",
};

function makeAvatar(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toCustomerForm(customer: Customer): CustomerFormData {
  return {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    dob: customer.dob,
    gender: customer.gender,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    nomineeName: customer.nomineeName,
    nomineeRelation: customer.nomineeRelation,
    insuranceTypes: [...customer.insuranceTypes],
    agentName: customer.agentName,
    agentCode: customer.agentCode,
    status: customer.status,
  };
}

function CustomerKpiCards({ customers }: { customers: Customer[] }) {
  const cards = [
    {
      label: "Total Customers",
      value: customers.length.toLocaleString("en-IN"),
      growth: customerKpiData.customersGrowth,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Active Customers",
      value: customers
        .filter((customer) => customer.status === "Active")
        .length.toLocaleString("en-IN"),
      growth: customerKpiData.activeGrowth,
      icon: UserCheck,
      color: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Health Covered",
      value: customers
        .filter((customer) => customer.insuranceTypes.includes("Health"))
        .length.toLocaleString("en-IN"),
      growth: customerKpiData.healthGrowth,
      icon: HeartPulse,
      color: "text-rose-700 dark:text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Motor Covered",
      value: customers
        .filter((customer) => customer.insuranceTypes.includes("Motor"))
        .length.toLocaleString("en-IN"),
      growth: customerKpiData.motorGrowth,
      icon: Shield,
      color: "text-sky-700 dark:text-sky-400",
      bg: "bg-sky-500/10",
    },
  ];

  return (
    <section
      aria-label="Customer statistics"
      className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className="rounded-xl border border-border/80 bg-background/90 p-3 shadow-xs sm:rounded-2xl sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-lg sm:size-9 sm:rounded-xl ${card.bg} ${card.color}`}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-display text-xl font-extrabold text-foreground sm:mt-3 sm:text-2xl">
              {card.value}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="size-3" /> {card.growth}
            </p>
          </article>
        );
      })}
    </section>
  );
}

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge variant="outline" className={`rounded-full font-bold ${statusStyles[status]}`}>
      {status === "Active" && <CheckCircle2 className="mr-1 size-3" />}
      {status}
    </Badge>
  );
}

function CustomerFormModal({
  mode,
  initial,
  agentOptions,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  initial: CustomerFormData;
  agentOptions: AgentOption[];
  onClose: () => void;
  onSubmit: (data: CustomerFormData) => void | Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const setField = <K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const toggleInsuranceType = (type: InsuranceType) => {
    setField(
      "insuranceTypes",
      form.insuranceTypes.includes(type)
        ? form.insuranceTypes.filter((item) => item !== type)
        : [...form.insuranceTypes, type],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.insuranceTypes.length === 0) {
      toast.error("Select at least one insurance type.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "mt-1 h-10 rounded-xl";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold">
            {mode === "add" ? "Add Customer" : "Edit Customer"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "add"
              ? "Create a customer profile in the local demo directory."
              : "Update customer contact and account details."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="customer-name">Full name *</Label>
              <Input
                id="customer-name"
                className={fieldClass}
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="customer-phone">Phone *</Label>
              <Input
                id="customer-phone"
                className={fieldClass}
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="customer-email">Email *</Label>
              <Input
                id="customer-email"
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="customer-dob">Date of birth</Label>
              <Input
                id="customer-dob"
                className={fieldClass}
                placeholder="DD MMM YYYY"
                value={form.dob}
                onChange={(event) => setField("dob", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-gender">Gender</Label>
              <SelectField
                id="customer-gender"
                className={`w-full border border-input bg-background px-3 text-sm ${fieldClass}`}
                value={form.gender}
                onChange={(event) => setField("gender", event.target.value as Customer["gender"])}
              >
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </SelectField>
            </div>
            <div>
              <Label htmlFor="customer-status">Status</Label>
              <SelectField
                id="customer-status"
                className={`w-full border border-input bg-background px-3 text-sm ${fieldClass}`}
                value={form.status}
                onChange={(event) => setField("status", event.target.value as CustomerStatus)}
              >
                <option>Active</option>
                <option>Pending</option>
                <option>Expired</option>
              </SelectField>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="customer-address">Address</Label>
              <Input
                id="customer-address"
                className={fieldClass}
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-city">City</Label>
              <Input
                id="customer-city"
                className={fieldClass}
                value={form.city}
                onChange={(event) => setField("city", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-state">State</Label>
              <Input
                id="customer-state"
                className={fieldClass}
                value={form.state}
                onChange={(event) => setField("state", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-nominee">Nominee name</Label>
              <Input
                id="customer-nominee"
                className={fieldClass}
                value={form.nomineeName}
                onChange={(event) => setField("nomineeName", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-relation">Nominee relation</Label>
              <Input
                id="customer-relation"
                className={fieldClass}
                value={form.nomineeRelation}
                onChange={(event) => setField("nomineeRelation", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customer-agent">Assigned agent</Label>
              <SelectField
                id="customer-agent"
                className={`w-full border border-input bg-background px-3 text-sm ${fieldClass}`}
                value={form.agentCode}
                onChange={(event) => {
                  const agent = agentOptions.find((option) => option.code === event.target.value);
                  setForm((previous) => ({
                    ...previous,
                    agentCode: agent?.code ?? "",
                    agentName: agent?.name ?? "",
                  }));
                }}
              >
                <option value="">Unassigned</option>
                {agentOptions.map((agent) => (
                  <option key={agent.code} value={agent.code}>
                    {agent.name} ({agent.code})
                  </option>
                ))}
              </SelectField>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">Insurance types</legend>
              <div className="flex flex-wrap gap-4">
                {(["Health", "Motor", "Life", "Commercial", "Other"] as InsuranceType[]).map(
                  (type) => (
                    <label key={type} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.insuranceTypes.includes(type)}
                        onChange={() => toggleInsuranceType(type)}
                        className="size-4 accent-primary"
                      />
                      {type}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          </div>
          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {mode === "add" ? "Add Customer" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailsDialog({
  customer,
  policiesOnly,
  onClose,
  onEdit,
}: {
  customer: Customer;
  policiesOnly: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="block max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader className="mb-5 pr-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-display text-xl font-bold">
                {policiesOnly ? "Customer Policies" : "Customer Profile"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {customer.id} · Customer record
              </DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Edit2 className="size-3.5" /> Edit
            </Button>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <section className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">
              {customer.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold">{customer.name}</h3>
              <p className="text-xs text-muted-foreground">
                {customer.city}
                {customer.state ? `, ${customer.state}` : ""}
              </p>
            </div>
            <CustomerStatusBadge status={customer.status} />
          </section>

          {!policiesOnly && (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Phone, label: "Phone", value: customer.phone },
                  { icon: Mail, label: "Email", value: customer.email },
                  { icon: MapPin, label: "Address", value: customer.address || "Not provided" },
                  {
                    icon: Users,
                    label: "Date of birth / gender",
                    value:
                      [customer.dob, customer.gender].filter(Boolean).join(" · ") || "Not provided",
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3 text-xs"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-muted-foreground">{label}</p>
                      <p className="mt-0.5 break-words font-semibold">{value}</p>
                    </div>
                  </div>
                ))}
              </section>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Nominee</p>
                  <p className="mt-1 text-sm font-semibold">
                    {customer.nomineeName || "Not provided"}
                  </p>
                  <p className="text-xs text-muted-foreground">{customer.nomineeRelation}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Assigned agent</p>
                  <p className="mt-1 text-sm font-semibold">{customer.agentName || "Unassigned"}</p>
                  <p className="text-xs text-muted-foreground">{customer.agentCode}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Insurance</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {customer.insuranceTypes.length ? (
                      customer.insuranceTypes.map((type) => (
                        <Badge key={type} variant="secondary">
                          {type}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm">None</span>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold">Policy portfolio</h3>
                <p className="text-xs text-muted-foreground">
                  {customer.policies.length} linked policies
                </p>
              </div>
            </div>
            {customer.policies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No policies linked to this customer.
              </div>
            ) : (
              <div className="space-y-2">
                {customer.policies.map((policy) => (
                  <article
                    key={policy.policyNumber}
                    className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {policy.policyName}
                          <SaleTypeBadge renewal={policy.isRenewal ?? false} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {policy.policyNumber} · {policy.type} · {policy.agentName}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Issued {policy.issueDate} · Expires {policy.expiryDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-sm font-bold">{formatINR(policy.premium)}</span>
                      <Badge variant="outline" className={statusStyles[policy.status]}>
                        {policy.status}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminCustomersPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const live = useAdminCustomers();
  const liveAgents = useAdminAgents();
  const [localCustomers, setCustomers] = useState<Customer[]>(customersFullList);
  // Backend rows are keyed by customer code for display; writes need the record ids.
  const customerIds = useMemo(
    () => new Map(live.customers.data?.data.map((row) => [row.customerCode, row.id])),
    [live.customers.data],
  );
  const customers: Customer[] = isApiConfigured ? (live.rows ?? NO_CUSTOMERS) : localCustomers;
  const agentOptions: AgentOption[] = useMemo(
    () =>
      isApiConfigured
        ? (liveAgents.data?.data ?? []).map((agent) => ({
            id: agent.id,
            code: agent.agentCode,
            name: agent.fullName,
          }))
        : agentFilterOptions,
    [liveAgents.data],
  );
  const refreshCustomers = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.customersAll });
  const saveCustomer = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: CustomerFormData }) => {
      const agentId = agentOptions.find((option) => option.code === data.agentCode)?.id ?? null;
      const input = toCustomerInput(data, agentId);
      return id ? customersApi.update(id, input) : customersApi.create(input);
    },
    onSuccess: refreshCustomers,
  });
  const removeCustomer = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: refreshCustomers,
  });
  const errorMessage = (error: unknown) =>
    error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | InsuranceType>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | CustomerStatus>("All");
  const [agentFilter, setAgentFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [viewState, setViewState] = useState<{ customer: Customer; policiesOnly: boolean } | null>(
    null,
  );
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const pageSize = 6;

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        [customer.id, customer.name, customer.phone, customer.email, customer.city].some((value) =>
          value.toLocaleLowerCase().includes(query),
        );
      const matchesType = typeFilter === "All" || customer.insuranceTypes.includes(typeFilter);
      const matchesStatus = statusFilter === "All" || customer.status === statusFilter;
      const matchesAgent = agentFilter === "All" || customer.agentCode === agentFilter;
      return matchesSearch && matchesType && matchesStatus && matchesAgent;
    });
  }, [customers, search, typeFilter, statusFilter, agentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const isFiltered = Boolean(
    search || typeFilter !== "All" || statusFilter !== "All" || agentFilter !== "All",
  );

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("All");
    setStatusFilter("All");
    setAgentFilter("All");
    setPage(1);
  };

  const updateCustomer = async (data: CustomerFormData) => {
    if (!editCustomer) return;
    if (isApiConfigured) {
      const id = customerIds.get(editCustomer.id);
      if (!id) return;
      try {
        await saveCustomer.mutateAsync({ id, data });
        setViewState(null);
        setEditCustomer(null);
        toast.success("Customer profile updated.");
      } catch (error) {
        toast.error(errorMessage(error));
      }
      return;
    }
    const updated = {
      ...editCustomer,
      ...data,
      avatar: makeAvatar(data.name),
      lastUpdated: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    };
    setCustomers((previous) =>
      previous.map((customer) => (customer.id === editCustomer.id ? updated : customer)),
    );
    setViewState((previous) =>
      previous?.customer.id === updated.id ? { ...previous, customer: updated } : previous,
    );
    setEditCustomer(null);
    toast.success("Customer profile updated.");
  };

  const confirmDelete = async () => {
    if (!deleteCustomer) return;
    if (isApiConfigured) {
      const id = customerIds.get(deleteCustomer.id);
      if (!id) return;
      try {
        await removeCustomer.mutateAsync(id);
        toast.success(`${deleteCustomer.name} was removed from the customer directory.`);
        setDeleteCustomer(null);
      } catch (error) {
        toast.error(errorMessage(error));
      }
      return;
    }
    setCustomers((previous) => previous.filter((customer) => customer.id !== deleteCustomer.id));
    toast.success(`${deleteCustomer.name} was removed from the customer directory.`);
    setDeleteCustomer(null);
  };

  const openEdit = (customer: Customer) => {
    setViewState(null);
    setEditCustomer(customer);
  };

  return (
    <div className="min-h-screen bg-surface/30 text-foreground selection:bg-primary/20 selection:text-primary">
      <Toaster position="top-right" richColors />
      <AdminSidebar
        currentPath="/admin/customers"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-h-screen flex-col app-shell-pad">
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                to="/admin/dashboard"
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back to Dashboard
              </Link>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Customers</h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage policyholder profiles, account status, and linked policies.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Search customers"
                  placeholder="Search customers..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-xl bg-background pl-9 pr-8 text-xs sm:w-56"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Clear customer search"
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <CustomerKpiCards customers={customers} />

          <section
            aria-label="Customer filters"
            className="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-xs"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Filter className="size-3.5 text-primary" /> Filters{" "}
                {isFiltered && (
                  <Badge variant="secondary" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
                <SelectField
                  aria-label="Filter by insurance type"
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value as typeof typeFilter);
                    setPage(1);
                  }}
                  className="h-9 rounded-xl border border-border bg-surface/50 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="All">Insurance: All types</option>
                  <option value="Health">Health</option>
                  <option value="Motor">Motor</option>
                  <option value="Life">Life</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Other">Other</option>
                </SelectField>
                <SelectField
                  aria-label="Filter by customer status"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as typeof statusFilter);
                    setPage(1);
                  }}
                  className="h-9 rounded-xl border border-border bg-surface/50 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="All">Status: All</option>
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Expired">Expired</option>
                </SelectField>
                <SelectField
                  aria-label="Filter by assigned agent"
                  value={agentFilter}
                  onChange={(event) => {
                    setAgentFilter(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-xl border border-border bg-surface/50 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="All">Agent: All</option>
                  {agentOptions.map((agent) => (
                    <option key={agent.code} value={agent.code}>
                      {agent.name}
                    </option>
                  ))}
                </SelectField>
                {isFiltered && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-9 rounded-xl text-xs"
                  >
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border/80 bg-background/90 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-display text-base font-bold">Customer Directory</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredCustomers.length}{" "}
                  {filteredCustomers.length === 1 ? "customer" : "customers"} found
                </p>
              </div>
              {!isApiConfigured && (
                <p className="text-[11px] text-muted-foreground">Mock customer records</p>
              )}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-surface/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pl-5 pr-4">Customer</th>
                    <th className="px-4 py-3">Insurance</th>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Policies</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Added</th>
                    <th className="py-3 pl-4 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visibleCustomers.map((customer) => (
                    <tr key={customer.id} className="transition-colors hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {customer.avatar}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold">{customer.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {customer.id} · {customer.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {customer.insuranceTypes.map((type) => (
                            <Badge key={type} variant="secondary">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold">{customer.agentName || "Unassigned"}</p>
                        <p className="text-[11px] text-muted-foreground">{customer.agentCode}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => setViewState({ customer, policiesOnly: true })}
                          className="font-semibold text-primary hover:underline"
                        >
                          {customer.policies.length}{" "}
                          {customer.policies.length === 1 ? "policy" : "policies"}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerStatusBadge status={customer.status} />
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                        {new Date(`${customer.dateAdded}T00:00:00`).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 pl-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewState({ customer, policiesOnly: false })}
                            aria-label={`View ${customer.name}`}
                            title="View details"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditCustomer(customer)}
                            aria-label={`Edit ${customer.name}`}
                            title="Edit customer"
                          >
                            <Edit2 className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteCustomer(customer)}
                            aria-label={`Delete ${customer.name}`}
                            title="Delete customer"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleCustomers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">
                        <Users className="mx-auto mb-3 size-9 opacity-30" />
                        No customers match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border/60 lg:hidden">
              {visibleCustomers.map((customer) => (
                <article key={customer.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {customer.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{customer.name}</h3>
                        <CustomerStatusBadge status={customer.status} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {customer.id} · {customer.city}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="mt-0.5 font-medium">{customer.phone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Assigned agent</p>
                      <p className="mt-0.5 font-medium">{customer.agentName || "Unassigned"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {customer.insuranceTypes.map((type) => (
                        <Badge key={type} variant="secondary">
                          {type}
                        </Badge>
                      ))}
                      <button
                        type="button"
                        onClick={() => setViewState({ customer, policiesOnly: true })}
                        className="px-1 text-xs font-semibold text-primary"
                      >
                        {customer.policies.length} policies
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewState({ customer, policiesOnly: false })}
                        aria-label={`View ${customer.name}`}
                      >
                        <Eye />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditCustomer(customer)}
                        aria-label={`Edit ${customer.name}`}
                      >
                        <Edit2 />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteCustomer(customer)}
                        aria-label={`Delete ${customer.name}`}
                        className="text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
              {visibleCustomers.length === 0 && (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No customers match these filters.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-muted-foreground">
                Showing {filteredCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredCustomers.length)} of{" "}
                {filteredCustomers.length}
              </p>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="h-8 rounded-lg"
                >
                  <ChevronLeft className="size-4" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <span className="min-w-16 text-center text-xs font-semibold">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="h-8 rounded-lg"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        </main>
        <AdminFooter />
      </div>

      {editCustomer && (
        <CustomerFormModal
          key={editCustomer.id}
          mode="edit"
          initial={toCustomerForm(editCustomer)}
          agentOptions={agentOptions}
          onClose={() => setEditCustomer(null)}
          onSubmit={updateCustomer}
        />
      )}
      {viewState && (
        <CustomerDetailsDialog
          customer={viewState.customer}
          policiesOnly={viewState.policiesOnly}
          onClose={() => setViewState(null)}
          onEdit={() => openEdit(viewState.customer)}
        />
      )}
      <AlertDialog
        open={Boolean(deleteCustomer)}
        onOpenChange={(open) => !open && setDeleteCustomer(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteCustomer?.name ?? "this customer"} from the local customer
              list. Their linked policy records are only displayed here and will not be altered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
