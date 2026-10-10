import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { Database } from "../../config/database.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthContext } from "../../middleware/auth.js";
import { isAdmin, requireAgentId, requireTenantId } from "../../middleware/role.js";
import { randomCode, withGeneratedCode } from "../../utils/codes.js";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors.js";
import { parseDateOnly, toDateOnly, toNumber } from "../../utils/format.js";
import { buildMeta, toDateFilter, toSkipTake } from "../../utils/pagination.js";
import { containsInsensitive } from "../../utils/search.js";
import { changedFields, recordAudit } from "../audit-logs/audit-logs.service.js";
import { getSettingValues } from "../settings/settings.service.js";
import type {
  createSoldPolicyBodySchema,
  listSoldPoliciesQuerySchema,
  quoteSoldPolicyQuerySchema,
  updateSoldPolicyBodySchema,
} from "./sold-policies.schemas.js";

export const soldPolicyInclude = {
  policy: {
    select: {
      id: true,
      policyCode: true,
      policyName: true,
      insuranceType: true,
    },
  },
  customer: { select: { id: true, customerCode: true, fullName: true } },
  agent: { select: { id: true, agentCode: true, fullName: true } },
  receipts: {
    select: {
      id: true,
      receiptNumber: true,
      amount: true,
      paymentMethod: true,
      paymentStatus: true,
      issuedAt: true,
    },
    orderBy: { issuedAt: "asc" },
  },
  renewals: { where: { policyStatus: { not: "CANCELLED" } }, select: { id: true }, take: 1 },
} as const satisfies Prisma.SoldPolicyInclude;

type SoldPolicyRecord = Prisma.SoldPolicyGetPayload<{
  include: typeof soldPolicyInclude;
}>;

export const toSoldPolicyDto = (sold: SoldPolicyRecord) => ({
  id: sold.id,
  policyNumber: sold.policyNumber,
  insurerPolicyNumber: sold.insurerPolicyNumber,
  policy: sold.policy,
  customer: sold.customer,
  agent: sold.agent,
  premium: toNumber(sold.premium),
  amountPaid: sold.receipts
    .filter((receipt) => receipt.paymentStatus === "PAID")
    .reduce((total, receipt) => total + toNumber(receipt.amount), 0),
  issueDate: toDateOnly(sold.issueDate),
  isRenewal: sold.renewedFromId !== null,
  isRenewed: sold.renewals.length > 0,
  inceptionDate: toDateOnly(sold.inceptionDate ?? sold.issueDate),
  expiryDate: toDateOnly(sold.expiryDate),
  paymentStatus: sold.paymentStatus,
  policyStatus: sold.policyStatus,
  createdAt: sold.createdAt.toISOString(),
  updatedAt: sold.updatedAt.toISOString(),
});

const toSoldPolicyDetailDto = (sold: SoldPolicyRecord) => ({
  ...toSoldPolicyDto(sold),
  receipts: sold.receipts.map((receipt) => ({
    ...receipt,
    amount: toNumber(receipt.amount),
    issuedAt: receipt.issuedAt.toISOString(),
  })),
});

/** Agents only ever see their own sales. */
export const soldPolicyScope = (auth: AuthContext): Prisma.SoldPolicyWhereInput =>
  isAdmin(auth) ? {} : { agentId: requireAgentId(auth) };

export async function listSoldPolicies(
  db: Database,
  auth: AuthContext,
  query: z.infer<typeof listSoldPoliciesQuerySchema>,
) {
  const where: Prisma.SoldPolicyWhereInput = {
    AND: [
      soldPolicyScope(auth),
      isAdmin(auth) && query.agentId ? { agentId: query.agentId } : {},
      query.customerId ? { customerId: query.customerId } : {},
      query.policyId ? { policyId: query.policyId } : {},
      query.policyStatus ? { policyStatus: query.policyStatus } : {},
      query.expiry ? expiryWhere(query.expiry, parseDateOnly(new Date().toISOString())) : {},
      query.paymentStatus ? { paymentStatus: query.paymentStatus } : {},
      query.insuranceType ? { policy: { insuranceType: query.insuranceType } } : {},
      toDateFilter(query) ? { issueDate: toDateFilter(query) } : {},
      query.search
        ? {
            OR: [
              { policyNumber: containsInsensitive(query.search) },
              { customer: { fullName: containsInsensitive(query.search) } },
              { customer: { customerCode: containsInsensitive(query.search) } },
              { policy: { policyName: containsInsensitive(query.search) } },
              { policy: { policyCode: containsInsensitive(query.search) } },
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await db.$transaction([
    db.soldPolicy.count({ where }),
    db.soldPolicy.findMany({
      where,
      include: soldPolicyInclude,
      orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }],
      ...toSkipTake(query),
    }),
  ]);
  return {
    items: rows.map(toSoldPolicyDto),
    meta: buildMeta(query.page, query.limit, total),
  };
}

export async function getSoldPolicy(db: Database, auth: AuthContext, id: string) {
  const sold = await db.soldPolicy.findFirst({
    where: { id, ...soldPolicyScope(auth) },
    include: soldPolicyInclude,
  });
  if (!sold) throw notFound("Sold policy");
  return toSoldPolicyDetailDto(sold);
}

/** Last day of cover: issue date + duration − 1 day (e.g. 1 Jan → 31 Dec). */
export function computeExpiryDate(issueDate: Date, durationMonths: number): Date {
  const expiry = new Date(issueDate);
  expiry.setUTCMonth(expiry.getUTCMonth() + durationMonths);
  expiry.setUTCDate(expiry.getUTCDate() - 1);
  return expiry;
}

/** How far an AGENT may back- or forward-date a sale's issue date. */
export const AGENT_ISSUE_DATE_WINDOW = {
  pastDays: 30,
  futureDays: 90,
} as const;

const DAY_MS = 86_400_000;

/** How far ahead a policy counts as "expiring soon". */
export const EXPIRING_WINDOW_DAYS = 30;

/** A sale that a later, non-cancelled sale renews no longer needs attention. */
export const notRenewed: Prisma.SoldPolicyWhereInput = {
  renewals: { none: { policyStatus: { not: "CANCELLED" } } },
};

/** Where-clause for the list's `expiry` filter (and the matching dashboard counts). */
export function expiryWhere(
  expiry: "ACTIVE" | "EXPIRING" | "EXPIRED",
  today: Date,
): Prisma.SoldPolicyWhereInput {
  switch (expiry) {
    case "ACTIVE":
      return { policyStatus: "ACTIVE", expiryDate: { gte: today } };
    case "EXPIRING":
      return {
        ...notRenewed,
        policyStatus: { in: ["ACTIVE", "PENDING"] },
        expiryDate: { gte: today, lte: new Date(today.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS) },
      };
    case "EXPIRED":
      return { ...notRenewed, policyStatus: { not: "CANCELLED" }, expiryDate: { lt: today } };
  }
}

type SaleInput = Pick<
  z.infer<typeof createSoldPolicyBodySchema>,
  | "policyId"
  | "customerId"
  | "issueDate"
  | "inceptionDate"
  | "agentId"
  | "premium"
  | "expiryDate"
  | "renewal"
>;

/**
 * Everything about a sale that the server decides: the selling agent, customer
 * ownership, policy validity, premium, issue/expiry dates. Shared by the quote and
 * the sale itself so the agent sees exactly what will be recorded.
 */
export async function resolveSale(db: Database, auth: AuthContext, body: SaleInput) {
  const admin = isAdmin(auth);

  const policy = await db.policy.findUnique({ where: { id: body.policyId } });
  if (!policy || (!admin && policy.status !== "ACTIVE")) throw notFound("Policy");
  if (policy.status !== "ACTIVE") throw conflict("INACTIVE policies cannot be sold.");

  const customer = await db.customer.findUnique({
    where: { id: body.customerId },
  });
  // Agents may only sell to their own customers; hide others' customers entirely.
  if (!customer || (!admin && customer.assignedAgentId !== auth.agentId)) {
    throw notFound("Customer");
  }
  if (customer.status === "INACTIVE") {
    throw conflict("Policies cannot be sold to an INACTIVE customer.");
  }

  let agentId: string;
  if (admin) {
    const requested = body.agentId ?? customer.assignedAgentId;
    if (!requested) {
      throw badRequest("agentId is required because the customer has no assigned agent.");
    }
    if (customer.assignedAgentId && customer.assignedAgentId !== requested) {
      throw badRequest("The customer is assigned to a different agent.");
    }
    const agent = await db.agent.findUnique({
      where: { id: requested },
      select: { status: true },
    });
    if (!agent) throw badRequest("agentId does not refer to an existing agent.");
    if (agent.status !== "ACTIVE")
      throw badRequest("Sales can only be recorded for ACTIVE agents.");
    agentId = requested;
  } else {
    // The authenticate hook has already checked that this agent is ACTIVE.
    agentId = requireAgentId(auth);
  }
  // Agents may only price a sale when the catalog has no price (quoted on the insurer's portal),
  // or when renewing, where the premium often moves.
  if (!admin && !body.renewal && body.premium !== undefined && policy.premium !== null) {
    throw forbidden("Agents cannot override the catalog premium.");
  }
  if (!admin && body.expiryDate !== undefined && policy.durationMonths !== null) {
    throw forbidden("Agents cannot override the policy term.");
  }
  const premium = body.premium !== undefined ? new Prisma.Decimal(body.premium) : policy.premium;
  if (!premium) {
    throw badRequest("premium is required: this policy has no catalog premium.");
  }

  const today = parseDateOnly(new Date().toISOString());
  const issueDate = body.issueDate ? parseDateOnly(body.issueDate) : today;
  if (Number.isNaN(issueDate.getTime())) throw badRequest("issueDate is not a valid date.");
  if (!admin) {
    const earliest = new Date(today.getTime() - AGENT_ISSUE_DATE_WINDOW.pastDays * DAY_MS);
    const latest = new Date(today.getTime() + AGENT_ISSUE_DATE_WINDOW.futureDays * DAY_MS);
    if (issueDate < earliest || issueDate > latest) {
      throw badRequest(
        `The issue date must be between ${toDateOnly(earliest)} and ${toDateOnly(latest)}.`,
      );
    }
  }

  const expiryDate = body.expiryDate
    ? parseDateOnly(body.expiryDate)
    : policy.durationMonths !== null
      ? computeExpiryDate(issueDate, policy.durationMonths)
      : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
    throw badRequest("expiryDate is required: this policy has no catalog term.");
  }
  if (expiryDate <= issueDate) throw badRequest("expiryDate must be after the issue date.");

  // Only a renewal carries an earlier first-issue date; a new policy leaves it empty.
  const inceptionDate = body.inceptionDate ? parseDateOnly(body.inceptionDate) : null;
  if (inceptionDate && (Number.isNaN(inceptionDate.getTime()) || inceptionDate > issueDate)) {
    throw badRequest("inceptionDate cannot be after the issue date.");
  }

  return {
    policy,
    customer,
    agentId,
    premium,
    issueDate,
    inceptionDate,
    expiryDate,
  };
}

/** Server-side preview of a sale (premium, expiry). Records nothing. */
export async function quoteSoldPolicy(
  db: Database,
  auth: AuthContext,
  query: z.infer<typeof quoteSoldPolicyQuerySchema>,
) {
  const sale = await resolveSale(db, auth, query);
  return {
    policy: {
      id: sale.policy.id,
      policyCode: sale.policy.policyCode,
      policyName: sale.policy.policyName,
      insuranceType: sale.policy.insuranceType,
      coverageAmount: sale.policy.coverageAmount ? toNumber(sale.policy.coverageAmount) : null,
      premiumFrequency: sale.policy.premiumFrequency,
      durationMonths: sale.policy.durationMonths,
    },
    customer: {
      id: sale.customer.id,
      customerCode: sale.customer.customerCode,
      fullName: sale.customer.fullName,
    },
    premium: toNumber(sale.premium),
    issueDate: toDateOnly(sale.issueDate),
    expiryDate: toDateOnly(sale.expiryDate),
  };
}

export async function createSoldPolicy(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  body: z.infer<typeof createSoldPolicyBodySchema>,
) {
  const settings = await getSettingValues(db);
  // Enforced here, not in the UI: a disabled switch must stop direct API calls too.
  if (auth.role === "AGENT" && !settings["policy.allowAgentSales"]) {
    throw forbidden("Recording new policy sales is currently disabled for agents.");
  }
  const { policy, customer, agentId, premium, issueDate, inceptionDate, expiryDate } =
    await resolveSale(db, auth, body);
  // Link this sale to the one it renews: the one named by the agent, else the customer's latest
  // earlier sale of the same policy.
  const renewedFrom = body.renewsSoldPolicyId
    ? await db.soldPolicy.findFirst({
        where: { id: body.renewsSoldPolicyId, customerId: customer.id, ...soldPolicyScope(auth) },
        select: { id: true },
      })
    : await db.soldPolicy.findFirst({
        where: {
          customerId: customer.id,
          policyId: policy.id,
          policyStatus: { not: "CANCELLED" },
          issueDate: { lt: issueDate },
          ...notRenewed,
        },
        orderBy: { issueDate: "desc" },
        select: { id: true },
      });
  if (body.renewsSoldPolicyId && !renewedFrom) {
    throw badRequest("renewsSoldPolicyId is not one of this customer's policies.");
  }
  const paidAtSale = Boolean(body.paymentMethod);
  const year = issueDate.getUTCFullYear();
  const receiptYear = new Date().getUTCFullYear();

  const sold = await withGeneratedCode(
    () => randomCode(`POL-${year}`, 8),
    (policyNumber) =>
      db.$transaction(async (tx) => {
        const created = await tx.soldPolicy.create({
          data: {
            tenantId: requireTenantId(auth),
            policyNumber,
            ...(body.insurerPolicyNumber ? { insurerPolicyNumber: body.insurerPolicyNumber } : {}),
            policyId: policy.id,
            customerId: customer.id,
            agentId,
            premium,
            issueDate,
            inceptionDate,
            expiryDate,
            ...(renewedFrom ? { renewedFromId: renewedFrom.id } : {}),
            // A sale is in force straight away; only the payment status depends on collection.
            policyStatus: "ACTIVE",
            paymentStatus: paidAtSale ? "PAID" : settings["policy.defaultPaymentStatus"],
          },
        });
        let receiptNumber: string | undefined;
        if (body.paymentMethod) {
          receiptNumber = randomCode(`RCP-${receiptYear}`, 8);
          await tx.receipt.create({
            data: {
              tenantId: requireTenantId(auth),
              receiptNumber,
              soldPolicyId: created.id,
              amount: premium,
              paymentMethod: body.paymentMethod,
              paymentStatus: "PAID",
            },
          });
        }
        await recordAudit(tx, request, {
          action: "soldPolicy.create",
          entity: "SoldPolicy",
          entityId: created.id,
          metadata: {
            policyNumber,
            policyCode: policy.policyCode,
            customerId: customer.id,
            agentId,
            ...(receiptNumber ? { receiptNumber } : {}),
          },
        });
        return tx.soldPolicy.findUniqueOrThrow({
          where: { id: created.id },
          include: soldPolicyInclude,
        });
      }),
  );
  return toSoldPolicyDetailDto(sold);
}

/** Admins may edit any sale; an agent only their own, and never its payment or policy status. */
export async function updateSoldPolicy(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  id: string,
  body: z.infer<typeof updateSoldPolicyBodySchema>,
) {
  const existing = await db.soldPolicy.findFirst({ where: { id, ...soldPolicyScope(auth) } });
  if (!existing) throw notFound("Sold policy");
  if (!isAdmin(auth) && (body.policyStatus || body.paymentStatus)) {
    throw forbidden("Agents cannot change a sale's payment or policy status.");
  }

  const issueDate = body.issueDate ? parseDateOnly(body.issueDate) : existing.issueDate;
  const expiryDate = body.expiryDate ? parseDateOnly(body.expiryDate) : existing.expiryDate;
  if (expiryDate <= issueDate) throw badRequest("expiryDate must be after issueDate.");
  const inceptionDate =
    body.inceptionDate === undefined
      ? undefined
      : body.inceptionDate
        ? parseDateOnly(body.inceptionDate)
        : null;
  if (inceptionDate && inceptionDate > issueDate) {
    throw badRequest("inceptionDate cannot be after the issue date.");
  }

  const sold = await db.$transaction(async (tx) => {
    const updated = await tx.soldPolicy.update({
      where: { id },
      data: {
        ...(body.policyStatus ? { policyStatus: body.policyStatus } : {}),
        ...(body.paymentStatus ? { paymentStatus: body.paymentStatus } : {}),
        ...(body.premium !== undefined ? { premium: body.premium } : {}),
        issueDate,
        ...(inceptionDate !== undefined ? { inceptionDate } : {}),
        ...(body.insurerPolicyNumber !== undefined
          ? { insurerPolicyNumber: body.insurerPolicyNumber || null }
          : {}),
        expiryDate,
      },
      include: soldPolicyInclude,
    });
    await recordAudit(tx, request, {
      action: "soldPolicy.update",
      entity: "SoldPolicy",
      entityId: id,
      metadata: { fields: changedFields(body) },
    });
    return updated;
  });
  return toSoldPolicyDetailDto(sold);
}

/** Removes a sale and its receipts. Admins can delete any sale; an agent only their own. */
export async function deleteSoldPolicy(
  db: Database,
  auth: AuthContext,
  request: FastifyRequest,
  id: string,
) {
  const existing = await db.soldPolicy.findFirst({ where: { id, ...soldPolicyScope(auth) } });
  if (!existing) throw notFound("Sold policy");
  await db.$transaction(async (tx) => {
    const receipts = await tx.receipt.deleteMany({ where: { soldPolicyId: id } });
    await tx.soldPolicy.delete({ where: { id } });
    await recordAudit(tx, request, {
      action: "soldPolicy.delete",
      entity: "SoldPolicy",
      entityId: id,
      metadata: { policyNumber: existing.policyNumber, receiptsRemoved: receipts.count },
    });
  });
}
