import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
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

const window = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };
const slot = { startsAt: "2026-10-20T10:00:00.000Z", endsAt: "2026-10-20T11:00:00.000Z" };

describe.skipIf(!hasTestDatabase)("meetings (PostgreSQL integration)", () => {
  let app: App;
  const agentIds: Record<string, string> = {};

  const call = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
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
  const list = async (headers: Record<string, string>) =>
    (await call("GET", `/meetings?from=${window.from}&to=${window.to}`, headers)).body.data;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    await resetDatabase(created.db);
    await seedTenant(created.db);
  });
  afterAll(async () => app.close());

  beforeEach(async () => {
    await app.db.meeting.deleteMany({});
    if (Object.keys(agentIds).length === 0) {
      for (const [fullName, email, phone] of [
        ["Agent A", A_EMAIL, "9000000001"],
        ["Agent B", B_EMAIL, "9000000002"],
      ] as const) {
        const res = await call("POST", "/agents", ADMIN, { fullName, email, phone });
        expect(res.status).toBe(201);
        agentIds[fullName] = res.body.data.id;
      }
    }
  });

  it("shows an admin's meeting only to the agents invited", async () => {
    const created = await call("POST", "/meetings", ADMIN, {
      title: "Pipeline review",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      ...slot,
      agentIds: [agentIds["Agent A"]],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.canEdit).toBe(true);

    expect(await list(ADMIN)).toHaveLength(1);
    const forA = await list(AGENT_A);
    expect(forA).toHaveLength(1);
    expect(forA[0].canEdit).toBe(false);
    expect(await list(AGENT_B)).toHaveLength(0);
  });

  it("invites every agent when asked", async () => {
    await call("POST", "/meetings", ADMIN, { title: "All hands", ...slot, allAgents: true });
    expect(await list(AGENT_A)).toHaveLength(1);
    expect(await list(AGENT_B)).toHaveLength(1);
  });

  it("lets an agent meet the admin, and keeps it from other agents", async () => {
    const created = await call("POST", "/meetings", AGENT_A, { title: "1:1", ...slot });
    expect(created.status).toBe(201);
    expect(await list(ADMIN)).toHaveLength(1);
    expect(await list(AGENT_B)).toHaveLength(0);
  });

  it("only lets the organizer edit or cancel", async () => {
    const { body } = await call("POST", "/meetings", ADMIN, {
      title: "Review",
      ...slot,
      agentIds: [agentIds["Agent A"]],
    });
    const id = body.data.id as string;
    expect((await call("PATCH", `/meetings/${id}`, AGENT_A, { title: "Hijack" })).status).toBe(403);
    expect((await call("DELETE", `/meetings/${id}`, AGENT_A)).status).toBe(403);
    // An agent who was not invited cannot even see it.
    expect((await call("PATCH", `/meetings/${id}`, AGENT_B, { title: "x" })).status).toBe(404);

    const edited = await call("PATCH", `/meetings/${id}`, ADMIN, { title: "Review v2" });
    expect(edited.body.data.title).toBe("Review v2");
    expect((await call("DELETE", `/meetings/${id}`, ADMIN)).status).toBe(200);
    expect(await list(AGENT_A)).toHaveLength(0);
  });

  it("keeps outside guests on the meeting, without duplicating account emails", async () => {
    const { status, body } = await call("POST", "/meetings", ADMIN, {
      title: "With a guest",
      ...slot,
      agentIds: [agentIds["Agent A"]],
      guestEmails: ["Guest@Example.com", "guest@example.com", A_EMAIL],
    });
    expect(status).toBe(201);
    expect(body.data.guestEmails).toEqual(["guest@example.com"]);
    // Email is not configured in tests, so the invitations are reported as not sent.
    expect(body.data.emails).toEqual({ sent: 0, failed: 2 });

    const guestsOnly = await call("POST", "/meetings", ADMIN, {
      title: "External",
      ...slot,
      guestEmails: ["client@example.com"],
    });
    expect(guestsOnly.status).toBe(201);
  });

  it("rejects bad input", async () => {
    const base = { title: "Bad", agentIds: [agentIds["Agent A"]] };
    expect(
      (await call("POST", "/meetings", ADMIN, { ...base, startsAt: slot.endsAt, endsAt: slot.startsAt }))
        .status,
    ).toBe(400);
    expect(
      (await call("POST", "/meetings", ADMIN, { ...base, ...slot, meetingUrl: "javascript:alert(1)" }))
        .status,
    ).toBe(400);
    expect((await call("POST", "/meetings", ADMIN, { title: "No guests", ...slot })).status).toBe(400);
  });
});
