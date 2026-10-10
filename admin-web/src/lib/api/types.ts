// Response shapes of the InsuroX backend (see backend/README.md and /docs).

export type Role = "SUPER_ADMIN" | "TENANT_ADMIN" | "AGENT";
export type InsuranceType = "HEALTH" | "MOTOR" | "LIFE" | "COMMERCIAL";
export type AgentStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type CustomerStatus = "ACTIVE" | "PENDING" | "INACTIVE";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type PolicyStatus = "ACTIVE" | "INACTIVE";
export type PremiumFrequency = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL";
export type PaymentStatus = "PENDING" | "DUE" | "PAID" | "FAILED" | "REFUNDED";
export type SoldPolicyStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "UPI" | "NET_BANKING" | "BANK_TRANSFER" | "CHEQUE";

export interface AgentRef {
  id: string;
  agentCode: string;
  fullName: string;
}

export interface ApiAgent extends AgentRef {
  userId: string;
  email: string;
  phone: string;
  address: string | null;
  joinedAt: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  stats?: { customers: number; policiesSold: number };
}

/** Row of the Super Admin agents list. */
export interface ApiAgentListItem extends ApiAgent {
  /** Default password while the agent has not changed it; null afterwards (hash-only). */
  initialPassword: string | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  /** Signed in with a temporary password: must change it before anything else. */
  mustChangePassword: boolean;
  agent: ApiAgent | null;
  /** The user's tenant (agency + insurer); null for platform Super Admins. */
  tenant: ApiTenantRef | null;
}

export interface ApiTenantRef {
  id: string;
  name: string;
  legalName: string;
  /** Agency logo (data URL), or null to show the default mark. */
  logoUrl: string | null;
  /** Every insurer the agency sells for, with its licence codes. */
  insurers: { id: string; code: string; name: string; businessCode: string; licenceCode: string }[];
}

export interface ApiCustomer {
  id: string;
  customerCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  nomineeName: string | null;
  nomineeRelationship: string | null;
  assignedAgent: AgentRef | null;
  status: CustomerStatus;
  policiesCount: number;
  policyNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPolicySummary {
  id: string;
  policyNumber: string;
  policyName: string;
  insuranceType: InsuranceType;
  premium: number;
  issueDate: string;
  expiryDate: string;
  paymentStatus: PaymentStatus;
  policyStatus: SoldPolicyStatus;
  /** This sale renews an earlier one (otherwise it is new). */
  isRenewal: boolean;
  /** A later sale renews this one. */
  isRenewed: boolean;
  agent: AgentRef;
}

export interface ApiCustomerDetail extends ApiCustomer {
  policies: CustomerPolicySummary[];
}

export interface HealthDetails {
  kind: "HEALTH";
  planType: "INDIVIDUAL" | "FAMILY";
  sumInsured: number;
  hospitalizationCoverage: string;
  waitingPeriod: string;
  ageEligibility: string;
}

export interface MotorDetails {
  kind: "MOTOR";
  vehicleType: "PRIVATE_CAR" | "TWO_WHEELER" | "COMMERCIAL_VEHICLE";
  coverageType: "THIRD_PARTY" | "COMPREHENSIVE" | "OWN_DAMAGE";
  ownDamage: string;
  thirdPartyCoverage: string;
  vehicleEligibility: string;
}

export interface ApiPolicy {
  id: string;
  policyCode: string;
  policyName: string;
  insuranceType: InsuranceType;
  description: string;
  insurerId: string;
  insurer: { id: string; code: string; name: string };
  categoryId: string | null;
  category: { id: string; name: string } | null;
  /** Null when the sale is priced on the insurer's own portal. */
  coverageAmount: number | null;
  premium: number | null;
  premiumFrequency: PremiumFrequency;
  durationMonths: number | null;
  eligibility: string;
  benefits: string[];
  terms: string;
  categoryDetails: HealthDetails | MotorDetails | null;
  status: PolicyStatus;
  /** null for agents. */
  policiesSold: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PolicyInput = Omit<
  ApiPolicy,
  | "id"
  | "policiesSold"
  | "createdAt"
  | "updatedAt"
  | "category"
  | "categoryId"
  | "insurer"
  | "insurerId"
> & { categoryId?: string | null; insurerId?: string };

export interface ApiSoldPolicy {
  id: string;
  policyNumber: string;
  insurerPolicyNumber: string | null;
  policy: { id: string; policyCode: string; policyName: string; insuranceType: InsuranceType };
  customer: { id: string; customerCode: string; fullName: string };
  agent: AgentRef;
  premium: number;
  amountPaid: number;
  issueDate: string;
  /** When the policy was first issued; equals issueDate for a new policy. */
  inceptionDate: string;
  /** This sale renews an earlier one (otherwise it is new). */
  isRenewal: boolean;
  /** A later sale renews this one, so it no longer counts as expired. */
  isRenewed: boolean;
  expiryDate: string;
  paymentStatus: PaymentStatus;
  policyStatus: SoldPolicyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiReceiptSummary {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  issuedAt: string;
}

export interface ApiSoldPolicyDetail extends ApiSoldPolicy {
  receipts: ApiReceiptSummary[];
}

export interface SoldPolicyQuote {
  policy: {
    id: string;
    policyCode: string;
    policyName: string;
    insuranceType: InsuranceType;
    coverageAmount: number | null;
    premiumFrequency: PremiumFrequency;
    durationMonths: number | null;
  };
  customer: { id: string; customerCode: string; fullName: string };
  premium: number;
  issueDate: string;
  expiryDate: string;
}

export interface ApiReceipt {
  id: string;
  receiptNumber: string;
  soldPolicy: {
    id: string;
    policyNumber: string;
    policyName: string;
    insuranceType: InsuranceType;
    premium: number;
    issueDate: string;
    expiryDate: string;
    customer: { id: string; customerCode: string; fullName: string };
    agent: AgentRef;
  };
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  issuedAt: string;
}

export interface DashboardSummary {
  totalPolicies: number;
  activePolicies: number;
  policiesSold: number;
  activeSoldPolicies: number;
  pendingSoldPolicies: number;
  expiredSoldPolicies: number;
  cancelledSoldPolicies: number;
  totalPremium: number;
  premiumCollected: number;
  totalAgents: number | null;
  totalCustomers: number;
}

export interface SalesSeries {
  interval: "day" | "week" | "month";
  from: string;
  to: string;
  points: { period: string; policiesSold: number; premium: number }[];
}

export interface PolicyDistributionRow {
  insuranceType: InsuranceType;
  policiesSold: number;
  premium: number;
  percentage: number;
}

export interface PortfolioSummaryRow {
  insuranceType: InsuranceType;
  total: number;
  active: number;
  pending: number;
  expired: number;
  totalPremium: number;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentCode: string;
  fullName: string;
  status: AgentStatus;
  customers: number;
  policiesSold: number;
  totalPremium: number;
  premiumCollected: number;
  lastSaleDate: string | null;
}

export interface PolicyPerformanceRow {
  policyId: string;
  policyCode: string;
  policyName: string;
  insuranceType: InsuranceType;
  status: PolicyStatus;
  catalogPremium: number;
  policiesSold: number;
  totalPremium: number;
}

// ─── Agent workspace ──────────────────────────────────────────────────────────
export type AgentDashboardRange = "7D" | "30D" | "6M" | "1Y";

export interface AgentDashboard {
  summary: {
    customers: number;
    policiesSold: number;
    activePolicies: number;
    totalPremium: number;
    premiumCollected: number;
    pendingPayments: number;
    expiringSoon: number;
    expiredPolicies: number;
  };
  salesTrend: SalesSeries;
  policyDistribution: PolicyDistributionRow[];
  premiumTrend: { period: string; written: number; collected: number }[];
  recentSales: ApiSoldPolicy[];
  recentCustomers: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
    status: CustomerStatus;
    policiesCount: number;
    lastPolicy: {
      policyNumber: string;
      policyName: string;
      insuranceType: InsuranceType;
      issueDate: string;
    } | null;
    createdAt: string;
  }[];
  expiringPolicies: (ApiSoldPolicy & { daysRemaining: number })[];
  expiringWindowDays: number;
  generatedAt: string;
}

export interface AgentProfile extends ApiAgent {
  stats: { customers: number; policiesSold: number };
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  mustChangePassword: boolean;
}
