import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { sendDueReminders } from "../src/modules/field-notes/field-note-emails.js";
import { renderFieldNoteEmail } from "../src/utils/email/field-note-template.js";
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
const AGENT_EMAIL = "agent.a@test.example.com";
const AGENT = bearer(tokenFor("uid-agent-a", AGENT_EMAIL));
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

describe("field note email content", () => {
  const base = {
    agentName: "Asha",
    clientName: "Kamalnath",
    contactName: "",
    phone: "9876543210",
    coverage: "Health Plus",
    note: "Will confirm <in> two days",
    followUpLabel: "Renewal call",
    followUpAt: new Date("2026-10-15T04:30:00Z"),
    timeZone: "Asia/Kolkata",
  };

  it("lists who, when, message and phone, and escapes the memo", () => {
    const saved = renderFieldNoteEmail({ ...base, kind: "saved" });
    expect(saved.subject).toContain("Kamalnath");
    for (const part of ["Kamalnath", "15 October 2026", "10:00", "9876543210", "Renewal call"]) {
      expect(saved.html + saved.text).toContain(part);
    }
    expect(saved.html).toContain("&lt;in&gt;");
    expect(saved.html).not.toContain("<in>");
  });

  it("labels the reminder", () => {
    const reminder = renderFieldNoteEmail({ ...base, kind: "reminder" });
    expect(reminder.subject).toMatch(/^Reminder:.*in 1 hour$/);
  });
});

describe.skipIf(!hasTestDatabase)("field note emails (PostgreSQL integration)", () => {
  let app: App;
  const sent: { to: string[]; subject: string; text: string }[] = [];

  const call = async (
    method: "POST" | "PATCH",
    url: string,
    headers: Record<string, string>,
    payload: unknown,
  ) => {
    const response = await app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object });
    return { status: response.statusCode, body: response.json() };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeAll(async () => {
    ({ app } = await createTestApp({
      RESEND_API_KEY: "test-key",
      RESEND_FROM_EMAIL: "noreply@test.example.com",
    }));
    await resetDatabase(app.db);
    await seedTenant(app.db);
    const created = await call("POST", "/agents", ADMIN, {
      fullName: "Asha Agent",
      email: AGENT_EMAIL,
      phone: "9000000001",
    });
    expect(created.status).toBe(201);
  });
  afterAll(async () => app.close());

  beforeEach(async () => {
    sent.length = 0;
    await app.db.fieldNote.deleteMany({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const note = (followUpAt: string | null, extra: object = {}) => ({
    clientName: "Kamalnath",
    category: "HEALTH",
    note: "Call about the health plan",
    phone: "9876543210",
    followUpAt,
    ...extra,
  });

  it("emails the logged-in agent when a note is saved", async () => {
    const res = await call("POST", "/agent/field-notes", AGENT, note(minutes(60 * 24)));
    expect(res.status).toBe(201);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([AGENT_EMAIL]);
    expect(sent[0]!.text).toContain("Call about the health plan");
    expect(sent[0]!.text).toContain("9876543210");
  });

  it("emails an admin their own note, named from their email", async () => {
    const res = await call("POST", "/field-notes", ADMIN, note(minutes(60 * 24)));
    expect(res.status).toBe(201);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual([TENANT_ADMIN_EMAIL]);
    expect(sent[0]!.text).toContain("Hi Tenant Admin,");
  });

  it("does not email again when an archived note is restored", async () => {
    await call("POST", "/agent/field-notes", AGENT, note(null, { loggedAt: minutes(-60) }));
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("sends the 1-hour reminder once, only for open follow-ups inside the hour", async () => {
    const soon = await call("POST", "/agent/field-notes", AGENT, note(minutes(50)));
    await call("POST", "/agent/field-notes", AGENT, note(minutes(60 * 5)));
    const done = await call("POST", "/agent/field-notes", AGENT, note(minutes(20)));
    await call("PATCH", `/agent/field-notes/${done.body.data.id}`, AGENT, { status: "COMPLETED" });
    await settle();
    sent.length = 0;

    // Created less than an hour out, so the saved-note email was enough.
    expect(await sendDueReminders(app.db, app.config, app.log)).toBe(0);

    // Moving it re-arms the reminder.
    await call("PATCH", `/agent/field-notes/${soon.body.data.id}`, AGENT, { followUpAt: minutes(45) });
    expect(await sendDueReminders(app.db, app.config, app.log)).toBe(1);
    expect(sent[0]!.subject).toMatch(/^Reminder:/);
    expect(await sendDueReminders(app.db, app.config, app.log)).toBe(0);

    // The far-off note gets its reminder once the hour is near.
    const later = new Date(Date.now() + 60 * 5 * 60_000 - 30 * 60_000);
    expect(await sendDueReminders(app.db, app.config, app.log, later)).toBe(1);
  });
});
