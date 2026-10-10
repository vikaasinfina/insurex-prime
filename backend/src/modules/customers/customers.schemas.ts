import { z } from "zod";
import {
  CustomerStatus,
  Gender,
  InsuranceType,
  PaymentStatus,
  SoldPolicyStatus,
} from "../../generated/prisma/enums.js";
import {
  dateRangeQuerySchema,
  orderQuerySchema,
  paginationQuerySchema,
  searchQuerySchema,
} from "../../utils/pagination.js";

export const agentRefSchema = z
  .object({ id: z.uuid(), agentCode: z.string(), fullName: z.string() })
  .meta({ id: "AgentRef" });

export const customerSchema = z
  .object({
    id: z.uuid(),
    customerCode: z.string(),
    fullName: z.string(),
    dateOfBirth: z.string().nullable().describe("YYYY-MM-DD"),
    gender: z.enum(Gender).nullable(),
    phone: z.string(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    nomineeName: z.string().nullable(),
    nomineeRelationship: z.string().nullable(),
    assignedAgent: agentRefSchema.nullable(),
    status: z.enum(CustomerStatus),
    policiesCount: z.number().int(),
    policyNumbers: z.array(z.string()).describe("Policy numbers of the customer's sold policies"),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Customer" });

export const customerDetailSchema = customerSchema
  .extend({
    policies: z.array(
      z.object({
        id: z.uuid(),
        policyNumber: z.string(),
        policyName: z.string(),
        insuranceType: z.enum(InsuranceType),
        premium: z.number(),
        issueDate: z.string(),
        expiryDate: z.string(),
        paymentStatus: z.enum(PaymentStatus),
        policyStatus: z.enum(SoldPolicyStatus),
        isRenewal: z.boolean(),
        isRenewed: z.boolean(),
        agent: agentRefSchema,
      }),
    ),
  })
  .meta({ id: "CustomerDetail" });

export const customerIdParamsSchema = z.object({ id: z.uuid() });

export const listCustomersQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend(orderQuerySchema.shape)
  .extend(dateRangeQuerySchema.shape)
  .extend({
    status: z.enum(CustomerStatus).optional(),
    agentId: z.uuid().optional().describe("SUPER_ADMIN only; ignored for agents"),
    insuranceType: z.enum(InsuranceType).optional().describe("Customers holding this type"),
    city: z.string().trim().min(1).max(80).optional(),
    sortBy: z.enum(["createdAt", "fullName", "customerCode", "updatedAt"]).default("createdAt"),
  });

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createCustomerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.iso.date().optional().describe("YYYY-MM-DD"),
  gender: z.enum(Gender).optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+\d][\d\s-]*$/, "invalid phone number"),
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase())
    .optional(),
  address: optionalText(500),
  city: optionalText(80),
  state: optionalText(80),
  nomineeName: optionalText(120),
  nomineeRelationship: optionalText(60),
  assignedAgentId: z
    .uuid()
    .nullable()
    .optional()
    .describe("SUPER_ADMIN only. Agents' customers are always assigned to the calling agent."),
  status: z.enum(CustomerStatus).default("ACTIVE"),
});

export const updateCustomerBodySchema = createCustomerBodySchema
  .partial()
  .extend({ status: z.enum(CustomerStatus).optional() })
  .refine((body) => Object.keys(body).length > 0, "at least one field is required");
