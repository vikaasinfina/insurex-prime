import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import type { Database } from "../src/config/database.js";
import { localToIso } from "../src/modules/field-notes/memo-parser.service.js";
import {
  bearer,
  createTestApp,
  hasTestDatabase,
  resetDatabase,
  seedTenant,
  TENANT_ADMIN_EMAIL,
  tokenFor,
} from "./helpers.js";

const ADMIN = bearer(tokenFor("uid-admin", TENANT_ADMIN_EMAIL));
const A_EMAIL = "agent.a@test.example.com";
const B_EMAIL = "agent.b@test.example.com";
const AGENT_A = bearer(tokenFor("uid-agent-a", A_EMAIL));
const AGENT_B = bearer(tokenFor("uid-agent-b", B_EMAIL));

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
const noGoals = { targetPolicies: 0, targetPremium: 0 };

describe("voice memo date handling", () => {
  it("converts the agent's local date and time to UTC", () => {
    // IST is UTC+5:30, so getTimezoneOffset() is -330.
    expect(localToIso("2026-10-13", "16:00", -330)).toBe("2026-10-13T10:30:00.000Z");
    expect(localToIso("2026-10-13", null, -330)).toBe("2026-10-13T04:30:00.000Z"); // defaults to 10:00
    expect(localToIso("2026-10-13", "09:15", 300)).toBe("2026-10-13T14:15:00.000Z");
  });

  it("rejects dates and times it cannot trust", () => {
    expect(localToIso(null, null, 0)).toBeNull();
    expect(localToIso("next monday", "10:00", 0)).toBeNull();
    expect(localToIso("2026-10-13", "25:00", 0)).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("agent goals and field notes (PostgreSQL integration)", () => {
  let app: App;
  let db: Database;
  let policyId: string;
  let customerId: string;

  const call = async (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ) => {
    const response = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: response.statusCode, body: response.json() };
  };

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await seedTenant(db);
    for (const [fullName, email, phone] of [
      ["Agent A", A_EMAIL, "+91 90000 00001"],
      ["Agent B", B_EMAIL, "+91 90000 00002"],
    ]) {
      expect((await call("POST", "/agents", ADMIN, { fullName, email, phone })).status).toBe(201);
    }
    policyId = (await call("POST", "/policies", ADMIN, healthPolicy)).body.data.id;
    customerId = (
      await call("POST", "/customers", AGENT_A, { fullName: "Cust", phone: "9111111111" })
    ).body.data.id;
  });

  describe("goals", () => {
    const targets = {
      motor: { targetPolicies: 2, targetPremium: 25000 },
      health: { targetPolicies: 3, targetPremium: 90000 },
      life: noGoals,
    };

    it("starts empty and rejects non-agents", async () => {
      const goals = await call("GET", "/agent/goals", AGENT_A);
      expect(goals.status).toBe(200);
      expect(goals.body.data.weekly.categories.health).toEqual({
        targetPolicies: 0,
        targetPremium: 0,
        soldPolicies: 0,
        closedPremium: 0,
      });
      expect((await call("GET", "/agent/goals", ADMIN)).status).toBe(403);
      expect((await call("GET", "/agent/goals", {})).status).toBe(401);
    });

    it("saves targets per cadence and reports progress from the agent's own sales", async () => {
      const saved = await call("PUT", "/agent/goals/weekly", AGENT_A, targets);
      expect(saved.status).toBe(200);
      expect(saved.body.data.weekly.categories.motor).toMatchObject({ targetPolicies: 2 });
      expect(saved.body.data.monthly.categories.motor.targetPolicies).toBe(0);

      const sale = await call("POST", "/sold-policies", AGENT_A, { policyId, customerId });
      expect(sale.status).toBe(201);
      // Another agent's sale never counts.
      const theirs = await call("POST", "/customers", AGENT_B, {
        fullName: "Theirs",
        phone: "9222222222",
      });
      await call("POST", "/sold-policies", AGENT_B, {
        policyId,
        customerId: theirs.body.data.id,
      });

      const goals = (await call("GET", "/agent/goals", AGENT_A)).body.data;
      for (const cadence of ["weekly", "monthly", "quarterly", "yearly"]) {
        expect(goals[cadence].categories.health, cadence).toMatchObject({
          soldPolicies: 1,
          closedPremium: 10000,
        });
      }
      expect(goals.weekly.categories.health).toMatchObject({ targetPolicies: 3 });
      expect(goals.weekly.periodStart <= goals.today && goals.today <= goals.weekly.periodEnd).toBe(
        true,
      );
      // Goals are private to each agent.
      const other = (await call("GET", "/agent/goals", AGENT_B)).body.data;
      expect(other.weekly.categories.motor.targetPolicies).toBe(0);
    });

    it("removes a category goal when its target is set to 0, and validates input", async () => {
      await call("PUT", "/agent/goals/monthly", AGENT_A, targets);
      const cleared = await call("PUT", "/agent/goals/monthly", AGENT_A, {
        ...targets,
        motor: noGoals,
      });
      expect(cleared.body.data.monthly.categories.motor.targetPolicies).toBe(0);
      expect(await db.salesGoal.count({ where: { cadence: "MONTHLY" } })).toBe(1);

      const negative = await call("PUT", "/agent/goals/monthly", AGENT_A, {
        ...targets,
        motor: { targetPolicies: -1, targetPremium: 0 },
      });
      expect(negative.status).toBe(400);
      expect((await call("PUT", "/agent/goals/daily", AGENT_A, targets)).status).toBe(400);
    });
  });

  describe("field notes", () => {
    const note = {
      clientName: "ABC Logistics",
      contactName: "Marcus",
      category: "MOTOR",
      note: "Needs a quote",
      followUpAt: "2026-10-14T09:00:00.000Z",
      followUpLabel: "Renewal call",
    };

    it("creates, lists, searches, updates and deletes an agent's own notes", async () => {
      const created = await call("POST", "/agent/field-notes", AGENT_A, note);
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(created.body.data).toMatchObject({ status: "IN_PROGRESS", tag: "Sticky Note #1" });

      expect((await call("GET", "/agent/field-notes", AGENT_A)).body.data).toHaveLength(1);
      expect((await call("GET", "/agent/field-notes?q=logist", AGENT_A)).body.data).toHaveLength(1);
      expect((await call("GET", "/agent/field-notes?q=zzz", AGENT_A)).body.data).toHaveLength(0);
      expect(
        (await call("GET", "/agent/field-notes?status=COMPLETED", AGENT_A)).body.data,
      ).toHaveLength(0);

      // A partial update leaves every other field alone.
      const patched = await call("PATCH", `/agent/field-notes/${id}`, AGENT_A, {
        status: "COMPLETED",
      });
      expect(patched.body.data).toMatchObject({
        status: "COMPLETED",
        contactName: "Marcus",
        followUpLabel: "Renewal call",
        followUpAt: note.followUpAt,
      });
      expect((await call("PATCH", `/agent/field-notes/${id}`, AGENT_A, {})).status).toBe(400);

      const cleared = await call("PATCH", `/agent/field-notes/${id}`, AGENT_A, {
        followUpAt: null,
      });
      expect(cleared.body.data.followUpAt).toBeNull();

      expect((await call("DELETE", `/agent/field-notes/${id}`, AGENT_A)).status).toBe(200);
      expect((await call("DELETE", `/agent/field-notes/${id}`, AGENT_A)).status).toBe(404);
    });

    it("bulk-updates only the caller's notes and restores with the original tag", async () => {
      const a1 = (await call("POST", "/agent/field-notes", AGENT_A, note)).body.data;
      const a2 = (await call("POST", "/agent/field-notes", AGENT_A, note)).body.data;
      const b1 = (await call("POST", "/agent/field-notes", AGENT_B, note)).body.data;

      const bulk = await call("PATCH", "/agent/field-notes/bulk", AGENT_A, {
        ids: [a1.id, a2.id, b1.id],
        patch: { status: "POSTPONED", followUpLabel: "Rescheduled" },
      });
      expect(bulk.status).toBe(200);
      expect(bulk.body.data).toHaveLength(2);
      expect((await call("GET", "/agent/field-notes", AGENT_B)).body.data[0].status).toBe(
        "IN_PROGRESS",
      );

      const restored = await call("POST", "/agent/field-notes", AGENT_A, {
        ...note,
        tag: a1.tag,
        loggedAt: a1.loggedAt,
      });
      expect(restored.body.data).toMatchObject({ tag: a1.tag, loggedAt: a1.loggedAt });
    });

    it("falls back to a basic result when AI is not configured, and validates input", async () => {
      const body = {
        text: "Spoke to Kamal about a car insurance renewal",
        now: new Date().toISOString(),
        utcOffsetMinutes: -330,
      };
      const parsed = await call("POST", "/agent/field-notes/parse", AGENT_A, body);
      expect(parsed.status).toBe(200);
      expect(parsed.body.data).toMatchObject({
        source: "basic",
        clientName: "",
        category: "MOTOR",
        note: body.text,
        followUpAt: null,
      });
      expect(
        (await call("POST", "/agent/field-notes/parse", AGENT_A, { ...body, text: "hi" })).status,
      ).toBe(400);
      expect((await call("POST", "/agent/field-notes/parse", ADMIN, body)).status).toBe(403);
      // Parsing never saves anything.
      expect((await call("GET", "/agent/field-notes", AGENT_A)).body.data).toHaveLength(0);
    });

    it("revise: leaves the memo unchanged but keeps the instruction when AI is not configured", async () => {
      const memo = {
        clientName: "Kamalnath",
        phone: "9060802281",
        coverage: "Health insurance",
        category: "HEALTH",
        note: "Existing client asked for a call tomorrow.",
        status: "IN_PROGRESS",
        followUpAt: "2026-10-12T04:30:00.000Z",
        followUpLabel: "Follow up",
      };
      const body = {
        memo,
        instruction: "meeting postponed to next week",
        now: new Date().toISOString(),
        utcOffsetMinutes: -330,
      };
      const revised = await call("POST", "/agent/field-notes/revise", AGENT_A, body);
      expect(revised.status).toBe(200);
      expect(revised.body.data).toMatchObject({
        ...memo,
        source: "basic",
        note: `${memo.note} meeting postponed to next week`,
      });
      // An empty form is fine; a missing instruction or a bad status is not.
      const empty = { ...memo, clientName: "", phone: "", coverage: "", note: "", followUpAt: null };
      expect(
        (await call("POST", "/agent/field-notes/revise", AGENT_A, { ...body, memo: empty })).status,
      ).toBe(200);
      expect(
        (await call("POST", "/agent/field-notes/revise", AGENT_A, { ...body, instruction: "x" }))
          .status,
      ).toBe(400);
      expect(
        (
          await call("POST", "/agent/field-notes/revise", AGENT_A, {
            ...body,
            memo: { ...memo, status: "DONE" },
          })
        ).status,
      ).toBe(400);
      expect((await call("POST", "/agent/field-notes/revise", ADMIN, body)).status).toBe(403);
    });

    it("keeps notes private between agents and blocks non-agents", async () => {
      const { id } = (await call("POST", "/agent/field-notes", AGENT_A, note)).body.data;
      expect((await call("GET", "/agent/field-notes", AGENT_B)).body.data).toHaveLength(0);
      expect(
        (await call("PATCH", `/agent/field-notes/${id}`, AGENT_B, { status: "COMPLETED" })).status,
      ).toBe(404);
      expect((await call("DELETE", `/agent/field-notes/${id}`, AGENT_B)).status).toBe(404);
      expect((await call("GET", "/agent/field-notes", ADMIN)).status).toBe(403);
      expect(
        (await call("POST", "/agent/field-notes", AGENT_A, { ...note, note: "" })).status,
      ).toBe(400);
    });
  });
});
