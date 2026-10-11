import { z } from "zod";

// Treat `KEY=` (empty) in .env files as "not set".
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const csvList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgresql:// connection string"),
    // Max PostgreSQL connections per process. Leave unset for the driver default (10);
    // set to 1 for single-connection local databases such as PGlite.
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: optionalString,
    FIREBASE_PRIVATE_KEY: optionalString,
    // Comma-separated list of allowed browser origins.
    FRONTEND_URL: csvList,
    // Comma-separated emails that are provisioned as SUPER_ADMIN on first sign-in.
    SUPER_ADMIN_EMAILS: csvList.transform((emails) => emails.map((email) => email.toLowerCase())),
    // Password sign-in for the Super Admin: any ID in ADMIN_LOGIN_IDS (an email and/or phone,
    // comma-separated) plus ADMIN_PASSWORD. Keep the password in the environment, never in code.
    // The first ID containing "@" is the Super Admin account's email.
    ADMIN_LOGIN_IDS: csvList.transform((ids) => ids.map((id) => id.toLowerCase())),
    ADMIN_PASSWORD: optionalString,
    // Set to true only when running behind a trusted reverse proxy / load balancer.
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DOCS_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    // Agent password sign-in sessions (HttpOnly cookie).
    AGENT_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(720),
    // "lax" works when the frontend and API share a site (localhost, or app./api. subdomains).
    // Use "none" only when they are on different sites; it requires Secure cookies (HTTPS).
    AGENT_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    // Defaults to true in production.
    AGENT_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    // Optional cookie Domain, e.g. ".example.com" to share it across subdomains.
    AGENT_COOKIE_DOMAIN: optionalString,
    // Transactional email via Resend's HTTPS API (SMTP ports are blocked on most PaaS hosts).
    // Without RESEND_API_KEY and RESEND_FROM_EMAIL, forgot-password is reported as unavailable.
    RESEND_API_KEY: optionalString,
    RESEND_FROM_EMAIL: optionalString,
    RESEND_FROM_NAME: z.string().trim().min(1).default("InsuroX Prime"),
    // Signs password-reset links (HMAC). At least 32 characters; unset disables forgot-password.
    PASSWORD_RESET_SECRET: optionalString.refine(
      (value) => value === undefined || value.length >= 32,
      "must be at least 32 characters",
    ),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.FIREBASE_CLIENT_EMAIL) !== Boolean(env.FIREBASE_PRIVATE_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["FIREBASE_PRIVATE_KEY"],
        message: "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together",
      });
    }
    for (const origin of env.FRONTEND_URL) {
      if (origin === "*") {
        if (env.NODE_ENV === "production") {
          ctx.addIssue({
            code: "custom",
            path: ["FRONTEND_URL"],
            message: "wildcard origin is not allowed in production",
          });
        }
        continue;
      }
      try {
        const url = new URL(origin);
        if (url.origin !== origin) throw new Error("not an origin");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["FRONTEND_URL"],
          message: `"${origin}" must be an origin such as https://example.com (no path or trailing slash)`,
        });
      }
    }
    const secureCookie = env.AGENT_COOKIE_SECURE
      ? env.AGENT_COOKIE_SECURE === "true"
      : env.NODE_ENV === "production";
    if (env.AGENT_COOKIE_SAMESITE === "none" && !secureCookie) {
      ctx.addIssue({
        code: "custom",
        path: ["AGENT_COOKIE_SECURE"],
        message: "must be true when AGENT_COOKIE_SAMESITE=none",
      });
    }
    if (env.NODE_ENV === "production" && env.FRONTEND_URL.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "at least one allowed origin is required in production",
      });
    }
  })
  .transform((env) => ({
    ...env,
    FIREBASE_PRIVATE_KEY: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    AGENT_COOKIE_SECURE: env.AGENT_COOKIE_SECURE
      ? env.AGENT_COOKIE_SECURE === "true"
      : env.NODE_ENV === "production",
  }));

export type Env = z.infer<typeof envSchema>;

/**
 * Private keys pasted into env dashboards usually arrive either quoted or with
 * literal "\n" sequences instead of newlines. Accept both forms.
 */
export function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  let normalized = key.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\\n/g, "\n");
}

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

/** Parses configuration. Error messages name variables only — never their values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return result.data;
}
