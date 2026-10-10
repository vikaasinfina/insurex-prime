import type { AgentFull } from "@/components/admin/agents-mock-data";
import type { AgentPerformanceRecord, RecentPolicySale } from "@/components/admin/admin-mock-data";
import type { Customer, CustomerPolicy } from "@/components/admin/customers-mock-data";
import type { CustomerInput } from "./customers";
import type {
  AgentPerformanceRow,
  ApiAgentListItem,
  ApiCustomer,
  ApiSoldPolicy,
  CustomerStatus as ApiCustomerStatus,
  Gender,
  InsuranceType,
  SoldPolicyStatus,
} from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO date or timestamp -> "DD MMM YYYY" (UTC, matching how the backend stores dates). */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "DD MMM YYYY" (or already ISO) -> "YYYY-MM-DD"; undefined when it can't be read. */
export function toIsoDate(value: string): string | undefined {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(text);
  const month = match ? MONTHS.findIndex((m) => m.toLowerCase() === match[2]!.toLowerCase()) : -1;
  if (!match || month < 0) return undefined;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

const TYPE_LABELS = {
  HEALTH: "Health",
  MOTOR: "Motor",
  LIFE: "Life",
  COMMERCIAL: "Commercial",
} as const satisfies Record<InsuranceType, string>;

const typeLabel = (type: InsuranceType) => TYPE_LABELS[type];

const policyStatusLabel = (status: SoldPolicyStatus): "Active" | "Expired" =>
  status === "ACTIVE" ? "Active" : "Expired";

export function toRecentSale(sale: ApiSoldPolicy): RecentPolicySale {
  return {
    id: sale.id,
    policyNumber: sale.policyNumber,
    customerName: sale.customer.fullName,
    customerEmail: sale.customer.customerCode,
    policyType: typeLabel(sale.policy.insuranceType),
    policyName: sale.policy.policyName,
    agentName: sale.agent.fullName,
    agentCode: sale.agent.agentCode,
    premium: sale.premium,
    issueDate: formatDisplayDate(sale.issueDate),
    status: policyStatusLabel(sale.policyStatus),
    isRenewal: sale.isRenewal,
  };
}

export function toAgentPerformance(row: AgentPerformanceRow): AgentPerformanceRecord {
  return {
    id: row.agentId,
    name: row.fullName,
    code: row.agentCode,
    avatar: initials(row.fullName),
    email: "",
    policiesSold: row.policiesSold,
    premiumGenerated: row.totalPremium,
    customers: row.customers,
    status:
      row.status === "ACTIVE" ? "Active" : row.status === "SUSPENDED" ? "Suspended" : "On Leave",
    joinDate: formatDisplayDate(row.lastSaleDate),
    rating: 0,
  };
}

const genderFromApi: Record<Gender, Customer["gender"]> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};
const genderToApi: Record<Customer["gender"], Gender> = {
  Male: "MALE",
  Female: "FEMALE",
  Other: "OTHER",
};
const statusFromApi: Record<ApiCustomerStatus, Customer["status"]> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  INACTIVE: "Expired",
};
const statusToApi: Record<Customer["status"], ApiCustomerStatus> = {
  Active: "ACTIVE",
  Pending: "PENDING",
  Expired: "INACTIVE",
};

/**
 * Customer rows come from /customers; their policies and insurance types are derived
 * from the sold-policy ledger (the customer list only carries a count).
 */
export function toCustomer(customer: ApiCustomer, sales: ApiSoldPolicy[]): Customer {
  const policies: CustomerPolicy[] = sales.map((sale) => ({
    policyNumber: sale.policyNumber,
    type: typeLabel(sale.policy.insuranceType),
    policyName: sale.policy.policyName,
    premium: sale.premium,
    issueDate: formatDisplayDate(sale.issueDate),
    expiryDate: formatDisplayDate(sale.expiryDate),
    agentName: sale.agent.fullName,
    agentCode: sale.agent.agentCode,
    status: policyStatusLabel(sale.policyStatus),
    isRenewal: sale.isRenewal,
  }));
  return {
    id: customer.customerCode,
    name: customer.fullName,
    avatar: initials(customer.fullName),
    phone: customer.phone,
    email: customer.email ?? "",
    dob: formatDisplayDate(customer.dateOfBirth),
    gender: customer.gender ? genderFromApi[customer.gender] : "Other",
    address: customer.address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    nomineeName: customer.nomineeName ?? "",
    nomineeRelation: customer.nomineeRelationship ?? "",
    insuranceTypes: [...new Set(policies.map((policy) => policy.type))],
    policies,
    agentName: customer.assignedAgent?.fullName ?? "Unassigned",
    agentCode: customer.assignedAgent?.agentCode ?? "",
    status: statusFromApi[customer.status],
    dateAdded: customer.createdAt.slice(0, 10),
    lastUpdated: formatDisplayDate(customer.updatedAt),
  };
}

export function toCustomerInput(
  form: Pick<
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
    | "status"
  >,
  assignedAgentId: string | null,
): CustomerInput & { fullName: string; phone: string } {
  const dateOfBirth = toIsoDate(form.dob);
  return {
    fullName: form.name.trim(),
    phone: form.phone.trim(),
    ...(form.email.trim() && { email: form.email.trim() }),
    ...(dateOfBirth && { dateOfBirth }),
    gender: genderToApi[form.gender],
    ...(form.address.trim() && { address: form.address.trim() }),
    ...(form.city.trim() && { city: form.city.trim() }),
    ...(form.state.trim() && { state: form.state.trim() }),
    ...(form.nomineeName.trim() && { nomineeName: form.nomineeName.trim() }),
    ...(form.nomineeRelation.trim() && { nomineeRelationship: form.nomineeRelation.trim() }),
    status: statusToApi[form.status],
    assignedAgentId,
  };
}

export function toAgentFull(agent: ApiAgentListItem): AgentFull {
  return {
    id: agent.id,
    name: agent.fullName,
    code: agent.agentCode,
    avatar: agent.fullName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    email: agent.email,
    phone: agent.phone,
    password: agent.initialPassword,
    address: agent.address ?? "",
    city: "",
    state: "",
    pincode: "",
    policiesSold: agent.stats?.policiesSold ?? 0,
    premiumGenerated: 0,
    customers: agent.stats?.customers ?? 0,
    status: agent.status === "ACTIVE" ? "Active" : "Inactive",
    joinDate: agent.joinedAt,
    rating: 0,
    specialization: "Both",
    region: "",
  };
}
