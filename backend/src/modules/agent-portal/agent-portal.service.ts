import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { Database } from "../../config/database.js";
import { Prisma } from "../../generated/prisma/client.js";
import { notFound } from "../../utils/errors.js";
import { parseDateOnly, toDateOnly, toNumber } from "../../utils/format.js";
import { changedFields, recordAudit } from "../audit-logs/audit-logs.service.js";
import { toAgentDto } from "../agents/agents.schemas.js";
import { getPolicyDistribution, getSalesOverTime } from "../reports/analytics.service.js";
import {
  EXPIRING_WINDOW_DAYS,
  expiryWhere,
  notRenewed,
  soldPolicyInclude,
  toSoldPolicyDto,
} from "../sold-policies/sold-policies.service.js";
import type { DashboardRange, updateAgentProfileBodySchema } from "./agent-portal.schemas.js";

const DAY_MS = 86_400_000;

const todayUtc = () => parseDateOnly(new Date().toISOString());
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

/** Sales-trend window and bucket size for each dashboard range. */
function trendWindow(range: DashboardRange, today: Date) {
  switch (range) {
    case "7D":
      return { interval: "day" as const, from: addDays(today, -6) };
    case "30D":
      return { interval: "day" as const, from: addDays(today, -29) };
    case "6M":
      return { interval: "week" as const, from: addDays(today, -7 * 25) };
    case "1Y": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
      return { interval: "month" as const, from };
    }
  }
}

/** Premium written (by issue month) vs collected (PAID receipts by month), last 12 months. */
async function getPremiumTrend(db: Database, agentId: string, today: Date) {
  const from = toDateOnly(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1)));
  const to = toDateOnly(today);
  const toExclusive = toDateOnly(addDays(today, 1));
  const rows = await db.$queryRaw<{ period: string; written: string; collected: string }[]>`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', ${from}::date::timestamp),
        date_trunc('month', ${to}::date::timestamp),
        '1 month'::interval
      )::date AS period
    ),
    written AS (
      SELECT date_trunc('month', sp."issueDate"::timestamp)::date AS period, SUM(sp.premium) AS amount
      FROM sold_policies sp
      WHERE sp."agentId" = ${agentId}::uuid
        AND sp."policyStatus"::text <> 'CANCELLED'
        AND sp."issueDate" >= ${from}::date AND sp."issueDate" < ${toExclusive}::date
      GROUP BY 1
    ),
    collected AS (
      SELECT date_trunc('month', r."issuedAt")::date AS period, SUM(r.amount) AS amount
      FROM receipts r
      JOIN sold_policies sp ON sp.id = r."soldPolicyId"
      WHERE sp."agentId" = ${agentId}::uuid
        AND r."paymentStatus"::text = 'PAID'
        AND r."issuedAt" >= ${from}::date::timestamp
        AND r."issuedAt" < ${toExclusive}::date::timestamp
      GROUP BY 1
    )
    SELECT to_char(months.period, 'YYYY-MM-DD') AS period,
           COALESCE(written.amount, 0)::text AS written,
           COALESCE(collected.amount, 0)::text AS collected
    FROM months
    LEFT JOIN written USING (period)
    LEFT JOIN collected USING (period)
    ORDER BY months.period`;
  return rows.map((row) => ({
    period: row.period,
    written: num(row.written),
    collected: num(row.collected),
  }));
}

/**
 * Everything on the agent dashboard, computed in PostgreSQL for one agent. The agent
 * id always comes from the authenticated session, never from the request.
 */
export async function getAgentDashboard(
  db: Database,
  tenantId: string,
  agentId: string,
  range: DashboardRange,
) {
  const today = todayUtc();
  const expiringUntil = addDays(today, EXPIRING_WINDOW_DAYS);
  const notCancelled: Prisma.SoldPolicyWhereInput = {
    agentId,
    policyStatus: { not: "CANCELLED" },
  };
  const expiringWhere: Prisma.SoldPolicyWhereInput = {
    ...notRenewed,
    agentId,
    policyStatus: { in: ["ACTIVE", "PENDING"] },
    expiryDate: { gte: today, lte: expiringUntil },
  };
  const trend = trendWindow(range, today);

  const [
    customers,
    policiesSold,
    activePolicies,
    premium,
    collected,
    pendingPayments,
    expiringSoon,
    expiredPolicies,
    salesTrend,
    policyDistribution,
    premiumTrend,
    recentSales,
    recentCustomers,
    expiring,
  ] = await Promise.all([
    db.customer.count({ where: { assignedAgentId: agentId } }),
    db.soldPolicy.count({ where: notCancelled }),
    db.soldPolicy.count({
      where: { agentId, policyStatus: "ACTIVE", expiryDate: { gte: today } },
    }),
    db.soldPolicy.aggregate({ where: notCancelled, _sum: { premium: true } }),
    db.receipt.aggregate({
      where: { paymentStatus: "PAID", soldPolicy: { agentId } },
      _sum: { amount: true },
    }),
    db.soldPolicy.count({ where: { ...notCancelled, paymentStatus: { in: ["PENDING", "DUE"] } } }),
    db.soldPolicy.count({ where: expiringWhere }),
    db.soldPolicy.count({ where: { agentId, ...expiryWhere("EXPIRED", today) } }),
    getSalesOverTime(
      db,
      { tenantId, agentId },
      { interval: trend.interval, from: toDateOnly(trend.from), to: toDateOnly(today) },
    ),
    getPolicyDistribution(db, { tenantId, agentId }, {}),
    getPremiumTrend(db, agentId, today),
    db.soldPolicy.findMany({
      where: { agentId },
      include: soldPolicyInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5,
    }),
    db.customer.findMany({
      where: { assignedAgentId: agentId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5,
      include: {
        _count: { select: { soldPolicies: true } },
        soldPolicies: {
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            policyNumber: true,
            issueDate: true,
            policy: { select: { policyName: true, insuranceType: true } },
          },
        },
      },
    }),
    db.soldPolicy.findMany({
      where: expiringWhere,
      include: soldPolicyInclude,
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      take: 8,
    }),
  ]);

  return {
    summary: {
      customers,
      policiesSold,
      activePolicies,
      totalPremium: premium._sum.premium ? toNumber(premium._sum.premium) : 0,
      premiumCollected: collected._sum.amount ? toNumber(collected._sum.amount) : 0,
      pendingPayments,
      expiringSoon,
      expiredPolicies,
    },
    salesTrend,
    policyDistribution,
    premiumTrend,
    recentSales: recentSales.map(toSoldPolicyDto),
    recentCustomers: recentCustomers.map((customer) => {
      const last = customer.soldPolicies[0];
      return {
        id: customer.id,
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
        status: customer.status,
        policiesCount: customer._count.soldPolicies,
        lastPolicy: last
          ? {
              policyNumber: last.policyNumber,
              policyName: last.policy.policyName,
              insuranceType: last.policy.insuranceType,
              issueDate: toDateOnly(last.issueDate),
            }
          : null,
        createdAt: customer.createdAt.toISOString(),
      };
    }),
    expiringPolicies: expiring.map((sold) => ({
      ...toSoldPolicyDto(sold),
      daysRemaining: Math.round((sold.expiryDate.getTime() - today.getTime()) / DAY_MS),
    })),
    expiringWindowDays: EXPIRING_WINDOW_DAYS,
    generatedAt: new Date().toISOString(),
  };
}

const profileInclude = {
  user: {
    select: { email: true, lastLoginAt: true, passwordChangedAt: true, mustChangePassword: true },
  },
  _count: { select: { customers: true, soldPolicies: true } },
} as const;

type ProfileRecord = Prisma.AgentGetPayload<{ include: typeof profileInclude }>;

const toProfileDto = (agent: ProfileRecord) => ({
  ...toAgentDto(agent),
  stats: { customers: agent._count.customers, policiesSold: agent._count.soldPolicies },
  lastLoginAt: agent.user.lastLoginAt?.toISOString() ?? null,
  passwordChangedAt: agent.user.passwordChangedAt?.toISOString() ?? null,
  mustChangePassword: agent.user.mustChangePassword,
});

export async function getAgentProfile(db: Database, agentId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId }, include: profileInclude });
  if (!agent) throw notFound("Agent");
  return toProfileDto(agent);
}

/** Agents can edit their name, phone and address only. */
export async function updateAgentProfile(
  db: Database,
  request: FastifyRequest,
  agentId: string,
  body: z.infer<typeof updateAgentProfileBodySchema>,
) {
  const agent = await db.$transaction(async (tx) => {
    const updated = await tx.agent.update({
      where: { id: agentId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
      },
      include: profileInclude,
    });
    await recordAudit(tx, request, {
      action: "agent.profile_update",
      entity: "Agent",
      entityId: agentId,
      metadata: { fields: changedFields(body) },
    });
    return updated;
  });
  return toProfileDto(agent);
}
