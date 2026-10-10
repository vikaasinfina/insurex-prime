import { z } from "zod";
import {
  InsuranceType,
  PaymentMethod,
  PaymentStatus,
  PremiumFrequency,
  SoldPolicyStatus,
} from "../../generated/prisma/enums.js";
import {
  dateRangeQuerySchema,
  orderQuerySchema,
  paginationQuerySchema,
  searchQuerySchema,
} from "../../utils/pagination.js";
import { agentRefSchema } from "../customers/customers.schemas.js";

export const policyRefSchema = z
  .object({
    id: z.uuid(),
    policyCode: z.string(),
    policyName: z.string(),
    insuranceType: z.enum(InsuranceType),
  })
  .meta({ id: "PolicyRef" });

export const customerRefSchema = z
  .object({ id: z.uuid(), customerCode: z.string(), fullName: z.string() })
  .meta({ id: "CustomerRef" });

export const soldPolicySchema = z
  .object({
    id: z.uuid(),
    policyNumber: z.string(),
    insurerPolicyNumber: z
      .string()
      .nullable()
      .describe("Policy number on the insurer's own portal"),
    policy: policyRefSchema,
    customer: customerRefSchema,
    agent: agentRefSchema,
    premium: z.number(),
    amountPaid: z.number().describe("Sum of PAID receipts"),
    issueDate: z.string().describe("YYYY-MM-DD"),
    isRenewal: z
      .boolean()
      .describe("This sale renews an earlier sale (otherwise it is a new sale)"),
    isRenewed: z
      .boolean()
      .describe("A later sale renews this one, so it no longer counts as expired"),
    inceptionDate: z
      .string()
      .describe("YYYY-MM-DD; when the policy was first issued. Equals issueDate for a new policy"),
    expiryDate: z.string().describe("YYYY-MM-DD"),
    paymentStatus: z.enum(PaymentStatus),
    policyStatus: z.enum(SoldPolicyStatus),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "SoldPolicy" });

export const soldPolicyDetailSchema = soldPolicySchema
  .extend({
    receipts: z.array(
      z.object({
        id: z.uuid(),
        receiptNumber: z.string(),
        amount: z.number(),
        paymentMethod: z.enum(PaymentMethod),
        paymentStatus: z.enum(PaymentStatus),
        issuedAt: z.iso.datetime(),
      }),
    ),
  })
  .meta({ id: "SoldPolicyDetail" });

export const soldPolicyIdParamsSchema = z.object({ id: z.uuid() });

export const listSoldPoliciesQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend(orderQuerySchema.shape)
  .extend(dateRangeQuerySchema.shape)
  .extend({
    policyStatus: z.enum(SoldPolicyStatus).optional(),
    paymentStatus: z.enum(PaymentStatus).optional(),
    insuranceType: z.enum(InsuranceType).optional(),
    expiry: z
      .enum(["ACTIVE", "EXPIRING", "EXPIRED"])
      .optional()
      .describe(
        "ACTIVE: in force, not yet expired. EXPIRING: expires within 30 days. EXPIRED: past expiry, not cancelled.",
      ),
    agentId: z.uuid().optional().describe("SUPER_ADMIN only; ignored for agents"),
    customerId: z.uuid().optional(),
    policyId: z.uuid().optional(),
    sortBy: z.enum(["issueDate", "expiryDate", "createdAt", "premium"]).default("issueDate"),
  });

export const createSoldPolicyBodySchema = z.object({
  policyId: z.uuid(),
  customerId: z.uuid(),
  issueDate: z.iso.date().optional().describe("YYYY-MM-DD; defaults to today"),
  inceptionDate: z.iso
    .date()
    .optional()
    .describe("YYYY-MM-DD; when the policy was first issued. Omit for a new policy"),
  renewsSoldPolicyId: z
    .uuid()
    .optional()
    .describe(
      "The earlier sale this renews. When omitted, the customer's previous sale of the same policy is used",
    ),
  renewal: z
    .boolean()
    .optional()
    .describe("True when this renews an earlier policy: lets an agent adjust the premium"),
  agentId: z
    .uuid()
    .optional()
    .describe("SUPER_ADMIN only; defaults to the customer's agent. Ignored for agents."),
  premium: z
    .number()
    .positive()
    .max(1e10)
    .optional()
    .describe(
      "Defaults to the catalog premium. Required when the policy has no catalog premium (the sale is priced on the insurer's portal); otherwise only admins may override it.",
    ),
  expiryDate: z.iso
    .date()
    .optional()
    .describe(
      "YYYY-MM-DD. Required when the policy has no catalog duration; otherwise only admins may override the computed date.",
    ),
  insurerPolicyNumber: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .describe("Policy number issued by the insurer's portal, if already known"),
  paymentMethod: z
    .enum(PaymentMethod)
    .optional()
    .describe(
      "Premium collected in full at the point of sale: a PAID receipt is created in the same transaction and the policy starts ACTIVE. Omit to record the sale as PENDING payment.",
    ),
});

export const quoteSoldPolicyQuerySchema = z.object({
  policyId: z.uuid(),
  customerId: z.uuid(),
  issueDate: z.iso.date().optional().describe("YYYY-MM-DD; defaults to today"),
  agentId: z.uuid().optional().describe("Admins only"),
  premium: z.coerce.number().positive().max(1e10).optional(),
  expiryDate: z.iso.date().optional(),
});

export const soldPolicyQuoteSchema = z
  .object({
    policy: policyRefSchema.extend({
      coverageAmount: z.number().nullable(),
      premiumFrequency: z.enum(PremiumFrequency),
      durationMonths: z.number().int().nullable(),
    }),
    customer: customerRefSchema,
    premium: z.number(),
    issueDate: z.string().describe("YYYY-MM-DD"),
    expiryDate: z.string().describe("YYYY-MM-DD"),
  })
  .meta({ id: "SoldPolicyQuote" });

export const updateSoldPolicyBodySchema = z
  .object({
    policyStatus: z.enum(SoldPolicyStatus),
    paymentStatus: z.enum(PaymentStatus),
    issueDate: z.iso.date(),
    inceptionDate: z.iso.date().nullable(),
    expiryDate: z.iso.date(),
    insurerPolicyNumber: z.string().trim().max(60).nullable(),
    premium: z.number().positive().max(1e10),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");
