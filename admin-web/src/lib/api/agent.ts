import { apiRequest } from "./client";
import type { AgentDashboard, AgentDashboardRange, AgentProfile } from "./types";

export interface AgentProfileInput {
  fullName?: string;
  phone?: string;
  address?: string | null;
}

export interface CoachingInput {
  cadence: "weekly" | "monthly" | "quarterly" | "yearly";
  daysLeft: number;
  categories: {
    category: "motor" | "health" | "life";
    targetPolicies: number;
    soldPolicies: number;
  }[];
}

export interface Coaching {
  steps: { title: string; detail: string }[];
  /** "fallback" is the built-in checklist, used when AI is unavailable. */
  source: "ai" | "fallback";
}

/** The signed-in agent's own workspace. The backend derives the agent from the session. */
export const agentApi = {
  dashboard: (range: AgentDashboardRange = "30D") =>
    apiRequest<AgentDashboard>("/agent/dashboard", { query: { range } }),
  coaching: (input: CoachingInput) =>
    apiRequest<Coaching>("/agent/coaching", { method: "POST", body: input }),
  profile: () => apiRequest<AgentProfile>("/agent/profile"),
  updateProfile: (input: AgentProfileInput) =>
    apiRequest<AgentProfile>("/agent/profile", { method: "PATCH", body: input }),
};
