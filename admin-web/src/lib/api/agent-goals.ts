import { apiRequest } from "./client";

export type ApiGoalCategory = "motor" | "health" | "life";

export interface ApiCategoryGoal {
  /** 0 means no goal set. */
  targetPolicies: number;
  targetPremium: number;
  soldPolicies: number;
  closedPremium: number;
}

export interface ApiGoalPeriod {
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  categories: Record<ApiGoalCategory, ApiCategoryGoal>;
}

export interface ApiSalesGoals {
  today: string;
  weekly: ApiGoalPeriod;
  monthly: ApiGoalPeriod;
  quarterly: ApiGoalPeriod;
  yearly: ApiGoalPeriod;
}

export type GoalTargets = Record<
  ApiGoalCategory,
  { targetPolicies: number; targetPremium: number }
>;

export const agentGoalsApi = {
  get: () => apiRequest<ApiSalesGoals>("/agent/goals"),
  set: (cadence: keyof Omit<ApiSalesGoals, "today">, targets: GoalTargets) =>
    apiRequest<ApiSalesGoals>(`/agent/goals/${cadence}`, { method: "PUT", body: targets }),
};
