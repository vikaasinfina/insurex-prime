import { z } from "zod";
import type { Env } from "../../config/env.js";
import { geminiJson } from "./gemini.js";

export const coachingBodySchema = z.object({
  cadence: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  daysLeft: z.number().int().min(0).max(366),
  categories: z
    .array(
      z.object({
        category: z.enum(["motor", "health", "life"]),
        targetPolicies: z.number().int().min(0).max(100_000),
        soldPolicies: z.number().int().min(0).max(100_000),
      }),
    )
    .max(3),
});

export const coachingSchema = z.object({
  steps: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .describe("Top 5 steps, most important first"),
  source: z.enum(["ai", "fallback"]),
});

export type CoachingBody = z.infer<typeof coachingBodySchema>;
export type Coaching = z.infer<typeof coachingSchema>;
type Step = Coaching["steps"][number];

/** Shown when no Gemini key is configured or the call fails, so the help panel always works. */
const FALLBACK_STEPS: Step[] = [
  {
    title: "Start with warm leads",
    detail:
      "Call customers whose policies expire in the next 30–60 days first — renewals convert the fastest.",
  },
  {
    title: "Ask for referrals",
    detail:
      "After every sale or claim help, ask the client for two names. Referred leads close far more often than cold calls.",
  },
  {
    title: "Lead with the client's need",
    detail:
      "Ask about family, vehicle and income before quoting. Recommend cover that fits their situation, not the cheapest one.",
  },
  {
    title: "Follow up within 48 hours",
    detail:
      "Send the quote the same day, then call or WhatsApp in 2 days. Most sales are lost to silence, not to a 'no'.",
  },
  {
    title: "Bundle across categories",
    detail:
      "Offer health with motor, or life with health. Cross-selling lifts premium per client and improves retention.",
  },
];

const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_INTERVAL_MS = 10 * 1000;
const cache = new Map<string, { at: number; value: Coaching }>();
const lastCall = new Map<string, number>();

function buildPrompt(input: CoachingBody) {
  const lines = input.categories.map((row) => {
    const gap = Math.max(0, row.targetPolicies - row.soldPolicies);
    return row.targetPolicies
      ? `- ${row.category}: sold ${row.soldPolicies} of ${row.targetPolicies} (${gap} to go)`
      : `- ${row.category}: no goal set`;
  });
  return `You are a sales coach for independent insurance agents in India (motor, health and life insurance, sold through an agency).
The agent's ${input.cadence} goal progress, with ${input.daysLeft} days left in the period:
${lines.join("\n")}

Give the TOP 5 practical steps this agent should take now to convert more business and reach the goal.
Draw on what consistently works for top-performing insurance agents: renewal and warm-lead prioritisation, needs-based
conversations, referrals, timely follow-up, cross-selling, trust and compliance-friendly communication.
Prioritise the category furthest behind. Each step: a title of at most 6 words and one concrete, actionable sentence
(max 30 words). Do not invent statistics or name companies. Plain, encouraging language.`;
}

async function askGemini(env: Env, input: CoachingBody): Promise<Step[]> {
  const raw = await geminiJson(
    env,
    buildPrompt(input),
    {
      type: "ARRAY",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, detail: { type: "STRING" } },
        required: ["title", "detail"],
      },
    },
    { temperature: 0.6 },
  );
  const steps = z
    .array(z.object({ title: z.string().min(1), detail: z.string().min(1) }))
    .min(1)
    .parse(raw);
  return steps.slice(0, 5);
}

export async function getCoaching(
  env: Env,
  agentId: string,
  input: CoachingBody,
  log: { warn: (obj: object, msg: string) => void },
): Promise<Coaching> {
  if (!env.GEMINI_API_KEY) return { steps: FALLBACK_STEPS, source: "fallback" };

  const key = `${agentId}:${JSON.stringify(input)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  // Protects the API quota: an agent cannot trigger a fresh model call more than once per 10s.
  const previous = lastCall.get(agentId) ?? 0;
  if (Date.now() - previous < MIN_INTERVAL_MS) {
    return hit?.value ?? { steps: FALLBACK_STEPS, source: "fallback" };
  }
  lastCall.set(agentId, Date.now());

  try {
    const value: Coaching = { steps: await askGemini(env, input), source: "ai" };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : "unknown" }, "Gemini coach failed");
    return { steps: FALLBACK_STEPS, source: "fallback" };
  }
}
