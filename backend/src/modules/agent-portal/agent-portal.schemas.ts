import { z } from "zod";
import { CustomerStatus, InsuranceType } from "../../generated/prisma/enums.js";
import { agentWithStatsSchema } from "../agents/agents.schemas.js";
import { distributionSchema, salesSeriesSchema } from "../reports/reports.schemas.js";
import { soldPolicySchema } from "../sold-policies/sold-policies.schemas.js";

export const DASHBOARD_RANGES = ["7D", "30D", "6M", "1Y"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const agentDashboardQuerySchema = z.object({
  range: z
    .enum(DASHBOARD_RANGES)
    .default("30D")
    .describe("Window for salesTrend: 7D/30D (daily), 6M (weekly), 1Y (monthly)"),
});

export const agentDashboardSchema = z
  .object({
    summary: z.object({
      customers: z.number().int(),
      policiesSold: z.number().int().describe("Excludes CANCELLED sales"),
      activePolicies: z.number().int().describe("ACTIVE sales that have not passed expiry"),
      totalPremium: z.number().describe("Premium written, excluding CANCELLED sales"),
      premiumCollected: z.number().describe("Sum of PAID receipts"),
      pendingPayments: z.number().int().describe("Sales still awaiting payment"),
      expiringSoon: z.number().int().describe("ACTIVE/PENDING sales expiring within the window"),
      expiredPolicies: z
        .number()
        .int()
        .describe("Sales past their expiry date, excluding CANCELLED"),
    }),
    salesTrend: salesSeriesSchema,
    policyDistribution: distributionSchema,
    premiumTrend: z.array(
      z.object({
        period: z.string().describe("First day of the month, YYYY-MM-DD"),
        written: z.number(),
        collected: z.number(),
      }),
    ),
    recentSales: z.array(soldPolicySchema),
    recentCustomers: z.array(
      z.object({
        id: z.uuid(),
        customerCode: z.string(),
        fullName: z.string(),
        phone: z.string(),
        status: z.enum(CustomerStatus),
        policiesCount: z.number().int(),
        lastPolicy: z
          .object({
            policyNumber: z.string(),
            policyName: z.string(),
            insuranceType: z.enum(InsuranceType),
            issueDate: z.string(),
          })
          .nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    expiringPolicies: z.array(soldPolicySchema.extend({ daysRemaining: z.number().int() })),
    expiringWindowDays: z.number().int(),
    generatedAt: z.iso.datetime(),
  })
  .meta({ id: "AgentDashboard" });

export const agentProfileSchema = agentWithStatsSchema
  .extend({
    lastLoginAt: z.iso.datetime().nullable(),
    passwordChangedAt: z.iso.datetime().nullable(),
    mustChangePassword: z.boolean(),
  })
  .meta({ id: "AgentProfile" });

const phone = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[+\d][\d\s-]*$/, "invalid phone number");

/** Only these fields are editable by the agent; email, agent code and status are not. */
export const updateAgentProfileBodySchema = z
  .strictObject({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: phone.optional(),
    address: z.string().trim().max(500).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");
