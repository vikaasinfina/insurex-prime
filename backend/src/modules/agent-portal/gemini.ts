import type { Env } from "../../config/env.js";

/** Gemini "OpenAPI subset" schema, e.g. { type: "OBJECT", properties: { … } }. */
type GeminiSchema = Record<string, unknown>;

/** Models that recently ran out of quota or were unavailable, with when to try them again. */
const cooldown = new Map<string, number>();
const COOLDOWN_MS = 15 * 60_000;

/**
 * Asks Gemini for JSON matching `schema` and returns it parsed (callers validate the shape).
 * `GEMINI_MODEL` may list several models, comma-separated: when one is out of quota (the free tier
 * allows only 20 requests per model per day), overloaded or retired, the next one is tried.
 * Throws when every model fails — missing key, HTTP error (with Google's message), timeout, bad
 * JSON — so callers can fall back.
 */
export async function geminiJson(
  env: Env,
  prompt: string,
  schema: GeminiSchema,
  options: { temperature?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const models = env.GEMINI_MODEL.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const now = Date.now();
  // Skip models that are cooling down, unless that would leave nothing to try.
  const ready = models.filter((model) => (cooldown.get(model) ?? 0) <= now);
  const order = ready.length > 0 ? ready : models;

  const send = (model: string) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.4,
            // Short structured answers need no reasoning pass; turning it off cuts ~10s to ~4s.
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      },
    );

  let lastError = new Error("No Gemini model configured");
  for (const model of order) {
    let response: Response;
    try {
      response = await send(model);
      // 503 is a demand spike that usually clears within a second or two: one retry.
      if (response.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        response = await send(model);
      }
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      lastError = new Error(
        `Gemini (${model}) request failed: ${error instanceof Error ? error.message : "unknown"}${cause ? ` (${cause})` : ""}`,
      );
      continue;
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      lastError = new Error(
        `Gemini (${model}) responded ${response.status}: ${detail?.error?.message ?? "no details"}`.slice(
          0,
          300,
        ),
      );
      // Out of quota, overloaded or retired: try the next model. Anything else (bad key, bad request) will not improve.
      if ([404, 429, 503].includes(response.status)) {
        cooldown.set(model, Date.now() + COOLDOWN_MS);
        continue;
      }
      throw lastError;
    }
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = new Error(`Gemini (${model}) returned no content`);
      continue;
    }
    return JSON.parse(text);
  }
  throw lastError;
}
