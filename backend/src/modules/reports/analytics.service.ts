import type { Database } from "../../config/database.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { InsuranceType, PolicyStatus, AgentStatus } from "../../generated/prisma/enums.js";
import { badRequest } from "../../utils/errors.js";
import { parseDateOnly, toDateOnly, toNumber } from "../../utils/format.js";
import { toDateFilter } from "../../utils/pagination.js";
import {
  liveStatusWhere,
  soldPolicyInclude,
  toSoldPolicyDto,
  type LiveStatus,
} from "../sold-policies/sold-policies.service.js";

/** Restricts analytics to one agent (AGENT callers) or everything (null). */
export interface AnalyticsScope {
  /** The tenant every figure is restricted to. Raw SQL below filters on it explicitly. */
  tenantId: string;
  agentId: string | null;
}

export interface DateRangeInput {
  from?: string | undefined;
  to?: string | undefined;
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────
// Bounds are passed as text and cast in SQL so results never depend on the
// database session's timezone.
interface SqlBounds {
  fromDate?: string; // inclusive, YYYY-MM-DD
  toDateExclusive?: string; // exclusive, YYYY-MM-DD
}

function toSqlBounds(range: DateRangeInput): SqlBounds {
  const filter = toDateFilter(range);
  if (!filter) return {};
  const bounds: SqlBounds = {};
  if (filter.gte) bounds.fromDate = toDateOnly(filter.gte);
  const end = filter.lt ?? (filter.lte ? new Date(filter.lte.getTime() + 1) : undefined);
  if (end) {
    // Round a datetime upper bound up to the next whole day for DATE columns.
    const day = new Date(`${toDateOnly(end)}T00:00:00.000Z`);
    if (day.getTime() < end.getTime()) day.setUTCDate(day.getUTCDate() + 1);
    bounds.toDateExclusive = toDateOnly(day);
  }
  return bounds;
}

function soldPolicyConditions(
  scope: AnalyticsScope,
  bounds: SqlBounds,
  extra: { insuranceType?: InsuranceType | undefined; agentId?: string | undefined } = {},
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`sp."tenantId" = ${scope.tenantId}::uuid`,
    Prisma.sql`sp."policyStatus"::text <> 'CANCELLED'`,
  ];
  const agentId = scope.agentId ?? extra.agentId;
  if (agentId) conditions.push(Prisma.sql`sp."agentId" = ${agentId}::uuid`);
  if (bounds.fromDate) conditions.push(Prisma.sql`sp."issueDate" >= ${bounds.fromDate}::date`);
  if (bounds.toDateExclusive) {
    conditions.push(Prisma.sql`sp."issueDate" < ${bounds.toDateExclusive}::date`);
  }
  if (extra.insuranceType) {
    conditions.push(Prisma.sql`p."insuranceType"::text = ${extra.insuranceType}`);
  }
  return Prisma.join(conditions, " AND ");
}

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

// ─── Summary ──────────────────────────────────────────────────────────────────
export async function getSummary(db: Database, scope: AnalyticsScope, range: DateRangeInput) {
  const issueDate = toDateFilter(range);
  const soldWhere: Prisma.SoldPolicyWhereInput = {
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
    ...(issueDate ? { issueDate } : {}),
  };
  const today = parseDateOnly(new Date().toISOString());
  const live = (status: LiveStatus) =>
    db.soldPolicy.count({ where: { ...soldWhere, ...liveStatusWhere(status, today) } });
  const [
    totalPolicies,
    activePolicies,
    byStatus,
    premium,
    collected,
    totalAgents,
    totalCustomers,
    liveActive,
    livePending,
    liveExpired,
    liveRenewed,
  ] = await Promise.all([
    // Agents only see the catalog they can sell from.
    db.policy.count({ where: scope.agentId ? { status: "ACTIVE" } : {} }),
    db.policy.count({ where: { status: "ACTIVE" } }),
    db.soldPolicy.groupBy({ by: ["policyStatus"], where: soldWhere, _count: { _all: true } }),
    db.soldPolicy.aggregate({
      where: { ...soldWhere, policyStatus: { not: "CANCELLED" } },
      _sum: { premium: true },
    }),
    db.receipt.aggregate({
      where: { paymentStatus: "PAID", soldPolicy: soldWhere },
      _sum: { amount: true },
    }),
    scope.agentId ? Promise.resolve(null) : db.agent.count(),
    db.customer.count({ where: scope.agentId ? { assignedAgentId: scope.agentId } : {} }),
    live("ACTIVE"),
    live("PENDING"),
    live("EXPIRED"),
    live("RENEWED"),
  ]);

  const countFor = (status: string) =>
    byStatus.find((row) => row.policyStatus === status)?._count._all ?? 0;
  return {
    totalPolicies,
    activePolicies,
    policiesSold: byStatus.reduce((total, row) => total + row._count._all, 0),
    activeSoldPolicies: liveActive,
    pendingSoldPolicies: livePending,
    expiredSoldPolicies: liveExpired,
    renewedSoldPolicies: liveRenewed,
    cancelledSoldPolicies: countFor("CANCELLED"),
    totalPremium: premium._sum.premium ? toNumber(premium._sum.premium) : 0,
    premiumCollected: collected._sum.amount ? toNumber(collected._sum.amount) : 0,
    totalAgents,
    totalCustomers,
  };
}

// ─── Sales over time ──────────────────────────────────────────────────────────
export type SalesInterval = "day" | "week" | "month";

const MAX_PERIODS: Record<SalesInterval, number> = { day: 366, week: 260, month: 120 };
const DEFAULT_LOOKBACK_DAYS: Record<SalesInterval, number> = { day: 30, week: 84, month: 365 };

export async function getSalesOverTime(
  db: Database,
  scope: AnalyticsScope,
  options: DateRangeInput & {
    interval: SalesInterval;
    insuranceType?: InsuranceType | undefined;
    agentId?: string | undefined;
  },
) {
  const today = toDateOnly(new Date());
  const to = options.to ?? today;
  const from =
    options.from ??
    toDateOnly(
      new Date(
        Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
          DEFAULT_LOOKBACK_DAYS[options.interval] * 86_400_000,
      ),
    );
  const bounds = toSqlBounds({ from, to });
  const lastDay = toDateOnly(
    new Date(Date.parse(`${bounds.toDateExclusive}T00:00:00Z`) - 86_400_000),
  );

  const spanDays = (Date.parse(lastDay) - Date.parse(bounds.fromDate!)) / 86_400_000 + 1;
  const approxPeriods = Math.ceil(
    spanDays / (options.interval === "day" ? 1 : options.interval === "week" ? 7 : 28),
  );
  if (approxPeriods > MAX_PERIODS[options.interval] + 5) {
    throw badRequest(`Date range is too long for interval '${options.interval}'.`);
  }

  const where = soldPolicyConditions(scope, bounds, options);
  const step = `1 ${options.interval}`;
  const rows = await db.$queryRaw<{ period: string; policiesSold: number; premium: string }[]>`
    WITH periods AS (
      SELECT generate_series(
        date_trunc(${options.interval}, ${bounds.fromDate}::date::timestamp),
        date_trunc(${options.interval}, ${lastDay}::date::timestamp),
        ${step}::interval
      )::date AS period
    ),
    sales AS (
      SELECT date_trunc(${options.interval}, sp."issueDate"::timestamp)::date AS period,
             COUNT(*)::int AS sold,
             SUM(sp.premium) AS premium
      FROM sold_policies sp
      JOIN policies p ON p.id = sp."policyId"
      WHERE ${where}
      GROUP BY 1
    )
    SELECT to_char(periods.period, 'YYYY-MM-DD') AS period,
           COALESCE(sales.sold, 0)::int AS "policiesSold",
           COALESCE(sales.premium, 0)::text AS premium
    FROM periods
    LEFT JOIN sales USING (period)
    ORDER BY periods.period`;

  return {
    interval: options.interval,
    from: bounds.fromDate!,
    to: lastDay,
    points: rows.map((row) => ({
      period: row.period,
      policiesSold: row.policiesSold,
      premium: num(row.premium),
    })),
  };
}

// ─── Distribution ─────────────────────────────────────────────────────────────
export async function getPolicyDistribution(
  db: Database,
  scope: AnalyticsScope,
  range: DateRangeInput,
) {
  const where = soldPolicyConditions(scope, toSqlBounds(range));
  const rows = await db.$queryRaw<
    { insuranceType: InsuranceType; count: number; premium: string }[]
  >`
    SELECT p."insuranceType"::text AS "insuranceType",
           COUNT(*)::int AS count,
           COALESCE(SUM(sp.premium), 0)::text AS premium
    FROM sold_policies sp
    JOIN policies p ON p.id = sp."policyId"
    WHERE ${where}
    GROUP BY 1`;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  // HEALTH and MOTOR are always listed; LIFE and COMMERCIAL only once they have sales.
  const lines = (["HEALTH", "MOTOR", "LIFE", "COMMERCIAL"] as const).filter(
    (line) =>
      line === "HEALTH" || line === "MOTOR" || rows.some((row) => row.insuranceType === line),
  );
  return lines.map((insuranceType) => {
    const row = rows.find((item) => item.insuranceType === insuranceType);
    const count = row?.count ?? 0;
    return {
      insuranceType,
      policiesSold: count,
      premium: num(row?.premium),
      percentage: total ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}

// ─── Portfolio summary ────────────────────────────────────────────────────────
/**
 * Sold policies per insurance line by status (cancelled excluded). HEALTH and MOTOR are
 * always listed; LIFE and COMMERCIAL appear once they have sales.
 */
export async function getPortfolioSummary(
  db: Database,
  scope: AnalyticsScope,
  range: DateRangeInput,
) {
  const where = soldPolicyConditions(scope, toSqlBounds(range));
  const rows = await db.$queryRaw<
    { insuranceType: InsuranceType; status: string; count: number; premium: string }[]
  >`
    SELECT p."insuranceType"::text AS "insuranceType",
           CASE
             WHEN EXISTS (
               SELECT 1 FROM sold_policies r
               WHERE r."renewedFromId" = sp.id AND r."policyStatus"::text <> 'CANCELLED'
             ) THEN 'RENEWED'
             WHEN sp."expiryDate" < CURRENT_DATE THEN 'EXPIRED'
             ELSE sp."policyStatus"::text
           END AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(sp.premium), 0)::text AS premium
    FROM sold_policies sp
    JOIN policies p ON p.id = sp."policyId"
    WHERE ${where}
    GROUP BY 1, 2`;
  const lines = (["HEALTH", "MOTOR", "LIFE", "COMMERCIAL"] as const).filter(
    (line) =>
      line === "HEALTH" || line === "MOTOR" || rows.some((row) => row.insuranceType === line),
  );
  return lines.map((insuranceType) => {
    const own = rows.filter((row) => row.insuranceType === insuranceType);
    const count = (status: string) => own.find((row) => row.status === status)?.count ?? 0;
    return {
      insuranceType,
      total: own.reduce((sum, row) => sum + row.count, 0),
      active: count("ACTIVE"),
      pending: count("PENDING"),
      expired: count("EXPIRED"),
      renewed: count("RENEWED"),
      totalPremium: own.reduce((sum, row) => sum + num(row.premium), 0),
    };
  });
}

// ─── Agent performance ────────────────────────────────────────────────────────
const AGENT_SORT: Record<string, Prisma.Sql> = {
  premium: Prisma.sql`"totalPremium" DESC`,
  policiesSold: Prisma.sql`"policiesSold" DESC`,
  customers: Prisma.sql`customers DESC`,
  fullName: Prisma.sql`a."fullName" ASC`,
};

export async function getAgentPerformance(
  db: Database,
  scope: AnalyticsScope,
  options: DateRangeInput & {
    limit: number;
    offset?: number;
    sortBy: keyof typeof AGENT_SORT;
    status?: AgentStatus | undefined;
  },
) {
  const bounds = toSqlBounds(options);
  const soldWhere = soldPolicyConditions({ tenantId: scope.tenantId, agentId: null }, bounds);
  const receiptConditions: Prisma.Sql[] = [
    Prisma.sql`r."tenantId" = ${scope.tenantId}::uuid`,
    Prisma.sql`r."paymentStatus"::text = 'PAID'`,
  ];
  if (bounds.fromDate) {
    receiptConditions.push(Prisma.sql`r."issuedAt" >= ${bounds.fromDate}::date::timestamp`);
  }
  if (bounds.toDateExclusive) {
    receiptConditions.push(Prisma.sql`r."issuedAt" < ${bounds.toDateExclusive}::date::timestamp`);
  }
  const agentConditions: Prisma.Sql[] = [Prisma.sql`a."tenantId" = ${scope.tenantId}::uuid`];
  if (scope.agentId) agentConditions.push(Prisma.sql`a.id = ${scope.agentId}::uuid`);
  if (options.status) agentConditions.push(Prisma.sql`a.status::text = ${options.status}`);
  const agentWhere = Prisma.join(agentConditions, " AND ");

  const [rows, totals] = await Promise.all([
    db.$queryRaw<
      {
        agentId: string;
        agentCode: string;
        fullName: string;
        status: AgentStatus;
        customers: number;
        policiesSold: number;
        totalPremium: string;
        premiumCollected: string;
        lastSaleDate: string | null;
      }[]
    >`
      SELECT a.id AS "agentId", a."agentCode", a."fullName", a.status::text AS status,
             COALESCE(c.customers, 0)::int AS customers,
             COALESCE(s.sold, 0)::int AS "policiesSold",
             COALESCE(s.premium, 0)::text AS "totalPremium",
             COALESCE(r.collected, 0)::text AS "premiumCollected",
             to_char(s."lastSaleDate", 'YYYY-MM-DD') AS "lastSaleDate"
      FROM agents a
      LEFT JOIN (
        SELECT sp."agentId", COUNT(*) AS sold, SUM(sp.premium) AS premium,
               MAX(sp."issueDate") AS "lastSaleDate"
        FROM sold_policies sp
        JOIN policies p ON p.id = sp."policyId"
        WHERE ${soldWhere}
        GROUP BY sp."agentId"
      ) s ON s."agentId" = a.id
      LEFT JOIN (
        SELECT "assignedAgentId", COUNT(*) AS customers
        FROM customers
        WHERE "tenantId" = ${scope.tenantId}::uuid
        GROUP BY "assignedAgentId"
      ) c ON c."assignedAgentId" = a.id
      LEFT JOIN (
        SELECT sp."agentId", SUM(r.amount) AS collected
        FROM receipts r
        JOIN sold_policies sp ON sp.id = r."soldPolicyId"
        WHERE ${Prisma.join(receiptConditions, " AND ")}
        GROUP BY sp."agentId"
      ) r ON r."agentId" = a.id
      WHERE ${agentWhere}
      ORDER BY ${AGENT_SORT[options.sortBy] ?? AGENT_SORT.premium!}, a.id
      LIMIT ${options.limit} OFFSET ${options.offset ?? 0}`,
    db.$queryRaw<
      { total: number }[]
    >`SELECT COUNT(*)::int AS total FROM agents a WHERE ${agentWhere}`,
  ]);

  return {
    total: totals[0]?.total ?? 0,
    items: rows.map((row) => ({
      agentId: row.agentId,
      agentCode: row.agentCode,
      fullName: row.fullName,
      status: row.status,
      customers: row.customers,
      policiesSold: row.policiesSold,
      totalPremium: num(row.totalPremium),
      premiumCollected: num(row.premiumCollected),
      lastSaleDate: row.lastSaleDate,
    })),
  };
}

// ─── Recent sales ─────────────────────────────────────────────────────────────
export async function getRecentSales(db: Database, scope: AnalyticsScope, limit: number) {
  const rows = await db.soldPolicy.findMany({
    where: scope.agentId ? { agentId: scope.agentId } : {},
    include: soldPolicyInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit,
  });
  return rows.map(toSoldPolicyDto);
}

// ─── Policy performance (reports) ─────────────────────────────────────────────
const POLICY_SORT: Record<string, Prisma.Sql> = {
  policiesSold: Prisma.sql`"policiesSold" DESC`,
  premium: Prisma.sql`"totalPremium" DESC`,
  policyName: Prisma.sql`p."policyName" ASC`,
};

export async function getPolicyPerformance(
  db: Database,
  tenantId: string,
  options: DateRangeInput & {
    limit: number;
    offset: number;
    sortBy: keyof typeof POLICY_SORT;
    insuranceType?: InsuranceType | undefined;
    status?: PolicyStatus | undefined;
  },
) {
  const bounds = toSqlBounds(options);
  const soldConditions: Prisma.Sql[] = [
    Prisma.sql`sp."tenantId" = ${tenantId}::uuid`,
    Prisma.sql`sp."policyStatus"::text <> 'CANCELLED'`,
  ];
  if (bounds.fromDate) soldConditions.push(Prisma.sql`sp."issueDate" >= ${bounds.fromDate}::date`);
  if (bounds.toDateExclusive) {
    soldConditions.push(Prisma.sql`sp."issueDate" < ${bounds.toDateExclusive}::date`);
  }
  const policyConditions: Prisma.Sql[] = [Prisma.sql`p."tenantId" = ${tenantId}::uuid`];
  if (options.insuranceType) {
    policyConditions.push(Prisma.sql`p."insuranceType"::text = ${options.insuranceType}`);
  }
  if (options.status) policyConditions.push(Prisma.sql`p.status::text = ${options.status}`);
  const policyWhere = Prisma.join(policyConditions, " AND ");

  const [rows, totals] = await Promise.all([
    db.$queryRaw<
      {
        policyId: string;
        policyCode: string;
        policyName: string;
        insuranceType: InsuranceType;
        status: PolicyStatus;
        premium: string;
        policiesSold: number;
        totalPremium: string;
      }[]
    >`
      SELECT p.id AS "policyId", p."policyCode", p."policyName",
             p."insuranceType"::text AS "insuranceType", p.status::text AS status,
             COALESCE(p.premium, 0)::text AS premium,
             COALESCE(s.sold, 0)::int AS "policiesSold",
             COALESCE(s.premium, 0)::text AS "totalPremium"
      FROM policies p
      LEFT JOIN (
        SELECT sp."policyId", COUNT(*) AS sold, SUM(sp.premium) AS premium
        FROM sold_policies sp
        WHERE ${Prisma.join(soldConditions, " AND ")}
        GROUP BY sp."policyId"
      ) s ON s."policyId" = p.id
      WHERE ${policyWhere}
      ORDER BY ${POLICY_SORT[options.sortBy] ?? POLICY_SORT.policiesSold!}, p.id
      LIMIT ${options.limit} OFFSET ${options.offset}`,
    db.$queryRaw<
      { total: number }[]
    >`SELECT COUNT(*)::int AS total FROM policies p WHERE ${policyWhere}`,
  ]);

  return {
    total: totals[0]?.total ?? 0,
    items: rows.map((row) => ({
      policyId: row.policyId,
      policyCode: row.policyCode,
      policyName: row.policyName,
      insuranceType: row.insuranceType,
      status: row.status,
      catalogPremium: num(row.premium),
      policiesSold: row.policiesSold,
      totalPremium: num(row.totalPremium),
    })),
  };
}

// ─── Status breakdowns (reports) ──────────────────────────────────────────────
export async function getSalesBreakdown(
  db: Database,
  options: DateRangeInput & {
    agentId?: string | undefined;
    insuranceType?: InsuranceType | undefined;
  },
) {
  const issueDate = toDateFilter(options);
  const where: Prisma.SoldPolicyWhereInput = {
    ...(options.agentId ? { agentId: options.agentId } : {}),
    ...(options.insuranceType ? { policy: { insuranceType: options.insuranceType } } : {}),
    ...(issueDate ? { issueDate } : {}),
  };
  const today = parseDateOnly(new Date().toISOString());
  const liveStatuses = ["ACTIVE", "PENDING", "EXPIRED", "RENEWED"] as const;
  const [byLiveStatus, cancelled, byPaymentStatus] = await Promise.all([
    Promise.all(
      liveStatuses.map((status) =>
        db.soldPolicy.aggregate({
          where: { ...where, ...liveStatusWhere(status, today) },
          _count: { _all: true },
          _sum: { premium: true },
        }),
      ),
    ),
    db.soldPolicy.aggregate({
      where: { ...where, policyStatus: "CANCELLED" },
      _count: { _all: true },
      _sum: { premium: true },
    }),
    db.soldPolicy.groupBy({
      by: ["paymentStatus"],
      where,
      _count: { _all: true },
      _sum: { premium: true },
    }),
  ]);
  const byPolicyStatus = [
    ...liveStatuses.map((status, index) => ({ status, row: byLiveStatus[index]! })),
    { status: "CANCELLED" as const, row: cancelled },
  ].filter(({ row }) => row._count._all > 0);
  return {
    byPolicyStatus: byPolicyStatus.map(({ status, row }) => ({
      status,
      count: row._count._all,
      premium: row._sum.premium ? toNumber(row._sum.premium) : 0,
    })),
    byPaymentStatus: byPaymentStatus.map((row) => ({
      status: row.paymentStatus,
      count: row._count._all,
      premium: row._sum.premium ? toNumber(row._sum.premium) : 0,
    })),
  };
}
