import { z } from "zod";

export const GOAL_CADENCES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export const GOAL_CATEGORIES = ["motor", "health", "life"] as const;
export type GoalCadenceKey = (typeof GOAL_CADENCES)[number];
export type GoalCategoryKey = (typeof GOAL_CATEGORIES)[number];

const categoryGoalSchema = z.object({
  targetPolicies: z.number().int().describe("0 means no goal set"),
  targetPremium: z.number(),
  soldPolicies: z.number().int(),
  closedPremium: z.number(),
});

const periodSchema = z.object({
  periodStart: z.string().describe("YYYY-MM-DD, first day of the current period"),
  periodEnd: z.string().describe("YYYY-MM-DD, last day of the current period"),
  categories: z.object({
    motor: categoryGoalSchema,
    health: categoryGoalSchema,
    life: categoryGoalSchema,
  }),
});

export const salesGoalsSchema = z.object({
  today: z.string().describe("YYYY-MM-DD (UTC) the periods were computed for"),
  weekly: periodSchema,
  monthly: periodSchema,
  quarterly: periodSchema,
  yearly: periodSchema,
});

export const cadenceParamsSchema = z.object({ cadence: z.enum(GOAL_CADENCES) });

const targetSchema = z.object({
  targetPolicies: z.number().int().min(0).max(100_000),
  targetPremium: z.number().min(0).max(1_000_000_000),
});

export const setGoalsBodySchema = z.object({
  motor: targetSchema,
  health: targetSchema,
  life: targetSchema,
});

export type SalesGoalsDto = z.infer<typeof salesGoalsSchema>;
export type SetGoalsBody = z.infer<typeof setGoalsBodySchema>;
