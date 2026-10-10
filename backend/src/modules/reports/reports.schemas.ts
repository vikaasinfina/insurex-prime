import { z } from "zod";
import {
  AgentStatus,
  InsuranceType,
  PaymentStatus,
  PolicyStatus,
} from "../../generated/prisma/enums.js";
import { dateRangeQuerySchema, paginationQuerySchema } from "../../utils/pagination.js";

// ─── Queries ──────────────────────────────────────────────────────────────────
export const intervalSchema = z.enum(["day", "week", "month"]).default("month");

export const summaryQuerySchema = dateRangeQuerySchema;

export const salesQuerySchema = dateRangeQuerySchema.extend({
  interval: intervalSchema,
  insuranceType: z.enum(InsuranceType).optional(),
});

export const agentPerformanceQuerySchema = dateRangeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.enum(["premium", "policiesSold", "customers"]).default("premium"),
});

export const recentSalesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const salesReportQuerySchema = salesQuerySchema.extend({
  agentId: z.uuid().optional(),
});

export const policiesReportQuerySchema = paginationQuerySchema
  .extend(dateRangeQuerySchema.shape)
  .extend({
    insuranceType: z.enum(InsuranceType).optional(),
    status: z.enum(PolicyStatus).optional(),
    sortBy: z.enum(["policiesSold", "premium", "policyName"]).default("policiesSold"),
  });

export const agentsReportQuerySchema = paginationQuerySchema
  .extend(dateRangeQuerySchema.shape)
  .extend({
    status: z.enum(AgentStatus).optional(),
    sortBy: z.enum(["premium", "policiesSold", "customers", "fullName"]).default("premium"),
  });

// ─── Responses ────────────────────────────────────────────────────────────────
export const summarySchema = z
  .object({
    totalPolicies: z.number().int().describe("Catalog policies (ACTIVE only for agents)"),
    activePolicies: z.number().int().describe("ACTIVE catalog policies"),
    policiesSold: z.number().int(),
    activeSoldPolicies: z.number().int(),
    pendingSoldPolicies: z.number().int(),
    expiredSoldPolicies: z.number().int(),
    renewedSoldPolicies: z.number().int().describe("Sales a later sale has renewed"),
    cancelledSoldPolicies: z.number().int(),
    totalPremium: z.number().describe("Premium of non-cancelled sold policies"),
    premiumCollected: z.number().describe("Sum of PAID receipts"),
    totalAgents: z.number().int().nullable().describe("null for agents"),
    totalCustomers: z.number().int(),
  })
  .meta({ id: "DashboardSummary" });

export const salesSeriesSchema = z
  .object({
    interval: z.enum(["day", "week", "month"]),
    from: z.string(),
    to: z.string(),
    points: z.array(
      z.object({
        period: z.string().describe("Start of the period, YYYY-MM-DD"),
        policiesSold: z.number().int(),
        premium: z.number(),
      }),
    ),
  })
  .meta({ id: "SalesSeries" });

export const distributionSchema = z
  .array(
    z.object({
      insuranceType: z.enum(InsuranceType),
      policiesSold: z.number().int(),
      premium: z.number(),
      percentage: z.number(),
    }),
  )
  .meta({ id: "PolicyDistribution" });

export const portfolioSummarySchema = z
  .array(
    z.object({
      insuranceType: z.enum(InsuranceType),
      total: z.number().int(),
      active: z.number().int(),
      pending: z.number().int(),
      expired: z.number().int(),
      renewed: z.number().int(),
      totalPremium: z.number(),
    }),
  )
  .meta({ id: "PortfolioSummary" });

export const agentPerformanceSchema = z
  .object({
    agentId: z.uuid(),
    agentCode: z.string(),
    fullName: z.string(),
    status: z.enum(AgentStatus),
    customers: z.number().int(),
    policiesSold: z.number().int(),
    totalPremium: z.number(),
    premiumCollected: z.number(),
    lastSaleDate: z.string().nullable(),
  })
  .meta({ id: "AgentPerformance" });

export const policyPerformanceSchema = z
  .object({
    policyId: z.uuid(),
    policyCode: z.string(),
    policyName: z.string(),
    insuranceType: z.enum(InsuranceType),
    status: z.enum(PolicyStatus),
    catalogPremium: z.number(),
    policiesSold: z.number().int(),
    totalPremium: z.number(),
  })
  .meta({ id: "PolicyPerformance" });

const breakdownRow = (status: z.ZodType) =>
  z.object({ status, count: z.number().int(), premium: z.number() });

export const salesReportSchema = z
  .object({
    summary: summarySchema,
    timeline: salesSeriesSchema,
    byType: distributionSchema,
    byPolicyStatus: z.array(
      breakdownRow(z.enum(["ACTIVE", "PENDING", "EXPIRED", "RENEWED", "CANCELLED"])),
    ),
    byPaymentStatus: z.array(breakdownRow(z.enum(PaymentStatus))),
  })
  .meta({ id: "SalesReport" });
