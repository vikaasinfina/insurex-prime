import type { Database } from "../../config/database.js";
import type { GoalCadence, InsuranceType } from "../../generated/prisma/enums.js";
import { toDateOnly, toNumber } from "../../utils/format.js";
import {
  GOAL_CADENCES,
  GOAL_CATEGORIES,
  type GoalCadenceKey,
  type GoalCategoryKey,
  type SalesGoalsDto,
  type SetGoalsBody,
} from "./agent-goals.schemas.js";

const DAY_MS = 86_400_000;
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

const cadenceEnum: Record<GoalCadenceKey, GoalCadence> = {
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  yearly: "YEARLY",
};
const categoryEnum: Record<GoalCategoryKey, InsuranceType> = {
  motor: "MOTOR",
  health: "HEALTH",
  life: "LIFE",
};
const categoryKey = (value: InsuranceType): GoalCategoryKey | null =>
  GOAL_CATEGORIES.find((key) => categoryEnum[key] === value) ?? null;

/** Inclusive [start, end] of the week (Mon–Sun), month, quarter or year containing `today` (UTC). */
export function periodBounds(cadence: GoalCadenceKey, today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (cadence) {
    case "weekly": {
      const offset = (today.getUTCDay() + 6) % 7;
      const start = new Date(today.getTime() - offset * DAY_MS);
      return { start, end: new Date(start.getTime() + 6 * DAY_MS) };
    }
    case "monthly":
      return { start: utcDate(y, m, 1), end: utcDate(y, m + 1, 0) };
    case "quarterly": {
      const q = Math.floor(m / 3) * 3;
      return { start: utcDate(y, q, 1), end: utcDate(y, q + 3, 0) };
    }
    case "yearly":
      return { start: utcDate(y, 0, 1), end: utcDate(y, 11, 31) };
  }
}

/**
 * Until a monthly, quarterly or yearly target is saved, it follows the weekly one:
 * weekly x weeks in the period (4 / 13 / 52).
 */
export const WEEKS_IN_PERIOD: Record<Exclude<GoalCadenceKey, "weekly">, number> = {
  monthly: 4,
  quarterly: 13,
  yearly: 52,
};

const emptyCategory = () => ({
  targetPolicies: 0,
  targetPremium: 0,
  soldPolicies: 0,
  closedPremium: 0,
  derived: false,
});

/**
 * The agent's targets for the current week/month/quarter/year, with progress taken from their
 * own sales issued in each period (cancelled sales excluded). Commercial sales are not tracked.
 */
export async function getSalesGoals(db: Database, agentId: string): Promise<SalesGoalsDto> {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const bounds = Object.fromEntries(
    GOAL_CADENCES.map((cadence) => [cadence, periodBounds(cadence, today)]),
  ) as Record<GoalCadenceKey, { start: Date; end: Date }>;

  const [goals, sales] = await Promise.all([
    db.salesGoal.findMany({ where: { agentId } }),
    db.soldPolicy.findMany({
      where: {
        agentId,
        policyStatus: { not: "CANCELLED" },
        issueDate: { gte: bounds.yearly.start, lte: bounds.yearly.end },
      },
      select: { issueDate: true, premium: true, policy: { select: { insuranceType: true } } },
    }),
  ]);

  const result = Object.fromEntries(
    GOAL_CADENCES.map((cadence) => [
      cadence,
      {
        periodStart: toDateOnly(bounds[cadence].start),
        periodEnd: toDateOnly(bounds[cadence].end),
        categories: {
          motor: emptyCategory(),
          health: emptyCategory(),
          life: emptyCategory(),
        },
      },
    ]),
  ) as unknown as Omit<SalesGoalsDto, "today">;

  for (const goal of goals) {
    const category = categoryKey(goal.category);
    const cadence = GOAL_CADENCES.find((key) => cadenceEnum[key] === goal.cadence);
    if (!category || !cadence) continue;
    const row = result[cadence].categories[category];
    row.targetPolicies = goal.targetPolicies;
    row.targetPremium = toNumber(goal.targetPremium);
  }

  const saved = new Set(goals.map((goal) => `${goal.cadence}:${goal.category}`));
  for (const cadence of GOAL_CADENCES) {
    if (cadence === "weekly") continue;
    for (const category of GOAL_CATEGORIES) {
      if (saved.has(`${cadenceEnum[cadence]}:${categoryEnum[category]}`)) continue;
      const weekly = result.weekly.categories[category];
      if (weekly.targetPolicies === 0) continue;
      const row = result[cadence].categories[category];
      row.targetPolicies = weekly.targetPolicies * WEEKS_IN_PERIOD[cadence];
      row.targetPremium = weekly.targetPremium * WEEKS_IN_PERIOD[cadence];
      row.derived = true;
    }
  }

  for (const sale of sales) {
    const category = categoryKey(sale.policy.insuranceType);
    if (!category) continue;
    for (const cadence of GOAL_CADENCES) {
      const { start, end } = bounds[cadence];
      if (sale.issueDate < start || sale.issueDate > end) continue;
      const row = result[cadence].categories[category];
      row.soldPolicies += 1;
      row.closedPremium += toNumber(sale.premium);
    }
  }

  return { today: toDateOnly(today), ...result };
}

/** Replaces the agent's targets for one cadence. A category with 0 policies has its goal removed. */
export async function setSalesGoals(
  db: Database,
  tenantId: string,
  agentId: string,
  cadence: GoalCadenceKey,
  body: SetGoalsBody,
) {
  for (const key of GOAL_CATEGORIES) {
    const where = {
      agentId_cadence_category: {
        agentId,
        cadence: cadenceEnum[cadence],
        category: categoryEnum[key],
      },
    };
    const target = body[key];
    if (target.targetPolicies === 0) {
      await db.salesGoal.deleteMany({
        where: { agentId, cadence: cadenceEnum[cadence], category: categoryEnum[key] },
      });
      continue;
    }
    await db.salesGoal.upsert({
      where,
      update: { targetPolicies: target.targetPolicies, targetPremium: target.targetPremium },
      create: {
        tenantId,
        agentId,
        cadence: cadenceEnum[cadence],
        category: categoryEnum[key],
        targetPolicies: target.targetPolicies,
        targetPremium: target.targetPremium,
      },
    });
  }
  return getSalesGoals(db, agentId);
}
