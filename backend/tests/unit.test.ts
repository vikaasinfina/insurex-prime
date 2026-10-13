import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv, normalizePrivateKey } from "../src/config/env.js";
import {
  LoginAttemptLimiter,
  parseAgentIdentifier,
} from "../src/modules/auth/agent-login.service.js";
import { toSecondPerson } from "../src/modules/field-notes/memo-parser.service.js";
import { hashSessionToken, readSessionCookie } from "../src/modules/auth/agent-session.js";
import {
  generateDefaultAgentPassword,
  generateTemporaryPassword,
  hashPassword,
  newPasswordSchema,
  verifyPassword,
} from "../src/modules/auth/password.js";
import { computeExpiryDate } from "../src/modules/sold-policies/sold-policies.service.js";
import { toDateFilter } from "../src/utils/pagination.js";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  FIREBASE_PROJECT_ID: "demo-project",
  FRONTEND_URL: "http://localhost:8080, https://insurex-prime.vercel.app",
};

describe("env", () => {
  it("parses origins and defaults", () => {
    const env = loadEnv(baseEnv);
    expect(env.FRONTEND_URL).toEqual(["http://localhost:8080", "https://insurex-prime.vercel.app"]);
    expect(env.PORT).toBe(4000);
    expect(env.FIREBASE_CLIENT_EMAIL).toBeUndefined();
  });

  it("rejects a wildcard origin in production", () => {
    expect(() => loadEnv({ ...baseEnv, NODE_ENV: "production", FRONTEND_URL: "*" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects origins with paths", () => {
    expect(() => loadEnv({ ...baseEnv, FRONTEND_URL: "https://example.com/app" })).toThrow(
      /FRONTEND_URL/,
    );
  });

  it("requires service-account fields together", () => {
    expect(() => loadEnv({ ...baseEnv, FIREBASE_CLIENT_EMAIL: "svc@example.com" })).toThrow(
      /FIREBASE_PRIVATE_KEY/,
    );
  });

  it("never includes secret values in error messages", () => {
    try {
      loadEnv({ ...baseEnv, DATABASE_URL: "mysql://secret-password@db" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("secret-password");
    }
  });

  it("normalizes escaped and quoted private keys", () => {
    expect(normalizePrivateKey('"-----BEGIN KEY-----\\nabc\\n-----END KEY-----\\n"')).toBe(
      "-----BEGIN KEY-----\nabc\n-----END KEY-----\n",
    );
  });
});

describe("date helpers", () => {
  it("treats a date-only `to` as inclusive", () => {
    const filter = toDateFilter({ from: "2026-01-01", to: "2026-01-31" });
    expect(filter?.gte?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filter?.lt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("rejects inverted ranges", () => {
    expect(() => toDateFilter({ from: "2026-02-01", to: "2026-01-01" })).toThrow();
  });

  it("computes the last day of cover", () => {
    const expiry = computeExpiryDate(new Date("2026-01-01T00:00:00Z"), 12);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});

describe("agent password sign-in", () => {
  it("hashes passwords with a per-password salt and verifies them", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(hash).not.toContain("Correct-Horse-9");
    expect(await hashPassword("Correct-Horse-9")).not.toBe(hash);
    expect(await verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-9", hash)).toBe(false);
    expect(await verifyPassword("Correct-Horse-9", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$999999999$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("generates readable temporary passwords that meet the password policy", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      expect(password).not.toMatch(/[01OIl]/);
      expect(newPasswordSchema.safeParse(password).success).toBe(true);
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });

  it("builds the default agent password from first name and phone", () => {
    expect(generateDefaultAgentPassword("Rajesh Verma", "9876543210")).toBe("Rajes@9876543210");
    expect(generateDefaultAgentPassword("  Raj Kumar ", "98765 43210")).toBe("Raj@9876543210");
    expect(generateDefaultAgentPassword("Dr.Anil", "+91-98765-43210")).toBe("DrAni@919876543210");
    expect(
      newPasswordSchema.safeParse(generateDefaultAgentPassword("Rajesh Verma", "9876543210"))
        .success,
    ).toBe(true);
  });

  it("enforces the new-password policy", () => {
    expect(newPasswordSchema.safeParse("short1").success).toBe(false);
    expect(newPasswordSchema.safeParse("allletters").success).toBe(false);
    expect(newPasswordSchema.safeParse("12345678").success).toBe(false);
    expect(newPasswordSchema.safeParse(" Spaced123").success).toBe(false);
    expect(newPasswordSchema.safeParse("Good-Pass-42").success).toBe(true);
  });

  it("accepts an agent code or an email as the identifier", () => {
    expect(parseAgentIdentifier(" agt-demo1 ")).toEqual({ kind: "agentCode", value: "AGT-DEMO1" });
    expect(parseAgentIdentifier("Demo.Agent1@Example.com")).toEqual({
      kind: "email",
      value: "demo.agent1@example.com",
    });
  });

  it("reads only well-formed session cookies and never stores raw tokens", () => {
    const request = (cookie?: string) =>
      ({ headers: cookie ? { cookie } : {} }) as unknown as FastifyRequest;
    const token = "A".repeat(43);
    expect(readSessionCookie(request(`theme=dark; insurex_agent_session=${token}`))).toBe(token);
    expect(readSessionCookie(request("insurex_agent_session=<script>"))).toBeNull();
    expect(readSessionCookie(request("other=1"))).toBeNull();
    expect(readSessionCookie(request())).toBeNull();
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("locks an identifier after repeated failures", () => {
    const limiter = new LoginAttemptLimiter(2, 60_000);
    limiter.recordFailure("k");
    expect(() => limiter.assertAllowed("k")).not.toThrow();
    limiter.recordFailure("k");
    expect(() => limiter.assertAllowed("k")).toThrow(/Too many failed attempts/);
    limiter.reset("k");
    expect(() => limiter.assertAllowed("k")).not.toThrow();
  });

  it("configures secure cookies for production and cross-site use", () => {
    expect(loadEnv(baseEnv)).toMatchObject({
      AGENT_COOKIE_SECURE: false,
      AGENT_COOKIE_SAMESITE: "lax",
      AGENT_SESSION_TTL_HOURS: 720,
    });
    expect(loadEnv({ ...baseEnv, NODE_ENV: "production" }).AGENT_COOKIE_SECURE).toBe(true);
    expect(() => loadEnv({ ...baseEnv, AGENT_COOKIE_SAMESITE: "none" })).toThrow(
      /AGENT_COOKIE_SECURE/,
    );
    expect(
      loadEnv({ ...baseEnv, AGENT_COOKIE_SAMESITE: "none", AGENT_COOKIE_SECURE: "true" })
        .AGENT_COOKIE_SAMESITE,
    ).toBe("none");
  });
});

describe("toSecondPerson", () => {
  it("rewrites third-person agent wording as 'You'", () => {
    expect(
      toSecondPerson("The agent had a long discussion with Campas Sir from 8:00 PM to 10:00 PM."),
    ).toBe("You had a long discussion with Campas Sir from 8:00 PM to 10:00 PM.");
    expect(toSecondPerson("The agent was told to call back. The agent's visit is on Monday.")).toBe(
      "You were told to call back. Your visit is on Monday.",
    );
    expect(toSecondPerson("Client said the agent isn't needed.")).toBe(
      "Client said you aren't needed.",
    );
    expect(toSecondPerson("You spoke to Kamal.")).toBe("You spoke to Kamal.");
  });
});
