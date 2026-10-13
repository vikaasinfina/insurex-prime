import { z } from "zod";
import type { Env } from "../../config/env.js";
import { geminiJson } from "../agent-portal/gemini.js";

export const parseMemoBodySchema = z.object({
  text: z.string().trim().min(3).max(1500).describe("What the agent said or typed, as free text"),
  now: z.iso.datetime().describe("The agent's current time, so 'in two days' can be resolved"),
  utcOffsetMinutes: z
    .number()
    .int()
    .min(-840)
    .max(840)
    .describe("JS Date.getTimezoneOffset() of the agent's device (UTC minus local, in minutes)"),
});

export const parsedMemoSchema = z.object({
  clientName: z.string().describe("Empty when no client could be identified"),
  phone: z.string(),
  coverage: z.string(),
  category: z.enum(["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"]),
  note: z.string(),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
  followUpAt: z.string().nullable().describe("ISO timestamp, or null when no follow-up was said"),
  followUpLabel: z.string(),
  source: z.enum(["ai", "basic"]),
});

export type ParseMemoBody = z.infer<typeof parseMemoBodySchema>;
export type ParsedMemo = z.infer<typeof parsedMemoSchema>;

const DEFAULT_FOLLOW_UP_HOUR = 10;
const HOUR_MS = 3_600_000;

const aiResultSchema = z.object({
  clientName: z.string().default(""),
  phone: z.string().default(""),
  coverage: z.string().default(""),
  category: z.enum(["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"]).default("HEALTH"),
  note: z.string().default(""),
  completed: z.boolean().default(false),
  followUpDate: z.string().nullable().default(null),
  followUpTime: z.string().nullable().default(null),
  followUpLabel: z.string().default(""),
});

/** "2026-10-14" + "15:30" in the agent's local time → UTC ISO. Null when the date is not valid. */
export function localToIso(
  date: string | null,
  time: string | null,
  utcOffsetMinutes: number,
): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!day) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  const hour = clock ? Number(clock[1]) : DEFAULT_FOLLOW_UP_HOUR;
  const minute = clock ? Number(clock[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  const local = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hour, minute);
  const result = new Date(local + utcOffsetMinutes * 60_000);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** The agent's wall-clock time as "Sunday, 2026-10-11 16:48", for the prompt. */
function localClock(nowIso: string, utcOffsetMinutes: number) {
  const local = new Date(new Date(nowIso).getTime() - utcOffsetMinutes * 60_000);
  const weekday = local.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${weekday}, ${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 16)}`;
}

const SECOND_PERSON_VERBS: Record<string, string> = {
  was: "were",
  wasn: "weren",
  has: "have",
  hasn: "haven",
  is: "are",
  isn: "aren",
  does: "do",
  doesn: "don",
};

/**
 * The memo is the agent's own note, so it must read "You ..." and never "The agent ...".
 * The prompt asks for this; this fixes any slip before the text reaches the form.
 */
export function toSecondPerson(text: string): string {
  return text
    .replace(/\b(?:the|this) agent['\u2019]s\b/gi, (m) => (/^[A-Z]/.test(m) ? "Your" : "your"))
    .replace(/\b(?:the|this) agent\b(?:\s+(\w+?)(?=n['\u2019]t\b|\b))?/gi, (m, verb?: string) => {
      const start = /^[A-Z]/.test(m) ? "You" : "you";
      if (!verb) return start;
      const fixed = SECOND_PERSON_VERBS[verb.toLowerCase()];
      return fixed ? `${start} ${fixed}` : `${start} ${verb}`;
    })
    .replace(/(^|[.!?]\s+)you\b/g, (_m, lead: string) => `${lead}You`);
}

function buildPrompt(input: ParseMemoBody) {
  return `You turn an insurance agent's spoken or typed field note into a structured memo.
The agent's current local date and time: ${localClock(input.now, input.utcOffsetMinutes)}.

Agent's words: """${input.text}"""

Rules:
- clientName: the customer or business the agent met or spoke to, as a proper name (title case). Empty string if none is named.
- category: HEALTH, MOTOR, LIFE or COMMERCIAL (business/fleet/shop cover) — whichever the conversation was about; HEALTH if unclear.
- coverage: the product discussed in a few words (e.g. "New health policy"), or empty.
- note: a clear one or two sentence summary of what happened, written to the agent in second person past tense ("You spoke to ...", "You had a long discussion with ..."), never "The agent ..." or "He/She". Keep every concrete fact (amounts, names, conditions).
- followUpDate: a calendar date YYYY-MM-DD when a follow-up, callback, visit or decision is expected ("after two days", "next Monday", "tomorrow"), computed from the current date above. null if nothing is expected.
- followUpTime: HH:MM (24h) only if a time of day was said, else null.
- followUpLabel: what the follow-up is, 2-5 words (e.g. "Confirm health policy"). Empty if none.
- completed: true only if the agent says the matter is finished or the policy was sold/issued; otherwise false.
- phone: only digits the agent actually said as a phone number, else empty.
Do not invent details that were not said.`;
}

const aiSchema = {
  type: "OBJECT",
  properties: {
    clientName: { type: "STRING" },
    phone: { type: "STRING" },
    coverage: { type: "STRING" },
    category: { type: "STRING", enum: ["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"] },
    note: { type: "STRING" },
    completed: { type: "BOOLEAN" },
    followUpDate: { type: "STRING", nullable: true },
    followUpTime: { type: "STRING", nullable: true },
    followUpLabel: { type: "STRING" },
  },
  required: ["clientName", "category", "note", "completed"],
};

/** Keyword guess used only when AI is unavailable; the agent completes the rest in the form. */
function basicParse(input: ParseMemoBody): ParsedMemo {
  const text = input.text.toLowerCase();
  const category = /\b(motor|car|bike|vehicle|fleet|truck|two[- ]wheeler)\b/.test(text)
    ? "MOTOR"
    : /\b(life|term|endowment|ulip)\b/.test(text)
      ? "LIFE"
      : "HEALTH";
  return {
    clientName: "",
    phone: "",
    coverage: "",
    category,
    note: input.text,
    status: "IN_PROGRESS",
    followUpAt: null,
    followUpLabel: "",
    source: "basic",
  };
}

// Protects the API quota: at most 20 parses per agent per 10 minutes.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

function withinLimit(agentId: string) {
  const now = Date.now();
  const calls = (recent.get(agentId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (calls.length >= MAX_PER_WINDOW) {
    recent.set(agentId, calls);
    return false;
  }
  recent.set(agentId, [...calls, now]);
  return true;
}

/**
 * Reads a free-text/voice memo ("I spoke to Kamal Nath about the new health policy, he will
 * confirm in two days") into memo fields. Falls back to a basic result (the text as the memo, no
 * client) when AI is unavailable, so the agent can finish it in the form.
 */
export async function parseMemo(
  env: Env,
  agentId: string,
  input: ParseMemoBody,
  log: { warn: (obj: object, msg: string) => void },
): Promise<ParsedMemo> {
  if (!env.GEMINI_API_KEY || !withinLimit(agentId)) return basicParse(input);
  try {
    const ai = aiResultSchema.parse(await geminiJson(env, buildPrompt(input), aiSchema));
    const followUpAt = localToIso(ai.followUpDate, ai.followUpTime, input.utcOffsetMinutes);
    // A follow-up that is already in the past (a misread date) is dropped rather than recorded.
    const future =
      followUpAt && new Date(followUpAt).getTime() > new Date(input.now).getTime() - HOUR_MS;
    return {
      clientName: ai.clientName.trim(),
      phone: ai.phone.trim(),
      coverage: ai.coverage.trim(),
      category: ai.category,
      note: toSecondPerson(ai.note.trim()) || input.text,
      status: ai.completed ? "COMPLETED" : "IN_PROGRESS",
      followUpAt: future ? followUpAt : null,
      followUpLabel: future ? ai.followUpLabel.trim() : "",
      source: "ai",
    };
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : "unknown" }, "Gemini memo parse failed");
    return basicParse(input);
  }
}

// ─── Revise an existing memo with an instruction ──────────────────────────────
const memoStateSchema = z.object({
  clientName: z.string().max(200),
  phone: z.string().max(30),
  coverage: z.string().max(200),
  category: z.enum(["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"]),
  note: z.string().max(5000),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "POSTPONED"]),
  followUpAt: z.iso.datetime().nullable(),
  followUpLabel: z.string().max(100),
});

export const reviseMemoBodySchema = z.object({
  memo: memoStateSchema.describe("The memo as it currently stands in the form (may be empty)"),
  instruction: z
    .string()
    .trim()
    .min(3)
    .max(1500)
    .describe('What changed, e.g. "meeting postponed to next week, client has urgent work"'),
  now: z.iso.datetime(),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
});

export const revisedMemoSchema = z.object({
  clientName: z.string(),
  phone: z.string(),
  coverage: z.string(),
  category: z.enum(["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"]),
  note: z.string(),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "POSTPONED"]),
  followUpAt: z.string().nullable(),
  followUpLabel: z.string(),
  source: z.enum(["ai", "basic"]),
});

export type ReviseMemoBody = z.infer<typeof reviseMemoBodySchema>;
export type RevisedMemo = z.infer<typeof revisedMemoSchema>;

const reviseAiSchema = z.object({
  clientName: z.string().default(""),
  phone: z.string().default(""),
  coverage: z.string().default(""),
  category: z.enum(["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"]),
  note: z.string().default(""),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "POSTPONED"]),
  followUpDate: z.string().nullable().default(null),
  followUpTime: z.string().nullable().default(null),
  followUpLabel: z.string().default(""),
});

/** An ISO instant as the agent's local "YYYY-MM-DD" and "HH:MM". */
function localParts(iso: string, utcOffsetMinutes: number) {
  const local = new Date(new Date(iso).getTime() - utcOffsetMinutes * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

function buildRevisePrompt(input: ReviseMemoBody) {
  const { memo } = input;
  const followUp = memo.followUpAt ? localParts(memo.followUpAt, input.utcOffsetMinutes) : null;
  const current = {
    clientName: memo.clientName,
    phone: memo.phone,
    coverage: memo.coverage,
    category: memo.category,
    note: memo.note,
    status: memo.status,
    followUpDate: followUp?.date ?? null,
    followUpTime: followUp?.time ?? null,
    followUpLabel: memo.followUpLabel,
  };
  return `You update an insurance agent's field memo from their spoken or typed instruction.
The agent's current local date and time: ${localClock(input.now, input.utcOffsetMinutes)}.

Current memo (JSON, dates in the agent's local time):
${JSON.stringify(current, null, 1)}

Instruction from the agent: """${input.instruction}"""

Return the COMPLETE updated memo. Change only what the instruction implies and keep every other field exactly as it is.
- note: a concise one to three sentence summary written to the agent in second person ("You ..."), never "The agent ..." (rewrite any earlier "The agent" wording as "You"). Keep the earlier facts, add the new information and any reason given (for example why a meeting was postponed), and never repeat yourself. If the memo is empty, write it from the instruction.
- status: POSTPONED when the meeting or follow-up is postponed/rescheduled/delayed; COMPLETED when the matter is finished or the policy sold/issued; otherwise keep the current status.
- followUpDate (YYYY-MM-DD) and followUpTime (HH:MM, 24h): always return the follow-up that should apply, even when unchanged. When the instruction postpones to a relative time ("next week", "after three days", "Friday"): if the memo already has a follow-up date in the future, move it from that date (for "next week" that is the same weekday and time, seven days later); otherwise count from today ("next week" = next Monday). Keep the existing time unless a new time is said. null only if there is no follow-up.
- followUpLabel: 2-5 words; update only if the purpose of the follow-up changed.
- clientName, phone, coverage, category: change only if the instruction says so.
Do not invent facts that were not said.`;
}

const reviseJsonSchema = {
  type: "OBJECT",
  properties: {
    clientName: { type: "STRING" },
    phone: { type: "STRING" },
    coverage: { type: "STRING" },
    category: { type: "STRING", enum: ["LIFE", "HEALTH", "MOTOR", "COMMERCIAL"] },
    note: { type: "STRING" },
    status: { type: "STRING", enum: ["IN_PROGRESS", "COMPLETED", "POSTPONED"] },
    followUpDate: { type: "STRING", nullable: true },
    followUpTime: { type: "STRING", nullable: true },
    followUpLabel: { type: "STRING" },
  },
  required: ["clientName", "category", "note", "status"],
};

/** Without AI the memo is left as it is and the instruction is added to the note, so nothing is lost. */
function basicRevise(input: ReviseMemoBody): RevisedMemo {
  const { memo, instruction } = input;
  return {
    ...memo,
    note: memo.note ? `${memo.note.trimEnd()} ${instruction}` : instruction,
    source: "basic",
  };
}

/**
 * Applies a spoken/typed instruction ("meeting postponed to next week, client has urgent work")
 * to the memo in the edit form and returns the whole updated memo. Nothing is saved.
 */
export async function reviseMemo(
  env: Env,
  agentId: string,
  input: ReviseMemoBody,
  log: { warn: (obj: object, msg: string) => void },
): Promise<RevisedMemo> {
  if (!env.GEMINI_API_KEY || !withinLimit(agentId)) return basicRevise(input);
  try {
    const ai = reviseAiSchema.parse(
      await geminiJson(env, buildRevisePrompt(input), reviseJsonSchema),
    );
    return {
      clientName: ai.clientName.trim() || input.memo.clientName,
      phone: ai.phone.trim(),
      coverage: ai.coverage.trim(),
      category: ai.category,
      note: toSecondPerson(ai.note.trim()) || input.memo.note,
      status: ai.status,
      followUpAt: localToIso(ai.followUpDate, ai.followUpTime, input.utcOffsetMinutes),
      followUpLabel: ai.followUpLabel.trim(),
      source: "ai",
    };
  } catch (error) {
    log.warn(
      { err: error instanceof Error ? error.message : "unknown" },
      "Gemini memo revise failed",
    );
    return basicRevise(input);
  }
}
