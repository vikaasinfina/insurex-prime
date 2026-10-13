import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentKeys } from "@/lib/agent-queries";
import {
  agentGoalsApi,
  retryUnlessClientError,
  type ApiGoalPeriod,
  type ApiSalesGoals,
  type GoalTargets,
} from "@/lib/api";

/**
 * Sales goals for the agent, set per product category (Motor / Health / Life) and per period.
 *
 * Targets are stored on the backend (`/agent/goals`); sold policies and closed premium are
 * computed there from the agent's own sales in the current week/month/quarter/year.
 */
export type GoalCadence = "weekly" | "monthly" | "quarterly" | "yearly";
export type GoalCategory = "motor" | "health" | "life";

export interface CategoryGoal {
  /** 0 means no goal set for this category. */
  targetPolicies: number;
  targetPremium: number;
  soldPolicies: number;
  closedPremium: number;
  /** True when this is the weekly target scaled up, not one the agent saved. */
  derived?: boolean;
}

export interface SalesGoal {
  cadence: GoalCadence;
  categories: Record<GoalCategory, CategoryGoal>;
  /** Human period, e.g. "Oct 21 – Oct 27". */
  periodLabel: string;
  daysLeft: number;
  businessDaysLeft: number;
  /** Share of the period already elapsed (0–1), used for pacing. */
  elapsed: number;
}

export const cadenceLabel: Record<GoalCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const categoryLabel: Record<GoalCategory, string> = {
  motor: "Motor",
  health: "Health",
  life: "Life",
};

export const goalCategories: GoalCategory[] = ["motor", "health", "life"];

// ─── Period helpers ───────────────────────────────────────────────────────────
const DAY = 86_400_000;
const short = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const utcDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

function businessDaysBetween(from: Date, to: Date) {
  let count = 0;
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Labels and pacing for a period. `today` is the server's UTC date, so both sides agree. */
function periodInfo(period: ApiGoalPeriod, today: string) {
  const start = utcDay(period.periodStart);
  const end = utcDay(period.periodEnd);
  const now = utcDay(today);
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const daysLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / DAY));
  return {
    periodLabel: `${short(start)} – ${short(end)}`,
    daysLeft,
    businessDaysLeft: now > end ? 0 : businessDaysBetween(now, end),
    elapsed: Math.min(1, (totalDays - daysLeft) / totalDays),
  };
}

// ─── API ──────────────────────────────────────────────────────────────────────
const toGoals = (data: ApiSalesGoals): Record<GoalCadence, SalesGoal> =>
  Object.fromEntries(
    (Object.keys(cadenceLabel) as GoalCadence[]).map((cadence) => [
      cadence,
      { cadence, categories: data[cadence].categories, ...periodInfo(data[cadence], data.today) },
    ]),
  ) as Record<GoalCadence, SalesGoal>;

/** The agent's goals and progress for every period. `goals` is undefined until loaded. */
export function useSalesGoals() {
  const query = useQuery({
    queryKey: agentKeys.goals,
    queryFn: async () => toGoals(await agentGoalsApi.get()),
    retry: retryUnlessClientError,
  });
  return { ...query, goals: query.data };
}

export function useSetSalesGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cadence, targets }: { cadence: GoalCadence; targets: GoalTargets }) =>
      agentGoalsApi.set(cadence, targets),
    onSuccess: (data) => queryClient.setQueryData(agentKeys.goals, toGoals(data)),
  });
}

export const percent = (value: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

export type Pace = "AHEAD" | "ON_TRACK" | "BEHIND" | "ACHIEVED";

/** Compares progress with how much of the period has gone by. */
export function paceOf(goal: CategoryGoal, elapsed: number): Pace {
  const progress = goal.targetPolicies ? goal.soldPolicies / goal.targetPolicies : 0;
  if (progress >= 1) return "ACHIEVED";
  if (progress >= elapsed + 0.1) return "AHEAD";
  if (progress >= elapsed - 0.15) return "ON_TRACK";
  return "BEHIND";
}

export const paceLabel: Record<Pace, string> = {
  AHEAD: "Ahead of pace",
  ON_TRACK: "On track",
  BEHIND: "Behind pace",
  ACHIEVED: "Achieved",
};
