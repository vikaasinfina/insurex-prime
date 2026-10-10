import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { Database } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthContext } from "../../middleware/auth.js";
import { isAdmin, requireAgentId, requireTenantId } from "../../middleware/role.js";
import { randomCode, withGeneratedCode } from "../../utils/codes.js";
import { badRequest, conflict, notFound } from "../../utils/errors.js";
import { parseDateOnly, toDateOnly, toNumber } from "../../utils/format.js";
import { buildMeta, toDateFilter, toSkipTake } from "../../utils/pagination.js";
import { containsInsensitive } from "../../utils/search.js";
import { changedFields, recordAudit } from "../audit-logs/audit-logs.service.js";
import type {
  createCustomerBodySchema,
  listCustomersQuerySchema,
  updateCustomerBodySchema,
} from "./customers.schemas.js";

const agentRefSelect = { select: { id: true, agentCode: true, fullName: true } } as const;
const customerInclude = {
  assignedAgent: agentRefSelect,
  _count: { select: { soldPolicies: true } },
  soldPolicies: {
    select: { policyNumber: true },
    orderBy: { issueDate: "desc" },
  },
} as const;

type CustomerRecord = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

const toCustomerDto = (customer: CustomerRecord) => ({
  id: customer.id,
  customerCode: customer.customerCode,
  fullName: customer.fullName,
  dateOfBirth: customer.dateOfBirth ? toDateOnly(customer.dateOfBirth) : null,
  gender: customer.gender,
  phone: customer.phone,
  email: customer.email,
  address: customer.address,
  city: customer.city,
  state: customer.state,
  nomineeName: customer.nomineeName,
  nomineeRelationship: customer.nomineeRelationship,
  assignedAgent: customer.assignedAgent,
  status: customer.status,
  policiesCount: customer._count.soldPolicies,
  policyNumbers: customer.soldPolicies.map((sold) => sold.policyNumber),
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});

/** Agents only ever see customers assigned to them. */
export const customerScope = (auth: AuthContext): Prisma.CustomerWhereInput =>
  isAdmin(auth) ? {} : { assignedAgentId: requireAgentId(auth) };

export async function listCustomers(
  db: Database,
  auth: AuthContext,
  query: z.infer<typeof listCustomersQuerySchema>,
) {
  const where: Prisma.CustomerWhereInput = {
    AND: [
      customerScope(auth),
      query.status ? { status: query.status } : {},
      isAdmin(auth) && query.agentId ? { assignedAgentId: query.agentId } : {},
      query.city ? { city: containsInsensitive(query.city) } : {},
      query.insuranceType
        ? { soldPolicies: { some: { policy: { insuranceType: query.insuranceType } } } }
        : {},
      toDateFilter(query) ? { createdAt: toDateFilter(query) } : {},
      query.search
        ? {
            OR: [
              { fullName: containsInsensitive(query.search) },
              { customerCode: containsInsensitive(query.search) },
              { phone: containsInsensitive(query.search) },
              { email: containsInsensitive(query.search) },
            ],
          }
        : {},
    ],
  };
  const [total, customers] = await db.$transaction([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      include: customerInclude,
      orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }],
      ...toSkipTake(query),
    }),
  ]);
  return { items: customers.map(toCustomerDto), meta: buildMeta(query.page, query.limit, total) };
}

export async function getCustomer(db: Database, auth: AuthContext, id: string) {
  const customer = await db.customer.findFirst({
    where: { id, ...customerScope(auth) },
    include: {
      ...customerInclude,
      soldPolicies: {
        orderBy: { issueDate: "desc" },
        include: {
          policy: { select: { policyName: true, insuranceType: true } },
          agent: agentRefSelect,
          renewals: {
            where: { policyStatus: { not: "CANCELLED" } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!customer) throw notFound("Customer");
  return {
    ...toCustomerDto(customer),
    policies: customer.soldPolicies.map((sold) => ({
      id: sold.id,
      policyNumber: sold.policyNumber,
      policyName: sold.policy.policyName,
      insuranceType: sold.policy.insuranceType,
      premium: toNumber(sold.premium),
      issueDate: toDateOnly(sold.issueDate),
      expiryDate: toDateOnly(sold.expiryDate),
      paymentStatus: sold.paymentStatus,
      policyStatus: sold.policyStatus,
      isRenewal: sold.renewedFromId !== null,
      isRenewed: sold.renewals.length > 0,
      agent: sold.agent,
    })),
  };
}

async function assertAssignableAgent(db: Database, agentId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { status: true } });
  if (!agent) throw badRequest("assignedAgentId does not refer to an existing agent.");
  if (agent.status !== "ACTIVE")
    throw badRequest("Customers can only be assigned to ACTIVE agents.");
}

type CustomerInput = z.infer<typeof updateCustomerBodySchema>;

function customerData(body: CustomerInput) {
  return {
    ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
    ...(body.dateOfBirth !== undefined ? { dateOfBirth: parseDateOnly(body.dateOfBirth) } : {}),
    ...(body.gender !== undefined ? { gender: body.gender } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.address !== undefined ? { address: body.address } : {}),
    ...(body.city !== undefined ? { city: body.city } : {}),
    ...(body.state !== undefined ? { state: body.state } : {}),
    ...(body.nomineeName !== undefined ? { nomineeName: body.nomineeName } : {}),
    ...(body.nomineeRelationship !== undefined
      ? { nomineeRelationship: body.nomineeRelationship }
      : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  };
}

export async function createCustomer(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  body: z.infer<typeof createCustomerBodySchema>,
) {
  // Agents' customers always belong to the calling agent, whatever the body says.
  const assignedAgentId = isAdmin(auth) ? (body.assignedAgentId ?? null) : requireAgentId(auth);
  if (isAdmin(auth) && assignedAgentId) await assertAssignableAgent(db, assignedAgentId);

  const customer = await withGeneratedCode(
    () => randomCode("CUS"),
    (customerCode) =>
      db.$transaction(async (tx) => {
        const created = await tx.customer.create({
          data: {
            ...customerData(body),
            tenantId: requireTenantId(auth),
            fullName: body.fullName,
            phone: body.phone,
            customerCode,
            assignedAgentId,
          },
          include: customerInclude,
        });
        await recordAudit(tx, request, {
          action: "customer.create",
          entity: "Customer",
          entityId: created.id,
          metadata: { customerCode, assignedAgentId },
        });
        return created;
      }),
  );
  return toCustomerDto(customer);
}

export async function updateCustomer(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  id: string,
  body: z.infer<typeof updateCustomerBodySchema>,
) {
  const existing = await db.customer.findFirst({
    where: { id, ...customerScope(auth) },
    select: { id: true },
  });
  if (!existing) throw notFound("Customer");

  // Only Super Admins can reassign customers.
  const reassign = isAdmin(auth) && body.assignedAgentId !== undefined;
  if (reassign && body.assignedAgentId) await assertAssignableAgent(db, body.assignedAgentId);

  const customer = await db.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id },
      data: {
        ...customerData(body),
        ...(reassign ? { assignedAgentId: body.assignedAgentId ?? null } : {}),
      },
      include: customerInclude,
    });
    const fields = changedFields(body).filter((field) => field !== "assignedAgentId" || reassign);
    await recordAudit(tx, request, {
      action: "customer.update",
      entity: "Customer",
      entityId: id,
      metadata: { fields },
    });
    return updated;
  });
  return toCustomerDto(customer);
}

export async function deleteCustomer(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  id: string,
) {
  const customer = await db.customer.findFirst({
    where: { id, ...customerScope(auth) },
    include: { _count: { select: { soldPolicies: true } } },
  });
  if (!customer) throw notFound("Customer");
  if (customer._count.soldPolicies > 0) {
    throw conflict(
      `Customer has ${customer._count.soldPolicies} sold policies and cannot be deleted. Set the customer INACTIVE instead.`,
    );
  }
  await db.$transaction(async (tx) => {
    await tx.customer.delete({ where: { id } });
    await recordAudit(tx, request, {
      action: "customer.delete",
      entity: "Customer",
      entityId: id,
      metadata: { customerCode: customer.customerCode },
    });
  });
}
