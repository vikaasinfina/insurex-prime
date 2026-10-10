export interface KpiStats {
  totalPolicies: number;
  policiesSold: number;
  activePolicies: number;
  totalPremium: number;
  totalAgents: number;
  policiesGrowth: string;
  soldGrowth: string;
  activeGrowth: string;
  premiumGrowth: string;
  agentsGrowth: string;
}

export interface SalesDataPoint {
  period: string;
  policiesSold: number;
  premiumAmount: number; // in INR
}

export interface PolicyDistributionItem {
  name: string;
  value: number;
  color: string;
  count: number;
  percentage: string;
}

export interface AgentPerformanceRecord {
  id: string;
  name: string;
  code: string;
  avatar: string;
  email: string;
  policiesSold: number;
  premiumGenerated: number;
  customers: number;
  status: "Active" | "On Leave" | "Suspended";
  joinDate: string;
  rating: number;
}

export interface RecentPolicySale {
  id: string;
  policyNumber: string;
  customerName: string;
  customerEmail: string;
  policyType: "Health" | "Motor" | "Life" | "Commercial" | "Other";
  policyName: string;
  agentName: string;
  agentCode: string;
  premium: number;
  issueDate: string;
  status: "Active" | "Pending" | "In Review" | "Expired";
  /** True when this sale renews an earlier one. */
  isRenewal?: boolean;
}

export interface PolicyCategorySummary {
  category: "Health Insurance" | "Motor Insurance" | "Life Insurance" | "Commercial Insurance";
  total: number;
  active: number;
  expired: number;
  pending: number;
  totalPremium: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  type: "policy" | "agent" | "system" | "claim";
}

// Currency Formatter helper
// Recent Policy Sales list
export const recentPolicySalesList: RecentPolicySale[] = [
  {
    id: "pol-10021",
    policyNumber: "POL-10021",
    customerName: "Rahul Sharma",
    customerEmail: "rahul.s@example.com",
    policyType: "Health",
    policyName: "Health Gold",
    agentName: "Agent 01",
    agentCode: "AGT-01",
    premium: 15000,
    issueDate: "26 Sep 2026",
    status: "Active",
  },
  {
    id: "pol-10020",
    policyNumber: "POL-10020",
    customerName: "Arun Kumar",
    customerEmail: "arun.k@example.com",
    policyType: "Motor",
    policyName: "Car Comprehensive",
    agentName: "Agent 02",
    agentCode: "AGT-02",
    premium: 9500,
    issueDate: "26 Sep 2026",
    status: "Active",
  },
  {
    id: "pol-10019",
    policyNumber: "POL-10019",
    customerName: "Meera Nair",
    customerEmail: "meera.nair@example.com",
    policyType: "Health",
    policyName: "Family Floater Plus",
    agentName: "Agent 03",
    agentCode: "AGT-03",
    premium: 22500,
    issueDate: "25 Sep 2026",
    status: "Active",
  },
  {
    id: "pol-10018",
    policyNumber: "POL-10018",
    customerName: "Sandeep Roy",
    customerEmail: "sandeep.roy@example.com",
    policyType: "Motor",
    policyName: "Two-Wheeler Protect",
    agentName: "Agent 01",
    agentCode: "AGT-01",
    premium: 4200,
    issueDate: "25 Sep 2026",
    status: "Active",
  },
  {
    id: "pol-10017",
    policyNumber: "POL-10017",
    customerName: "Ananya Sen",
    customerEmail: "ananya.sen@example.com",
    policyType: "Health",
    policyName: "Critical Care 360",
    agentName: "Agent 04",
    agentCode: "AGT-04",
    premium: 18000,
    issueDate: "24 Sep 2026",
    status: "Pending",
  },
  {
    id: "pol-10016",
    policyNumber: "POL-10016",
    customerName: "Devendra Singh",
    customerEmail: "devendra.singh@example.com",
    policyType: "Motor",
    policyName: "Commercial Fleet Shield",
    agentName: "Agent 02",
    agentCode: "AGT-02",
    premium: 45000,
    issueDate: "24 Sep 2026",
    status: "Active",
  },
  {
    id: "pol-10015",
    policyNumber: "POL-10015",
    customerName: "Kavita Reddy",
    customerEmail: "kavita.r@example.com",
    policyType: "Health",
    policyName: "Senior Citizen Care",
    agentName: "Agent 03",
    agentCode: "AGT-03",
    premium: 28000,
    issueDate: "23 Sep 2026",
    status: "In Review",
  },
];

export const formatINR = (value: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};
