import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import type { Database } from "../src/config/database.js";
import { computeExpiryDate } from "../src/modules/sold-policies/sold-policies.service.js";
import {
  bearer,
  createTestApp,
  hasTestDatabase,
  resetDatabase,
  seedTenant,
  SUPER_ADMIN_EMAIL,
  TENANT_ADMIN_EMAIL,
  TEST_DATABASE_URL,
  tokenFor,
} from "./helpers.js";

/** The tenant's single admin (pre-provisioned); the platform Super Admin is SUPER. */
const ADMIN = bearer(tokenFor("uid-admin", TENANT_ADMIN_EMAIL));
const SUPER = bearer(tokenFor("uid-super", SUPER_ADMIN_EMAIL));
const AGENT_A_EMAIL = "agent.a@test.example.com";
const AGENT_B_EMAIL = "agent.b@test.example.com";
const AGENT_A = bearer(tokenFor("uid-agent-a", AGENT_A_EMAIL));
const AGENT_B = bearer(tokenFor("uid-agent-b", AGENT_B_EMAIL));
const FRONTEND = { origin: "http://localhost:8080" };
const NEW_PASSWORD = "Fresh-Start-2026";
const today = () => new Date().toISOString().slice(0, 10);
const shiftDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** The session cookie from a Set-Cookie header, ready to send back. */
function sessionCookieFrom(setCookie: string | string[] | undefined) {
  const header = [setCookie ?? []]
    .flat()
    .find((value) => value.startsWith("insurex_agent_session="));
  if (!header) throw new Error("no session cookie set");
  return { cookie: header.split(";")[0]! };
}

const healthPolicy = {
  policyCode: "TST-HLT-1",
  policyName: "Test Health",
  insuranceType: "HEALTH",
  coverageAmount: 500000,
  premium: 10000,
  durationMonths: 12,
  benefits: ["Cashless"],
  categoryDetails: {
    kind: "HEALTH",
    planType: "INDIVIDUAL",
    sumInsured: 500000,
    hospitalizationCoverage: "Private room",
    waitingPeriod: "30 days",
    ageEligibility: "18-60",
  },
};

describe.skipIf(!hasTestDatabase)("InsuroX API (PostgreSQL integration)", () => {
  let app: App;
  let db: Database;

  // Shared fixtures created in beforeEach.
  let tenantId: string;
  let agentAId: string;
  let agentBId: string;
  let agentACode: string;
  let agentBCode: string;
  let agentATempPassword: string;
  let agentBTempPassword: string;
  let activePolicyId: string;
  let inactivePolicyId: string;

  const call = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    headers: Record<string, string> = {},
    payload?: unknown,
  ) => {
    const response = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: response.statusCode, body: response.json(), headers: response.headers };
  };

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    ({
      tenant: { id: tenantId },
    } = await seedTenant(db));

    const agentA = await call("POST", "/agents", ADMIN, {
      fullName: "Agent A",
      email: AGENT_A_EMAIL,
      phone: "+91 90000 00001",
    });
    expect(agentA.status).toBe(201);
    agentAId = agentA.body.data.id;
    agentACode = agentA.body.data.agentCode;
    agentATempPassword = agentA.body.data.temporaryPassword;

    const agentB = await call("POST", "/agents", ADMIN, {
      fullName: "Agent B",
      email: AGENT_B_EMAIL,
      phone: "+91 90000 00002",
    });
    agentBId = agentB.body.data.id;
    agentBCode = agentB.body.data.agentCode;
    agentBTempPassword = agentB.body.data.temporaryPassword;

    const active = await call("POST", "/policies", ADMIN, healthPolicy);
    expect(active.status).toBe(201);
    activePolicyId = active.body.data.id;

    const inactive = await call("POST", "/policies", ADMIN, {
      ...healthPolicy,
      policyCode: "TST-MTR-OFF",
      policyName: "Retired Motor",
      insuranceType: "MOTOR",
      premium: 5000,
      status: "INACTIVE",
      categoryDetails: {
        kind: "MOTOR",
        vehicleType: "PRIVATE_CAR",
        coverageType: "COMPREHENSIVE",
        ownDamage: "IDV",
        thirdPartyCoverage: "Unlimited",
        vehicleEligibility: "Up to 10 years",
      },
    });
    inactivePolicyId = inactive.body.data.id;
  });

  // ─── Health & errors ────────────────────────────────────────────────────────
  it("reports health with the database up", async () => {
    const { status, body, headers } = await call("GET", "/health");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: "ok", database: "up" });
    expect(headers["x-request-id"]).toBeTruthy();
  });

  it("accepts collection routes with or without a trailing slash", async () => {
    expect((await call("GET", "/policies", ADMIN)).status).toBe(200);
    expect((await call("GET", "/policies/", ADMIN)).status).toBe(200);
  });

  it("serves the OpenAPI document", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    expect(response.statusCode).toBe(200);
    const doc = response.json();
    expect(doc.paths["/api/v1/sold-policies"]).toBeDefined();
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("returns the error envelope with a request id for validation errors", async () => {
    const { status, body } = await call("POST", "/policies", ADMIN, { policyName: "x" });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.requestId).toBeTruthy();
  });

  // ─── Authentication ─────────────────────────────────────────────────────────
  it("requires a bearer token", async () => {
    expect((await call("GET", "/auth/me")).status).toBe(401);
    expect((await call("GET", "/auth/me", bearer("garbage"))).body.error.code).toBe(
      "INVALID_TOKEN",
    );
    expect((await call("GET", "/auth/me", bearer("expired"))).body.error.code).toBe(
      "TOKEN_EXPIRED",
    );
  });

  it("rejects unverified emails and unknown accounts", async () => {
    const unverified = await call(
      "GET",
      "/auth/me",
      bearer(`valid|uid-x|${SUPER_ADMIN_EMAIL}|unverified`),
    );
    expect(unverified.status).toBe(403);

    const stranger = await call(
      "POST",
      "/auth/verify",
      bearer(tokenFor("uid-z", "stranger@example.com")),
    );
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.code).toBe("ACCOUNT_NOT_PROVISIONED");
    expect(await db.user.count({ where: { email: "stranger@example.com" } })).toBe(0);
  });

  it("bootstraps the super admin and links tenant admins and agents by email on first sign-in", async () => {
    const platform = await call("POST", "/auth/verify", SUPER);
    expect(platform.status).toBe(200);
    expect(platform.body.data).toMatchObject({ role: "SUPER_ADMIN", agent: null, tenant: null });

    const admin = await call("POST", "/auth/verify", ADMIN);
    expect(admin.status).toBe(200);
    expect(admin.body.data).toMatchObject({ role: "TENANT_ADMIN", agent: null });
    expect(admin.body.data.tenant).toMatchObject({ id: tenantId, name: "Test Agency" });

    const agent = await call("POST", "/auth/verify", AGENT_A);
    expect(agent.status).toBe(200);
    expect(agent.body.data.role).toBe("AGENT");
    expect(agent.body.data.agent.id).toBe(agentAId);
    const user = await db.user.findUnique({ where: { email: AGENT_A_EMAIL } });
    expect(user?.firebaseUid).toBe("uid-agent-a");

    // A different Firebase account using the same email is refused.
    const impostor = await call("GET", "/auth/me", bearer(tokenFor("uid-other", AGENT_A_EMAIL)));
    expect(impostor.status).toBe(403);
  });

  it("blocks inactive agents", async () => {
    await call("PATCH", `/agents/${agentAId}/status`, ADMIN, { status: "SUSPENDED" });
    const { status, body } = await call("GET", "/auth/me", AGENT_A);
    expect(status).toBe(403);
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
  });

  // ─── Agent password sign-in & sessions ──────────────────────────────────────
  describe("agent password sign-in", () => {
    const login = (identifier: string, password: string, headers: Record<string, string> = {}) =>
      call("POST", "/auth/agent/login", { ...FRONTEND, ...headers }, { identifier, password });

    /** Signs in with the temporary password and replaces it, as a new agent would. */
    async function activeSession(identifier: string, temporaryPassword: string) {
      const first = await login(identifier, temporaryPassword);
      expect(first.status).toBe(200);
      const changed = await call(
        "POST",
        "/auth/agent/change-password",
        { ...sessionCookieFrom(first.headers["set-cookie"]), ...FRONTEND },
        { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD },
      );
      expect(changed.status).toBe(200);
      return { ...sessionCookieFrom(changed.headers["set-cookie"]), ...FRONTEND };
    }

    it("1. signs in by agent code or email and sets a secure HttpOnly session cookie", async () => {
      // Default password: first name (up to 5 letters) + "@" + normalized phone.
      expect(agentATempPassword).toMatch(/^[A-Za-z]{1,5}@\d{10,}$/);
      for (const identifier of [
        agentACode,
        agentACode.toLowerCase(),
        AGENT_A_EMAIL.toUpperCase(),
      ]) {
        const { status, body, headers } = await login(identifier, agentATempPassword);
        expect(status, identifier).toBe(200);
        expect(body.data.user).toMatchObject({
          role: "AGENT",
          mustChangePassword: true,
          agent: { id: agentAId, agentCode: agentACode },
        });
        expect(JSON.stringify(body)).not.toMatch(/passwordHash|scrypt|token/i);
        const setCookie = String(headers["set-cookie"]);
        expect(setCookie).toMatch(/insurex_agent_session=[A-Za-z0-9_-]{43};/);
        expect(setCookie).toMatch(/HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Lax/);
        expect(setCookie).toMatch(/Max-Age=43200/);

        const me = await call("GET", "/auth/me", sessionCookieFrom(headers["set-cookie"]));
        expect(me.status).toBe(200);
        expect(me.body.data.agent.id).toBe(agentAId);
      }
      // Only a hash of the token is stored.
      const sessions = await db.agentSession.findMany();
      expect(sessions).toHaveLength(3);
      expect(sessions.every((session) => /^[a-f0-9]{64}$/.test(session.tokenHash))).toBe(true);
      const user = await db.user.findUniqueOrThrow({ where: { email: AGENT_A_EMAIL } });
      expect(user.lastLoginAt).not.toBeNull();
      expect(user.passwordHash).toMatch(/^scrypt\$/);
    });

    it("2. rejects wrong passwords and unknown accounts with the same 401", async () => {
      const wrong = await login(agentACode, "Wrong-Password-1");
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(wrong.headers["set-cookie"]).toBeUndefined();

      const unknown = await login("AGT-NOPE", agentATempPassword);
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.message).toBe(wrong.body.error.message);
      expect((await login("nobody@example.com", agentATempPassword)).status).toBe(401);
      // Super Admins cannot use password sign-in.
      await call("POST", "/auth/verify", ADMIN);
      expect((await login(SUPER_ADMIN_EMAIL, agentATempPassword)).status).toBe(401);
      // Another agent's password does not work.
      expect((await login(agentACode, agentBTempPassword)).status).toBe(401);
      expect((await login("", "x")).status).toBe(400);
    });

    it("3. blocks suspended and inactive agents and ends their sessions", async () => {
      const cookie = await activeSession(agentACode, agentATempPassword);
      expect((await call("GET", "/customers", cookie)).status).toBe(200);

      await call("PATCH", `/agents/${agentAId}/status`, ADMIN, { status: "SUSPENDED" });
      const blocked = await login(agentACode, NEW_PASSWORD);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("ACCOUNT_DISABLED");
      expect(blocked.headers["set-cookie"]).toBeUndefined();
      // A wrong password still gets the generic 401, so status is not leaked.
      expect((await login(agentACode, "Wrong-Password-1")).status).toBe(401);
      // The existing session was revoked.
      expect((await call("GET", "/customers", cookie)).status).toBe(401);

      await call("PATCH", `/agents/${agentAId}/status`, ADMIN, { status: "INACTIVE" });
      expect((await login(agentACode, NEW_PASSWORD)).status).toBe(403);
      await call("PATCH", `/agents/${agentAId}/status`, ADMIN, { status: "ACTIVE" });
      expect((await login(agentACode, NEW_PASSWORD)).status).toBe(200);
    });

    it("4. forces a password change before anything else", async () => {
      const first = await login(agentACode, agentATempPassword);
      const temp = { ...sessionCookieFrom(first.headers["set-cookie"]), ...FRONTEND };

      for (const [method, url] of [
        ["GET", "/customers"],
        ["GET", "/agent/dashboard"],
        ["GET", "/policies"],
        ["POST", "/customers"],
      ] as const) {
        const blocked = await call(method, url, temp, method === "POST" ? {} : undefined);
        expect(blocked.status, url).toBe(403);
        expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
      }
      expect((await call("GET", "/auth/me", temp)).body.data.mustChangePassword).toBe(true);

      const change = (currentPassword: string, newPassword: string) =>
        call("POST", "/auth/agent/change-password", temp, { currentPassword, newPassword });
      expect((await change("Wrong-Password-1", NEW_PASSWORD)).status).toBe(401);
      expect((await change(agentATempPassword, "short")).status).toBe(400);
      expect((await change(agentATempPassword, "nodigitshere")).status).toBe(400);
      expect((await change(agentATempPassword, agentATempPassword)).status).toBe(400);

      const changed = await change(agentATempPassword, NEW_PASSWORD);
      expect(changed.status).toBe(200);
      expect(changed.body.data.mustChangePassword).toBe(false);
      const fresh = { ...sessionCookieFrom(changed.headers["set-cookie"]), ...FRONTEND };

      // The session that used the temporary password is rotated out.
      expect((await call("GET", "/auth/me", temp)).status).toBe(401);
      expect((await call("GET", "/customers", fresh)).status).toBe(200);
      expect((await login(agentACode, agentATempPassword)).status).toBe(401);
      expect((await login(AGENT_A_EMAIL, NEW_PASSWORD)).status).toBe(200);

      // A Super Admin reset issues a new temporary password and signs the agent out.
      const reset = await call("POST", `/agents/${agentAId}/reset-password`, ADMIN);
      expect(reset.status).toBe(200);
      expect((await call("GET", "/customers", fresh)).status).toBe(401);
      expect((await login(agentACode, NEW_PASSWORD)).status).toBe(401);
      const again = await login(agentACode, reset.body.data.temporaryPassword);
      expect(again.body.data.user.mustChangePassword).toBe(true);
      expect((await call("POST", `/agents/${agentBId}/reset-password`, AGENT_A)).status).toBe(403);
    });

    it("5. returns dashboard figures for the signed-in agent only", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const b = await activeSession(agentBCode, agentBTempPassword);

      const empty = await call("GET", "/agent/dashboard", a);
      expect(empty.status).toBe(200);
      expect(empty.body.data.summary).toEqual({
        customers: 0,
        policiesSold: 0,
        activePolicies: 0,
        totalPremium: 0,
        premiumCollected: 0,
        pendingPayments: 0,
        expiringSoon: 0,
        expiredPolicies: 0,
      });

      const mine = await call("POST", "/customers", a, { fullName: "Mine", phone: "9111111111" });
      const theirs = await call("POST", "/customers", b, {
        fullName: "Theirs",
        phone: "9222222222",
      });
      // Paid at sale, issued today.
      await call("POST", "/sold-policies", a, {
        policyId: activePolicyId,
        customerId: mine.body.data.id,
        paymentMethod: "UPI",
      });
      // Unpaid, issued 30 days ago → a 12-month policy is not expiring yet.
      await call("POST", "/sold-policies", a, {
        policyId: activePolicyId,
        customerId: mine.body.data.id,
        issueDate: shiftDays(-30),
      });
      // An ACTIVE policy that expires in about 10 days (admin backdates).
      await call("POST", "/sold-policies", ADMIN, {
        policyId: activePolicyId,
        customerId: mine.body.data.id,
        issueDate: shiftDays(-355),
        paymentMethod: "CASH",
      });
      await call("POST", "/sold-policies", b, {
        policyId: activePolicyId,
        customerId: theirs.body.data.id,
        paymentMethod: "CARD",
      });

      // Query parameters cannot select another agent.
      const dashboard = await call("GET", `/agent/dashboard?range=7D&agentId=${agentBId}`, a);
      expect(dashboard.status).toBe(200);
      const data = dashboard.body.data;
      expect(data.summary).toEqual({
        customers: 1,
        policiesSold: 3,
        // Every sale is in force straight away; only payment differs.
        activePolicies: 3,
        totalPremium: 30000,
        premiumCollected: 20000,
        pendingPayments: 1,
        expiringSoon: 1,
        expiredPolicies: 0,
      });
      expect(data.salesTrend.interval).toBe("day");
      expect(data.salesTrend.points).toHaveLength(7);
      expect(data.salesTrend.points.at(-1)).toMatchObject({ period: today(), policiesSold: 1 });
      expect(data.policyDistribution[0]).toMatchObject({
        insuranceType: "HEALTH",
        policiesSold: 3,
      });
      expect(data.premiumTrend).toHaveLength(12);
      expect(data.premiumTrend.at(-1).collected).toBeGreaterThanOrEqual(10000);
      expect(data.recentSales).toHaveLength(3);
      expect(
        data.recentSales.every((sale: { agent: { id: string } }) => sale.agent.id === agentAId),
      ).toBe(true);
      expect(data.recentCustomers).toEqual([
        expect.objectContaining({ fullName: "Mine", policiesCount: 3 }),
      ]);
      expect(data.expiringPolicies).toHaveLength(1);
      const expiry = computeExpiryDate(new Date(`${shiftDays(-355)}T00:00:00Z`), 12);
      expect(data.expiringPolicies[0]).toMatchObject({
        policyStatus: "ACTIVE",
        expiryDate: expiry.toISOString().slice(0, 10),
        daysRemaining: Math.round(
          (expiry.getTime() - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000,
        ),
      });

      for (const range of ["30D", "6M", "1Y"]) {
        const ranged = await call("GET", `/agent/dashboard?range=${range}`, a);
        expect(ranged.status, range).toBe(200);
      }
      expect((await call("GET", "/agent/dashboard?range=5Y", a)).status).toBe(400);
      expect((await call("GET", "/agent/dashboard", b)).body.data.summary.policiesSold).toBe(1);
      // Super Admins use the platform dashboard instead.
      expect((await call("GET", "/agent/dashboard", ADMIN)).status).toBe(403);
      expect((await call("GET", "/agent/dashboard")).status).toBe(401);
    });

    it("6–8. lets an agent create and edit only their own customers", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const b = await activeSession(agentBCode, agentBTempPassword);

      const created = await call("POST", "/customers", a, {
        fullName: "Asha Rao",
        phone: "+91 91234 56789",
        email: "asha@example.com",
        assignedAgentId: agentBId,
      });
      expect(created.status).toBe(201);
      expect(created.body.data.assignedAgent.id).toBe(agentAId);
      const customerId = created.body.data.id;

      const edited = await call("PATCH", `/customers/${customerId}`, a, {
        city: "Pune",
        assignedAgentId: agentBId,
      });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ city: "Pune", assignedAgent: { id: agentAId } });

      // Agent B can neither see, edit nor delete it.
      expect((await call("GET", `/customers/${customerId}`, b)).status).toBe(404);
      expect(
        (await call("PATCH", `/customers/${customerId}`, b, { fullName: "Hijacked" })).status,
      ).toBe(404);
      expect((await call("DELETE", `/customers/${customerId}`, b)).status).toBe(404);
      expect((await call("GET", "/customers?search=asha", b)).body.meta.total).toBe(0);
      expect((await call("GET", `/customers?agentId=${agentAId}`, b)).body.meta.total).toBe(0);

      expect((await call("GET", "/customers?search=asha", a)).body.meta.total).toBe(1);
      expect((await call("DELETE", `/customers/${customerId}`, a)).status).toBe(200);
    });

    it("9–10. shows ACTIVE policies read-only", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const list = await call("GET", "/policies?status=INACTIVE", a);
      expect(list.body.data.map((policy: { id: string }) => policy.id)).toEqual([activePolicyId]);
      expect((await call("GET", `/policies/${activePolicyId}`, a)).status).toBe(200);
      expect((await call("GET", `/policies/${inactivePolicyId}`, a)).status).toBe(404);

      expect((await call("POST", "/policies", a, healthPolicy)).status).toBe(403);
      expect((await call("PATCH", `/policies/${activePolicyId}`, a, { premium: 1 })).status).toBe(
        403,
      );
      expect(
        (await call("PATCH", `/policies/${activePolicyId}/status`, a, { status: "INACTIVE" }))
          .status,
      ).toBe(403);
      expect((await call("DELETE", `/policies/${activePolicyId}`, a)).status).toBe(403);
      const policy = await db.policy.findUniqueOrThrow({ where: { id: activePolicyId } });
      expect(policy).toMatchObject({ status: "ACTIVE" });
      expect(policy.premium!.toNumber()).toBe(10000);
    });

    it("11–12. sells to own customers with server-side premium, expiry, number and receipt", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const b = await activeSession(agentBCode, agentBTempPassword);
      const mine = await call("POST", "/customers", a, { fullName: "Mine", phone: "9333333333" });
      const theirs = await call("POST", "/customers", b, {
        fullName: "Theirs",
        phone: "9444444444",
      });
      const issueDate = shiftDays(-3);
      const expectedExpiry = computeExpiryDate(new Date(`${issueDate}T00:00:00Z`), 12)
        .toISOString()
        .slice(0, 10);

      const quote = await call(
        "GET",
        `/sold-policies/quote?policyId=${activePolicyId}&customerId=${mine.body.data.id}&issueDate=${issueDate}`,
        a,
      );
      expect(quote.status).toBe(200);
      expect(quote.body.data).toMatchObject({
        premium: 10000,
        issueDate,
        expiryDate: expectedExpiry,
        policy: { durationMonths: 12, coverageAmount: 500000 },
      });

      const sale = await call("POST", "/sold-policies", a, {
        policyId: activePolicyId,
        customerId: mine.body.data.id,
        issueDate,
        paymentMethod: "UPI",
        agentId: agentBId,
      });
      expect(sale.status).toBe(201);
      expect(sale.body.data).toMatchObject({
        premium: 10000,
        amountPaid: 10000,
        issueDate,
        expiryDate: expectedExpiry,
        paymentStatus: "PAID",
        policyStatus: "ACTIVE",
        agent: { id: agentAId },
      });
      expect(sale.body.data.policyNumber).toMatch(/^POL-\d{4}-[A-Z2-9]{8}$/);
      expect(sale.body.data.receipts).toHaveLength(1);
      expect(sale.body.data.receipts[0]).toMatchObject({
        amount: 10000,
        paymentMethod: "UPI",
        paymentStatus: "PAID",
      });
      expect(sale.body.data.receipts[0].receiptNumber).toMatch(/^RCP-\d{4}-[A-Z2-9]{8}$/);

      // Not trusted from the client: premium, another agent's customer, inactive policy, dates.
      const sell = (body: Record<string, unknown>) =>
        call("POST", "/sold-policies", a, {
          policyId: activePolicyId,
          customerId: mine.body.data.id,
          ...body,
        });
      expect((await sell({ premium: 1 })).status).toBe(403);
      // Offline sales take the default payment state from settings and create no receipt;
      // a client-supplied paymentStatus is ignored.
      const logged = await sell({ paymentStatus: "PAID" });
      expect(logged.status).toBe(201);
      expect(logged.body.data).toMatchObject({ paymentStatus: "PENDING", policyStatus: "ACTIVE" });
      expect(logged.body.data.receipts).toHaveLength(0);
      expect((await sell({ customerId: theirs.body.data.id })).status).toBe(404);
      expect(
        (
          await call(
            "GET",
            `/sold-policies/quote?policyId=${activePolicyId}&customerId=${theirs.body.data.id}`,
            a,
          )
        ).status,
      ).toBe(404);
      expect((await sell({ policyId: inactivePolicyId })).status).toBe(404);
      expect((await sell({ issueDate: shiftDays(-45) })).status).toBe(400);
      expect((await sell({ issueDate: shiftDays(120) })).status).toBe(400);
      expect((await sell({ issueDate: "2026-02-30" })).status).toBe(400);
      expect(
        (await sell({ policyStatus: "ACTIVE", paymentStatus: "PAID" })).body.data,
      ).toMatchObject({ policyStatus: "ACTIVE", paymentStatus: "PENDING" });
      await call("PATCH", `/customers/${mine.body.data.id}`, a, { status: "INACTIVE" });
      expect((await sell({})).status).toBe(409);
      expect(await db.soldPolicy.count({ where: { customerId: theirs.body.data.id } })).toBe(0);
    });

    it("13–14. lists only the agent's own sold policies and receipts", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const b = await activeSession(agentBCode, agentBTempPassword);
      const mine = await call("POST", "/customers", a, { fullName: "Mine", phone: "9555555555" });
      const theirs = await call("POST", "/customers", b, {
        fullName: "Theirs",
        phone: "9666666666",
      });
      const sale = await call("POST", "/sold-policies", a, {
        policyId: activePolicyId,
        customerId: mine.body.data.id,
        paymentMethod: "CASH",
      });
      const other = await call("POST", "/sold-policies", b, {
        policyId: activePolicyId,
        customerId: theirs.body.data.id,
        paymentMethod: "CARD",
      });

      const sold = await call("GET", `/sold-policies?agentId=${agentBId}`, a);
      expect(sold.body.meta.total).toBe(1);
      expect(sold.body.data[0].id).toBe(sale.body.data.id);
      expect((await call("GET", `/sold-policies/${other.body.data.id}`, a)).status).toBe(404);
      expect((await call("GET", "/sold-policies?insuranceType=MOTOR", a)).body.meta.total).toBe(0);
      expect(
        (await call("GET", `/sold-policies?from=${today()}&to=${today()}&policyStatus=ACTIVE`, a))
          .body.meta.total,
      ).toBe(1);

      const receipts = await call("GET", `/receipts?agentId=${agentBId}`, a);
      expect(receipts.body.meta.total).toBe(1);
      expect(receipts.body.data[0].soldPolicy).toMatchObject({
        policyNumber: sale.body.data.policyNumber,
        insuranceType: "HEALTH",
        premium: 10000,
        expiryDate: sale.body.data.expiryDate,
      });
      const otherReceiptId = other.body.data.receipts[0].id;
      expect((await call("GET", `/receipts/${otherReceiptId}`, a)).status).toBe(404);
      expect((await call("GET", `/receipts/${otherReceiptId}`, b)).status).toBe(200);
      expect((await call("GET", "/receipts", ADMIN)).body.meta.total).toBe(2);
    });

    it("15. logout revokes the session server-side", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      expect((await call("GET", "/auth/me", a)).status).toBe(200);

      const out = await call("POST", "/auth/agent/logout", a);
      expect(out.status).toBe(200);
      expect(String(out.headers["set-cookie"])).toMatch(/insurex_agent_session=; .*Max-Age=0/);
      const replay = await call("GET", "/auth/me", a);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe("INVALID_TOKEN");
      // Logging out twice, or without a session, is harmless.
      expect((await call("POST", "/auth/agent/logout", a)).status).toBe(200);
      expect((await call("POST", "/auth/agent/logout", FRONTEND)).status).toBe(200);
    });

    it("16. keeps tenant admin Google sign-in working alongside agent cookies", async () => {
      const admin = await call("POST", "/auth/verify", ADMIN);
      expect(admin.status).toBe(200);
      expect(admin.body.data).toMatchObject({ role: "TENANT_ADMIN", mustChangePassword: false });

      const a = await activeSession(agentACode, agentATempPassword);
      await call("POST", "/customers", a, { fullName: "Mine", phone: "9777777777" });
      // A bearer token takes precedence over any cookie in the same browser.
      const both = await call("GET", "/customers", { ...a, ...ADMIN });
      expect(both.status).toBe(200);
      expect((await call("GET", "/auth/me", { ...a, ...ADMIN })).body.data.role).toBe(
        "TENANT_ADMIN",
      );
      expect((await call("GET", "/agents", ADMIN)).body.meta.total).toBe(2);
      expect((await call("GET", "/agents", a)).status).toBe(403);
      expect((await call("GET", "/dashboard/summary", ADMIN)).body.data.totalCustomers).toBe(1);
    });

    it("rejects cookie-authenticated writes from untrusted origins", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const evil = { cookie: a.cookie, origin: "https://evil.example.com" };
      const blocked = await call("POST", "/customers", evil, {
        fullName: "X",
        phone: "9888888888",
      });
      expect(blocked.status).toBe(403);
      expect(
        (await login(agentACode, NEW_PASSWORD, { origin: "https://evil.example.com" })).status,
      ).toBe(403);
      // Reads are not state-changing and stay available.
      expect((await call("GET", "/customers", evil)).status).toBe(200);
    });

    it("lets agents edit only safe profile fields", async () => {
      const a = await activeSession(agentACode, agentATempPassword);
      const profile = await call("GET", "/agent/profile", a);
      expect(profile.status).toBe(200);
      expect(profile.body.data).toMatchObject({
        id: agentAId,
        agentCode: agentACode,
        email: AGENT_A_EMAIL,
        status: "ACTIVE",
        mustChangePassword: false,
      });
      expect(profile.body.data.lastLoginAt).not.toBeNull();

      const updated = await call("PATCH", "/agent/profile", a, {
        fullName: "Agent A Renamed",
        phone: "+91 90000 99999",
        address: "12 MG Road, Pune",
      });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({
        fullName: "Agent A Renamed",
        address: "12 MG Road, Pune",
      });
      for (const body of [
        { email: "x@example.com" },
        { agentCode: "HACK-1" },
        { status: "ACTIVE" },
      ]) {
        expect((await call("PATCH", "/agent/profile", a, body)).status).toBe(400);
      }
      const agent = await db.agent.findUniqueOrThrow({
        where: { id: agentAId },
        include: { user: true },
      });
      expect(agent.agentCode).toBe(agentACode);
      expect(agent.user.email).toBe(AGENT_A_EMAIL);
      expect((await call("GET", "/agent/profile", ADMIN)).status).toBe(403);
    });

    it("locks out repeated failures", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await login("AGT-LOCK", "Wrong-Password-1")).status).toBe(401);
      }
      const locked = await login("AGT-LOCK", "Wrong-Password-1");
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe("RATE_LIMITED");
    });
  });

  // ─── Role-based access ──────────────────────────────────────────────────────
  it("keeps admin-only endpoints away from agents", async () => {
    expect((await call("GET", "/agents", AGENT_A)).status).toBe(403);
    expect((await call("POST", "/policies", AGENT_A, healthPolicy)).status).toBe(403);
    expect((await call("GET", "/reports/sales", AGENT_A)).status).toBe(403);
    expect((await call("GET", "/audit-logs", AGENT_A)).status).toBe(403);
    expect((await call("GET", `/agents/${agentBId}`, AGENT_A)).status).toBe(404);
    expect((await call("GET", `/agents/${agentAId}`, AGENT_A)).status).toBe(200);
  });

  it("ignores an agent-supplied assignedAgentId and scopes customers", async () => {
    const created = await call("POST", "/customers", AGENT_A, {
      fullName: "Customer One",
      phone: "+91 91111 11111",
      assignedAgentId: agentBId,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.assignedAgent.id).toBe(agentAId);

    const otherAgentsCustomer = await call("POST", "/customers", AGENT_B, {
      fullName: "Customer Two",
      phone: "+91 92222 22222",
    });

    const listA = await call("GET", "/customers", AGENT_A);
    expect(listA.body.meta.total).toBe(1);
    expect(listA.body.data[0].fullName).toBe("Customer One");

    const peek = await call("GET", `/customers/${otherAgentsCustomer.body.data.id}`, AGENT_A);
    expect(peek.status).toBe(404);
    const edit = await call("PATCH", `/customers/${otherAgentsCustomer.body.data.id}`, AGENT_A, {
      fullName: "Hijacked",
    });
    expect(edit.status).toBe(404);

    const adminList = await call("GET", "/customers?agentId=" + agentBId, ADMIN);
    expect(adminList.body.meta.total).toBe(1);
  });

  it("shows agents only ACTIVE policies", async () => {
    const list = await call("GET", "/policies?status=INACTIVE", AGENT_A);
    expect(list.body.data.map((policy: { status: string }) => policy.status)).toEqual(["ACTIVE"]);
    expect(list.body.data[0].policiesSold).toBeNull();
    expect((await call("GET", `/policies/${inactivePolicyId}`, AGENT_A)).status).toBe(404);
    expect((await call("GET", `/policies/${inactivePolicyId}`, ADMIN)).status).toBe(200);
  });

  // ─── Sales & receipts ───────────────────────────────────────────────────────
  it("records sales with server-side agent, premium and expiry", async () => {
    const mine = await call("POST", "/customers", AGENT_A, {
      fullName: "Mine",
      phone: "+91 93333 33333",
    });
    const theirs = await call("POST", "/customers", AGENT_B, {
      fullName: "Theirs",
      phone: "+91 94444 44444",
    });

    const issueDate = shiftDays(-10);
    const sale = await call("POST", "/sold-policies", AGENT_A, {
      policyId: activePolicyId,
      customerId: mine.body.data.id,
      issueDate,
      agentId: agentBId,
    });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({
      premium: 10000,
      expiryDate: computeExpiryDate(new Date(`${issueDate}T00:00:00Z`), 12)
        .toISOString()
        .slice(0, 10),
      policyStatus: "ACTIVE",
      paymentStatus: "PENDING",
    });
    expect(sale.body.data.agent.id).toBe(agentAId);

    const override = await call("POST", "/sold-policies", AGENT_A, {
      policyId: activePolicyId,
      customerId: mine.body.data.id,
      premium: 1,
    });
    expect(override.status).toBe(403);

    const crossSale = await call("POST", "/sold-policies", AGENT_A, {
      policyId: activePolicyId,
      customerId: theirs.body.data.id,
    });
    expect(crossSale.status).toBe(404);

    const inactiveSale = await call("POST", "/sold-policies", AGENT_A, {
      policyId: inactivePolicyId,
      customerId: mine.body.data.id,
    });
    expect(inactiveSale.status).toBe(404);

    expect((await call("GET", "/sold-policies", AGENT_B)).body.meta.total).toBe(0);
    expect(
      (
        await call("PATCH", `/sold-policies/${sale.body.data.id}`, AGENT_A, {
          policyStatus: "ACTIVE",
        })
      ).status,
    ).toBe(403);
  });

  it("rejects overpayment and activates a fully paid policy", async () => {
    const customer = await call("POST", "/customers", AGENT_A, {
      fullName: "Payer",
      phone: "+91 95555 55555",
    });
    const sale = await call("POST", "/sold-policies", AGENT_A, {
      policyId: activePolicyId,
      customerId: customer.body.data.id,
    });
    const soldPolicyId = sale.body.data.id;

    const tooMuch = await call("POST", "/receipts", AGENT_A, {
      soldPolicyId,
      amount: 10001,
      paymentMethod: "UPI",
    });
    expect(tooMuch.status).toBe(400);

    expect(
      (
        await call("POST", "/receipts", AGENT_A, {
          soldPolicyId,
          amount: 4000,
          paymentMethod: "CASH",
        })
      ).status,
    ).toBe(201);
    expect(
      (await call("GET", `/sold-policies/${soldPolicyId}`, AGENT_A)).body.data.paymentStatus,
    ).toBe("PENDING");

    await call("POST", "/receipts", AGENT_A, { soldPolicyId, amount: 6000, paymentMethod: "UPI" });
    const paid = await call("GET", `/sold-policies/${soldPolicyId}`, AGENT_A);
    expect(paid.body.data).toMatchObject({
      paymentStatus: "PAID",
      policyStatus: "ACTIVE",
      amountPaid: 10000,
    });
    expect(paid.body.data.receipts).toHaveLength(2);

    expect((await call("GET", "/receipts", AGENT_B)).body.meta.total).toBe(0);
    expect(
      (await call("POST", "/receipts", AGENT_B, { soldPolicyId, amount: 1, paymentMethod: "UPI" }))
        .status,
    ).toBe(404);
  });

  it("refuses to delete records with history", async () => {
    const customer = await call("POST", "/customers", AGENT_A, {
      fullName: "History",
      phone: "+91 96666 66666",
    });
    await call("POST", "/sold-policies", AGENT_A, {
      policyId: activePolicyId,
      customerId: customer.body.data.id,
    });
    expect((await call("DELETE", `/policies/${activePolicyId}`, ADMIN)).status).toBe(409);
    expect((await call("DELETE", `/customers/${customer.body.data.id}`, AGENT_A)).status).toBe(409);
    expect((await call("DELETE", `/agents/${agentAId}`, ADMIN)).status).toBe(409);
    expect((await call("DELETE", `/policies/${inactivePolicyId}`, ADMIN)).status).toBe(200);
  });

  // ─── Query features ─────────────────────────────────────────────────────────
  it("filters, searches, sorts and paginates in the database", async () => {
    for (const [index, premium] of [2000, 8000, 30000].entries()) {
      await call("POST", "/policies", ADMIN, {
        ...healthPolicy,
        policyCode: `TST-EXTRA-${index}`,
        policyName: `Extra Plan ${index}`,
        premium,
      });
    }
    const search = await call("GET", "/policies?search=extra&sortBy=premium&order=asc", ADMIN);
    expect(search.body.data.map((policy: { premium: number }) => policy.premium)).toEqual([
      2000, 8000, 30000,
    ]);

    const range = await call(
      "GET",
      "/policies?premiumMin=5000&premiumMax=20000&insuranceType=HEALTH",
      ADMIN,
    );
    expect(
      range.body.data.every(
        (policy: { premium: number }) => policy.premium >= 5000 && policy.premium <= 20000,
      ),
    ).toBe(true);

    const page = await call("GET", "/policies?page=2&limit=2&sortBy=policyCode&order=asc", ADMIN);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(page.body.data).toHaveLength(2);

    expect((await call("GET", "/policies?limit=1000", ADMIN)).status).toBe(400);
    expect((await call("GET", "/policies?from=2026-02-01&to=2026-01-01", ADMIN)).status).toBe(400);
  });

  // ─── Analytics ──────────────────────────────────────────────────────────────
  it("scopes dashboard statistics by role", async () => {
    const a = await call("POST", "/customers", AGENT_A, {
      fullName: "A1",
      phone: "+91 97777 77777",
    });
    const b = await call("POST", "/customers", AGENT_B, {
      fullName: "B1",
      phone: "+91 98888 88888",
    });
    // Backdated sales are recorded by the admin; they are attributed to each customer's agent.
    for (const [customerId, issueDate] of [
      [a.body.data.id, "2026-03-10"],
      [a.body.data.id, "2026-04-10"],
      [b.body.data.id, "2026-04-15"],
    ]) {
      const sale = await call("POST", "/sold-policies", ADMIN, {
        policyId: activePolicyId,
        customerId,
        issueDate,
      });
      expect(sale.status).toBe(201);
    }

    const admin = await call("GET", "/dashboard/summary", ADMIN);
    expect(admin.body.data).toMatchObject({
      policiesSold: 3,
      totalPremium: 30000,
      totalAgents: 2,
      totalCustomers: 2,
      totalPolicies: 2,
      activePolicies: 1,
    });

    const agent = await call("GET", "/dashboard/summary", AGENT_A);
    expect(agent.body.data).toMatchObject({
      policiesSold: 2,
      totalPremium: 20000,
      totalAgents: null,
      totalCustomers: 1,
      totalPolicies: 1,
    });

    const series = await call(
      "GET",
      "/dashboard/policy-sales?interval=month&from=2026-01-01&to=2026-06-30",
      ADMIN,
    );
    expect(
      series.body.data.points.map((point: { policiesSold: number }) => point.policiesSold),
    ).toEqual([0, 0, 1, 2, 0, 0]);

    const distribution = await call("GET", "/dashboard/policy-distribution", AGENT_A);
    expect(distribution.body.data).toEqual([
      { insuranceType: "HEALTH", policiesSold: 2, premium: 20000, percentage: 100 },
      { insuranceType: "MOTOR", policiesSold: 0, premium: 0, percentage: 0 },
    ]);

    const performance = await call("GET", "/dashboard/agent-performance", AGENT_A);
    expect(performance.body.data).toHaveLength(1);
    expect(performance.body.data[0]).toMatchObject({ agentId: agentAId, policiesSold: 2 });

    const recent = await call("GET", "/dashboard/recent-sales?limit=5", AGENT_B);
    expect(recent.body.data).toHaveLength(1);

    const report = await call("GET", "/reports/policies?sortBy=policiesSold", ADMIN);
    expect(report.body.data[0]).toMatchObject({ policyId: activePolicyId, policiesSold: 3 });
    const agentsReport = await call("GET", "/reports/agents", ADMIN);
    expect(agentsReport.body.meta.total).toBe(2);
    const sales = await call(
      "GET",
      `/reports/sales?agentId=${agentBId}&from=2026-01-01&to=2026-12-31`,
      ADMIN,
    );
    expect(sales.status).toBe(200);
    expect(sales.body.data.summary.policiesSold).toBe(1);
  });

  // ─── Settings ───────────────────────────────────────────────────────────────
  describe("system settings", () => {
    it("lets a Super Admin read defaults without any stored rows", async () => {
      const { status, body } = await call("GET", "/settings", SUPER);
      expect(status).toBe(200);
      const byKey = Object.fromEntries(
        body.data.items.map((item: { key: string; value: unknown }) => [item.key, item.value]),
      );
      expect(byKey["general.currency"]).toBe("INR");
      expect(byKey["general.timezone"]).toBe("Asia/Kolkata");
      expect(byKey["policy.allowAgentSales"]).toBe(true);
    });

    it("persists updates (visible on the next read) and audits them", async () => {
      const update = await call("PATCH", "/settings", SUPER, {
        settings: {
          "general.companyName": "Acme Insurance",
          "notifications.emailEnabled": false,
          "policy.defaultRenewalReminderDays": 45,
        },
      });
      expect(update.status).toBe(200);
      const again = await call("GET", "/settings", SUPER);
      const byKey = Object.fromEntries(
        again.body.data.items.map((item: { key: string; value: unknown }) => [
          item.key,
          item.value,
        ]),
      );
      expect(byKey["general.companyName"]).toBe("Acme Insurance");
      expect(byKey["notifications.emailEnabled"]).toBe(false);
      expect(byKey["policy.defaultRenewalReminderDays"]).toBe(45);
      expect(again.body.data.lastUpdatedBy).toBe(SUPER_ADMIN_EMAIL);

      const log = await db.auditLog.findFirstOrThrow({ where: { action: "settings.update" } });
      const metadata = log.metadata as {
        changedKeys: string[];
        changes: Record<string, unknown>;
      };
      expect(metadata.changedKeys).toHaveLength(3);
      // Free text is named but its value is never written to the audit log.
      expect(metadata.changes).not.toHaveProperty("general.companyName");
      expect(JSON.stringify(log)).not.toContain("Acme Insurance");
      expect(metadata.changes["notifications.emailEnabled"]).toEqual({ from: true, to: false });
    });

    it("rejects unknown keys, bad types and empty updates", async () => {
      for (const settings of [
        { "database.url": "postgres://x" },
        { "general.currency": "XYZ" },
        { "policy.allowAgentSales": "yes" },
        { "policy.defaultRenewalReminderDays": 0 },
        {},
      ]) {
        const { status } = await call("PATCH", "/settings", SUPER, { settings });
        expect(status).toBe(400);
      }
      expect(await db.systemSetting.count()).toBe(0);
    });

    it("denies agents and unauthenticated callers", async () => {
      expect((await call("GET", "/settings", AGENT_A)).status).toBe(403);
      expect((await call("GET", "/settings/health", AGENT_A)).status).toBe(403);
      const patch = await call("PATCH", "/settings", AGENT_A, {
        settings: { "policy.allowAgentSales": false },
      });
      expect(patch.status).toBe(403);
      expect((await call("GET", "/settings")).status).toBe(401);
      expect(await db.systemSetting.count()).toBe(0);
    });

    it("reports health and configuration without leaking secrets", async () => {
      const health = await call("GET", "/health");
      expect(health.status).toBe(200);
      expect(health.body.data.database).toBe("up");

      const { status, body } = await call("GET", "/settings/health", SUPER);
      expect(status).toBe(200);
      expect(body.data.database).toBe("up");
      expect(body.data.configuration.firebase).toBe("configured");
      expect(body.data.security.cookie.httpOnly).toBe(true);
      expect(body.data.security.agentPasswordPolicy.minLength).toBe(8);
      const text = JSON.stringify(body);
      expect(text).not.toContain(TEST_DATABASE_URL!);
      expect(text).not.toMatch(/postgres(ql)?:\/\//);
      expect(text).not.toMatch(/PRIVATE KEY/);
    });

    it("enforces policy.allowAgentSales on the API, not just in the UI", async () => {
      const customer = await call("POST", "/customers", AGENT_A, {
        fullName: "Cust",
        phone: "9333333333",
      });
      const sale = (headers: Record<string, string>) =>
        call("POST", "/sold-policies", headers, {
          policyId: activePolicyId,
          customerId: customer.body.data.id,
        });

      await call("PATCH", "/settings", SUPER, { settings: { "policy.allowAgentSales": false } });
      const blocked = await sale(AGENT_A);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("FORBIDDEN");
      expect(await db.soldPolicy.count()).toBe(0);
      // The tenant admin can still record sales.
      expect((await sale(ADMIN)).status).toBe(201);

      await call("PATCH", "/settings", SUPER, { settings: { "policy.allowAgentSales": true } });
      expect((await sale(AGENT_A)).status).toBe(201);
    });

    it("applies the default payment status to new unpaid sales", async () => {
      const customer = await call("POST", "/customers", AGENT_A, {
        fullName: "Cust",
        phone: "9444444444",
      });
      await call("PATCH", "/settings", SUPER, {
        settings: { "policy.defaultPaymentStatus": "DUE" },
      });
      const sale = await call("POST", "/sold-policies", AGENT_A, {
        policyId: activePolicyId,
        customerId: customer.body.data.id,
      });
      expect(sale.status).toBe(201);
      expect(sale.body.data.policyStatus).toBe("ACTIVE");
      expect(sale.body.data.paymentStatus).toBe("DUE");
    });
  });

  // ─── Audit ──────────────────────────────────────────────────────────────────
  it("writes audit logs without credentials", async () => {
    await call("POST", "/auth/verify", AGENT_A);
    const logs = await call("GET", "/audit-logs?entity=Agent&order=asc", ADMIN);
    expect(logs.body.data.map((log: { action: string }) => log.action)).toEqual([
      "agent.create",
      "agent.create",
    ]);
    const all = await db.auditLog.findMany();
    expect(all.some((log) => log.action === "auth.login")).toBe(true);
    expect(JSON.stringify(all)).not.toContain("valid|");
    expect(JSON.stringify(all)).not.toContain(agentATempPassword);
  });
});
