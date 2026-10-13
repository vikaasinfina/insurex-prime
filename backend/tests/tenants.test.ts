import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import type { Database } from "../src/config/database.js";
import { getCatalogTemplate } from "../src/modules/catalog/templates/index.js";
import {
  bearer,
  createTestApp,
  hasTestDatabase,
  resetDatabase,
  SUPER_ADMIN_EMAIL,
  tokenFor,
} from "./helpers.js";

const SUPER = bearer(tokenFor("uid-super", SUPER_ADMIN_EMAIL));
const FRONTEND = { origin: "http://localhost:8080" };

type Headers = Record<string, string>;

describe.skipIf(!hasTestDatabase)("Multi-tenant platform (PostgreSQL integration)", () => {
  let app: App;
  let db: Database;
  let aiaId: string;
  let aigId: string;

  const call = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    headers: Headers = {},
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

  /** Activates a tenant and returns a session cookie for its admin (after the forced password change). */
  const codeFor = (name: string) => name.replace(/\W/g, "").slice(0, 6).toUpperCase();

  /** `catalog` applies to the single insurer; pass `insurers` to activate with several. */
  async function activate(
    insurerId: string,
    name: string,
    adminEmail: string,
    extra: { catalog?: unknown; insurers?: unknown[]; businessCode?: string } = {},
  ) {
    const created = await call("POST", "/platform/tenants", SUPER, {
      name,
      legalName: `${name} Pvt Ltd`,
      adminEmail,
      insurers: extra.insurers ?? [
        {
          insurerId,
          businessCode: extra.businessCode ?? `BC-${codeFor(name)}`,
          licenceCode: `LIC-${codeFor(name)}`,
          ...(extra.catalog ? { catalog: extra.catalog } : {}),
        },
      ],
    });
    expect(created.status).toBe(201);
    const { tenant, admin, catalogs } = created.body.data;
    const catalog = catalogs[0];

    const login = await call("POST", "/auth/agent/login", FRONTEND, {
      identifier: adminEmail,
      password: admin.temporaryPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
    const temp = {
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      ...FRONTEND,
    };
    const changed = await call("POST", "/auth/agent/change-password", temp, {
      currentPassword: admin.temporaryPassword,
      newPassword: "Fresh-Start-2026",
    });
    expect(changed.status).toBe(200);
    const cookie = {
      cookie: String(changed.headers["set-cookie"]).split(";")[0]!,
      ...FRONTEND,
    };
    return { tenant, catalog, admin, cookie };
  }

  const newAgent = async (admin: Headers, n: number) => {
    const created = await call("POST", "/agents", admin, {
      fullName: `Agent ${n}`,
      email: `agent${n}-${Math.random().toString(36).slice(2, 7)}@test.example.com`,
      phone: `+91 9000${String(n).padStart(6, "0")}`,
    });
    expect(created.status).toBe(201);
    const login = await call("POST", "/auth/agent/login", FRONTEND, {
      identifier: created.body.data.agentCode,
      password: created.body.data.temporaryPassword,
    });
    const temp = { cookie: String(login.headers["set-cookie"]).split(";")[0]!, ...FRONTEND };
    const changed = await call("POST", "/auth/agent/change-password", temp, {
      currentPassword: created.body.data.temporaryPassword,
      newPassword: "Fresh-Start-2026",
    });
    return {
      id: created.body.data.id as string,
      session: {
        cookie: String(changed.headers["set-cookie"]).split(";")[0]!,
        ...FRONTEND,
      },
    };
  };

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(db);
    const aia = await call("POST", "/platform/insurers", SUPER, {
      code: "TATA_AIA",
      name: "TATA AIA Life Insurance",
    });
    expect(aia.status).toBe(201);
    expect(aia.body.data.hasCatalogTemplate).toBe(true);
    aiaId = aia.body.data.id;
    const aig = await call("POST", "/platform/insurers", SUPER, {
      code: "TATA_AIG",
      name: "TATA AIG General Insurance",
    });
    aigId = aig.body.data.id;
  });

  it("activates a tenant with the TATA AIA catalog and a working admin account", async () => {
    const { tenant, catalog, cookie } = await activate(aiaId, "Aakruthi", "owner@aakruthi.test");
    expect(tenant).toMatchObject({
      name: "Aakruthi",
      status: "ACTIVE",
      adminEmail: "owner@aakruthi.test",
      insurers: [expect.objectContaining({ code: "TATA_AIA", policies: 47 })],
    });
    // 6 categories; 3 + 14 + 9 + 6 + 5 + 10 = 47 policy names.
    expect(catalog).toMatchObject({ source: "TEMPLATE", categories: 6, policies: 47 });

    const tree = await call("GET", "/catalog/tree", cookie);
    expect(tree.status).toBe(200);
    const [life] = tree.body.data.insurers[0].lines;
    expect(life.line).toBe("LIFE");
    const counts = Object.fromEntries(
      life.categories.map((c: { name: string; policies: unknown[] }) => [
        c.name,
        c.policies.length,
      ]),
    );
    expect(counts).toEqual({
      "Health Solutions": 3,
      "Savings Solutions": 14,
      "Protection Solutions": 9,
      "Retirement Solutions": 6,
      "Shubh Solutions": 5,
      "Wealth Solutions": 10,
    });
    expect(tree.body.data.insurers[0].insurer.code).toBe("TATA_AIA");
    // Policy codes are readable, unique and within the 30-character limit.
    const codes = life.categories.flatMap((c: { policies: { policyCode: string }[] }) =>
      c.policies.map((p) => p.policyCode),
    );
    expect(new Set(codes).size).toBe(47);
    expect(codes.every((code: string) => /^[A-Z0-9-]{3,30}$/.test(code))).toBe(true);
  });

  it("loads the TATA AIG health catalog split into Indemnity and Deductible", async () => {
    const { catalog, cookie } = await activate(aigId, "Xyz", "owner@xyz.test");
    expect(catalog).toMatchObject({ source: "TEMPLATE", categories: 2, policies: 6 });
    const tree = await call("GET", "/catalog/tree", cookie);
    const [health] = tree.body.data.insurers[0].lines;
    expect(health.line).toBe("HEALTH");
    expect(
      health.categories.map((c: { name: string; policies: unknown[] }) => [
        c.name,
        c.policies.length,
      ]),
    ).toEqual([
      ["Indemnity", 3],
      ["Deductible", 1],
    ]);
    expect(getCatalogTemplate("TATA_AIG")).toBeDefined();
  });

  it("supports a custom catalog and an empty one", async () => {
    const custom = await activate(aiaId, "Custom Co", "owner@custom.test", {
      catalog: {
        source: "CUSTOM",
        lines: [
          {
            line: "MOTOR",
            categories: [
              {
                name: "Private Car",
                categories: [{ name: "Comprehensive", policies: [{ name: "Car Secure" }] }],
                policies: [{ name: "Car Third Party" }],
              },
            ],
            policies: [{ name: "Loose Motor Plan" }],
          },
        ],
      },
    });
    expect(custom.catalog).toMatchObject({ source: "CUSTOM", categories: 2, policies: 3 });
    const tree = (await call("GET", "/catalog/tree", custom.cookie)).body.data;
    const [motor] = tree.insurers[0].lines;
    expect(motor.policies).toHaveLength(1);
    expect(motor.categories[0].subCategories[0].policies[0].policyName).toBe("Car Secure");

    const missing = await call("POST", "/platform/tenants", SUPER, {
      name: "Nope",
      legalName: "Nope Pvt Ltd",
      adminEmail: "nope@test.example.com",
      insurers: [
        { insurerId: aiaId, businessCode: "X1", licenceCode: "X1", catalog: { source: "CUSTOM" } },
      ],
    });
    expect(missing.status).toBe(400);
    expect(await db.tenantInsurer.count({ where: { businessCode: "X1" } })).toBe(0);

    const empty = await call("POST", "/platform/tenants", SUPER, {
      name: "Blank",
      legalName: "Blank Pvt Ltd",
      adminEmail: "blank@test.example.com",
      insurers: [
        {
          insurerId: aiaId,
          businessCode: "BLANK",
          licenceCode: "BLANK",
          catalog: { source: "NONE" },
        },
      ],
    });
    expect(empty.body.data.catalogs[0]).toEqual({
      insurerId: aiaId,
      source: "NONE",
      categories: 0,
      policies: 0,
    });
  });

  it("rejects duplicate business codes per insurer and duplicate admin emails", async () => {
    await activate(aiaId, "First", "first@test.example.com", { businessCode: "SAME" });
    const body = (insurerId: string, adminEmail: string) => ({
      name: "Second",
      legalName: "Second Pvt Ltd",
      adminEmail,
      insurers: [{ insurerId, businessCode: "SAME", licenceCode: "L2" }],
    });
    expect(
      (await call("POST", "/platform/tenants", SUPER, body(aiaId, "s@test.example.com"))).status,
    ).toBe(409);
    expect(
      (await call("POST", "/platform/tenants", SUPER, body(aigId, "first@test.example.com")))
        .status,
    ).toBe(409);
    // The same code under a different insurer is a different business relationship.
    expect(
      (await call("POST", "/platform/tenants", SUPER, body(aigId, "s2@test.example.com"))).status,
    ).toBe(201);
  });

  it("keeps platform endpoints for the Super Admin only", async () => {
    const { cookie } = await activate(aiaId, "Aakruthi", "owner@aakruthi.test");
    const agent = await newAgent(cookie, 1);
    for (const headers of [cookie, agent.session, {}]) {
      expect((await call("GET", "/platform/tenants", headers)).status).toBe(
        headers === cookie || headers === agent.session ? 403 : 401,
      );
      expect((await call("GET", "/platform/insurers", headers)).status).toBe(
        headers === cookie || headers === agent.session ? 403 : 401,
      );
    }
    expect((await call("GET", "/platform/tenants", SUPER)).body.meta.total).toBe(1);
  });

  it("isolates every kind of data between tenants", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com");
    const b = await activate(aigId, "Beta", "beta@test.example.com");
    const agentA = await newAgent(a.cookie, 1);
    const agentB = await newAgent(b.cookie, 2);

    // Tenant A: customer, a sold policy, a receipt.
    const customerA = await call("POST", "/customers", agentA.session, {
      fullName: "Alpha Customer",
      phone: "9111111111",
    });
    const tree = (await call("GET", "/catalog/tree", agentA.session)).body.data;
    const policyA = tree.insurers[0].lines[0].categories[0].policies[0];
    const sale = await call("POST", "/sold-policies", agentA.session, {
      policyId: policyA.id,
      customerId: customerA.body.data.id,
      premium: 12000,
      expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      insurerPolicyNumber: "AIA-REAL-001",
      paymentMethod: "UPI",
    });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({
      premium: 12000,
      insurerPolicyNumber: "AIA-REAL-001",
      paymentStatus: "PAID",
    });
    const soldId = sale.body.data.id;
    const receiptId = sale.body.data.receipts[0].id;

    // Tenant B sees none of it, by list or by id.
    for (const headers of [b.cookie, agentB.session]) {
      expect((await call("GET", "/customers", headers)).body.meta.total).toBe(0);
      expect((await call("GET", "/sold-policies", headers)).body.meta.total).toBe(0);
      expect((await call("GET", "/receipts", headers)).body.meta.total).toBe(0);
      expect((await call("GET", `/customers/${customerA.body.data.id}`, headers)).status).toBe(404);
      expect((await call("GET", `/sold-policies/${soldId}`, headers)).status).toBe(404);
      expect((await call("GET", `/receipts/${receiptId}`, headers)).status).toBe(404);
      expect((await call("GET", `/policies/${policyA.id}`, headers)).status).toBe(404);
    }
    expect((await call("GET", `/agents/${agentA.id}`, b.cookie)).status).toBe(404);
    expect((await call("GET", "/agents", b.cookie)).body.meta.total).toBe(1);
    // Tenant B cannot write to tenant A's rows.
    expect(
      (await call("PATCH", `/policies/${policyA.id}/status`, b.cookie, { status: "INACTIVE" }))
        .status,
    ).toBe(404);
    expect(
      (
        await call("PATCH", `/customers/${customerA.body.data.id}`, b.cookie, {
          fullName: "Hacked",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("POST", "/receipts", b.cookie, {
          soldPolicyId: soldId,
          amount: 1,
          paymentMethod: "CASH",
        })
      ).status,
    ).toBe(404);
    // ...nor sell tenant A's policy to its own customer.
    const customerB = await call("POST", "/customers", agentB.session, {
      fullName: "Beta Customer",
      phone: "9222222222",
    });
    expect(
      (
        await call("POST", "/sold-policies", agentB.session, {
          policyId: policyA.id,
          customerId: customerB.body.data.id,
          premium: 1000,
          expiryDate: "2030-01-01",
        })
      ).status,
    ).toBe(404);

    // Catalogs, analytics (raw SQL) and audit logs are per tenant too.
    const treeB = (await call("GET", "/catalog/tree", b.cookie)).body.data;
    expect(treeB.insurers[0].insurer.code).toBe("TATA_AIG");
    expect(treeB.insurers[0].lines.map((l: { line: string }) => l.line)).toEqual(["HEALTH", "MOTOR"]);
    expect((await call("GET", "/dashboard/summary", b.cookie)).body.data).toMatchObject({
      policiesSold: 0,
      totalPremium: 0,
      totalCustomers: 1,
      totalAgents: 1,
    });
    expect((await call("GET", "/dashboard/summary", a.cookie)).body.data).toMatchObject({
      policiesSold: 1,
      totalPremium: 12000,
      totalCustomers: 1,
    });
    const agentsReportB = (await call("GET", "/reports/agents", b.cookie)).body.data;
    expect(agentsReportB.map((r: { agentId: string }) => r.agentId)).toEqual([agentB.id]);
    const policiesReportB = (await call("GET", "/reports/policies", b.cookie)).body;
    expect(policiesReportB.meta.total).toBe(6);
    const byType = (await call("GET", "/dashboard/policy-distribution", a.cookie)).body.data;
    expect(
      byType.find((row: { insuranceType: string }) => row.insuranceType === "LIFE"),
    ).toMatchObject({ policiesSold: 1 });
    const logsB = (await call("GET", "/audit-logs", b.cookie)).body.data;
    expect(logsB.length).toBeGreaterThan(0);
    expect(
      logsB.every((log: { metadata: unknown }) => !JSON.stringify(log).includes("AIA-REAL-001")),
    ).toBe(true);
    const logsA = (await call("GET", "/audit-logs?entity=SoldPolicy", a.cookie)).body.data;
    expect(logsA).toHaveLength(1);
    expect((await call("GET", "/audit-logs?entity=SoldPolicy", b.cookie)).body.data).toHaveLength(
      0,
    );

    // Every tenant row really carries the right tenant id.
    expect(await db.soldPolicy.count({ where: { tenantId: b.tenant.id } })).toBe(0);
    expect(await db.policy.count({ where: { tenantId: a.tenant.id } })).toBe(47);
  });

  it("lets the Super Admin act inside a tenant only with X-Tenant-Id", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com");
    expect((await call("GET", "/customers", SUPER)).status).toBe(400);
    expect((await call("GET", "/customers", SUPER)).body.error.code).toBe("TENANT_REQUIRED");
    const scoped = { ...SUPER, "x-tenant-id": a.tenant.id };
    expect((await call("GET", "/customers", scoped)).status).toBe(200);
    expect((await call("GET", "/catalog/tree", scoped)).body.data.insurers[0].insurer.code).toBe(
      "TATA_AIA",
    );
    expect(
      (await call("GET", "/customers", { ...SUPER, "x-tenant-id": "not-a-uuid" })).status,
    ).toBe(404);
    expect(
      (
        await call("GET", "/customers", {
          ...SUPER,
          "x-tenant-id": "00000000-0000-4000-8000-000000000000",
        })
      ).status,
    ).toBe(404);
    // Tenant admins cannot pick another tenant: the header is ignored for them.
    const b = await activate(aigId, "Beta", "beta@test.example.com");
    const sneaky = { ...b.cookie, "x-tenant-id": a.tenant.id };
    expect((await call("GET", "/catalog/tree", sneaky)).body.data.insurers[0].insurer.code).toBe(
      "TATA_AIG",
    );
  });

  it("blocks a suspended tenant everywhere and restores it on reactivation", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com");
    const agent = await newAgent(a.cookie, 1);
    expect((await call("GET", "/customers", agent.session)).status).toBe(200);

    const suspended = await call("POST", `/platform/tenants/${a.tenant.id}/suspend`, SUPER);
    expect(suspended.body.data.status).toBe("SUSPENDED");
    for (const headers of [a.cookie, agent.session]) {
      const response = await call("GET", "/customers", headers);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("ACCOUNT_DISABLED");
    }
    const login = await call("POST", "/auth/agent/login", FRONTEND, {
      identifier: "alpha@test.example.com",
      password: "Fresh-Start-2026",
    });
    expect(login.status).toBe(403);

    await call("POST", `/platform/tenants/${a.tenant.id}/activate`, SUPER);
    expect((await call("GET", "/customers", agent.session)).status).toBe(200);
    expect((await call("GET", "/customers", a.cookie)).status).toBe(200);
  });

  it("resets the tenant admin password and ends their sessions", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com");
    const reset = await call(
      "POST",
      `/platform/tenants/${a.tenant.id}/admin/reset-password`,
      SUPER,
    );
    expect(reset.status).toBe(200);
    expect(reset.body.data.email).toBe("alpha@test.example.com");
    expect((await call("GET", "/customers", a.cookie)).status).toBe(401);
    const login = await call("POST", "/auth/agent/login", FRONTEND, {
      identifier: "alpha@test.example.com",
      password: reset.body.data.temporaryPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ role: "TENANT_ADMIN", mustChangePassword: true });
  });

  it("manages categories with the two-level limit and a matching line", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com", {
      catalog: { source: "NONE" },
    });
    const agent = await newAgent(a.cookie, 1);
    expect(
      (await call("POST", "/catalog/categories", agent.session, { line: "LIFE", name: "Nope" }))
        .status,
    ).toBe(403);

    const top = await call("POST", "/catalog/categories", a.cookie, {
      line: "LIFE",
      name: "Savings",
    });
    expect(top.status).toBe(201);
    expect(
      (await call("POST", "/catalog/categories", a.cookie, { line: "LIFE", name: "savings" }))
        .status,
    ).toBe(409);
    const sub = await call("POST", "/catalog/categories", a.cookie, {
      line: "LIFE",
      name: "Guaranteed",
      parentId: top.body.data.id,
    });
    expect(sub.status).toBe(201);
    // A third level and a parent from another line are refused.
    expect(
      (
        await call("POST", "/catalog/categories", a.cookie, {
          line: "LIFE",
          name: "Too deep",
          parentId: sub.body.data.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("POST", "/catalog/categories", a.cookie, {
          line: "HEALTH",
          name: "Wrong line",
          parentId: top.body.data.id,
        })
      ).status,
    ).toBe(400);

    const policy = await call("POST", "/policies", a.cookie, {
      policyCode: "ALP-1",
      policyName: "Alpha Plan",
      insuranceType: "LIFE",
      categoryId: sub.body.data.id,
    });
    expect(policy.status).toBe(201);
    expect(policy.body.data).toMatchObject({ premium: null, category: { name: "Guaranteed" } });
    expect(
      (
        await call("POST", "/policies", a.cookie, {
          policyCode: "ALP-2",
          policyName: "Wrong",
          insuranceType: "MOTOR",
          categoryId: sub.body.data.id,
        })
      ).status,
    ).toBe(400);

    // Agents get an ACTIVE-only tree; admins also see INACTIVE policies.
    await call("PATCH", `/policies/${policy.body.data.id}/status`, a.cookie, {
      status: "INACTIVE",
    });
    const agentTree = (await call("GET", "/catalog/tree", agent.session)).body.data;
    expect(agentTree.insurers[0].lines[0].categories[0].subCategories[0].policies).toHaveLength(0);
    const adminTree = (await call("GET", "/catalog/tree", a.cookie)).body.data;
    expect(adminTree.insurers[0].lines[0].categories[0].subCategories[0].policies).toHaveLength(1);

    // Non-empty categories cannot be deleted; empty ones can.
    expect((await call("DELETE", `/catalog/categories/${top.body.data.id}`, a.cookie)).status).toBe(
      409,
    );
    expect((await call("DELETE", `/catalog/categories/${sub.body.data.id}`, a.cookie)).status).toBe(
      409,
    );
    await call("DELETE", `/policies/${policy.body.data.id}`, a.cookie);
    expect((await call("DELETE", `/catalog/categories/${sub.body.data.id}`, a.cookie)).status).toBe(
      200,
    );
    expect((await call("DELETE", `/catalog/categories/${top.body.data.id}`, a.cookie)).status).toBe(
      200,
    );
  });

  it("records sales for policies priced on the insurer's portal", async () => {
    const a = await activate(aiaId, "Alpha", "alpha@test.example.com");
    const agent = await newAgent(a.cookie, 1);
    const customer = await call("POST", "/customers", agent.session, {
      fullName: "Cust",
      phone: "9555555555",
    });
    const policy = (await call("GET", "/catalog/tree", agent.session)).body.data.insurers[0]
      .lines[0].categories[0].policies[0];
    expect(policy.premium).toBeNull();
    const base = { policyId: policy.id, customerId: customer.body.data.id };

    // Premium and term are mandatory because the catalog has neither.
    expect((await call("POST", "/sold-policies", agent.session, base)).status).toBe(400);
    expect(
      (await call("POST", "/sold-policies", agent.session, { ...base, premium: 5000 })).status,
    ).toBe(400);
    expect(
      (
        await call("POST", "/sold-policies", agent.session, {
          ...base,
          premium: 5000,
          expiryDate: "2000-01-01",
        })
      ).status,
    ).toBe(400);
    const ok = await call("POST", "/sold-policies", agent.session, {
      ...base,
      premium: 5000,
      expiryDate: "2099-01-01",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({
      premium: 5000,
      expiryDate: "2099-01-01",
      insurerPolicyNumber: null,
    });
  });

  it("lets one tenant sell for several insurers with a catalog for each", async () => {
    // Activated with TATA AIA only, then TATA AIG is added later.
    const a = await activate(aiaId, "Aakruthi", "owner@aakruthi.test");
    const added = await call("POST", `/platform/tenants/${a.tenant.id}/insurers`, SUPER, {
      insurerId: aigId,
      businessCode: "AIG-BC-1",
      licenceCode: "AIG-LIC-1",
    });
    expect(added.status).toBe(201);
    expect(added.body.data.catalog).toMatchObject({
      source: "TEMPLATE",
      categories: 2,
      policies: 6,
    });
    expect(
      added.body.data.tenant.insurers.map((i: { code: string; policies: number }) => [
        i.code,
        i.policies,
      ]),
    ).toEqual([
      ["TATA_AIA", 47],
      ["TATA_AIG", 6],
    ]);
    // The same insurer twice, and a code taken by another tenant, are refused.
    expect(
      (
        await call("POST", `/platform/tenants/${a.tenant.id}/insurers`, SUPER, {
          insurerId: aigId,
          businessCode: "OTHER",
          licenceCode: "OTHER",
        })
      ).status,
    ).toBe(409);
    const b = await activate(aigId, "Beta", "beta@test.example.com", { businessCode: "BETA-AIG" });
    expect(
      (
        await call("POST", `/platform/tenants/${b.tenant.id}/insurers`, SUPER, {
          insurerId: aiaId,
          businessCode: "AIG-BC-1",
          licenceCode: "XX",
          catalog: { source: "NONE" },
        })
      ).status,
    ).toBe(201); // same code, different insurer: fine
    expect(
      (
        await call("PATCH", `/platform/tenants/${a.tenant.id}/insurers/${aigId}`, SUPER, {
          businessCode: "BETA-AIG",
        })
      ).status,
    ).toBe(409); // taken by Beta for the same insurer
    const patched = await call(
      "PATCH",
      `/platform/tenants/${a.tenant.id}/insurers/${aigId}`,
      SUPER,
      {
        licenceCode: "AIG-LIC-2",
      },
    );
    expect(
      patched.body.data.insurers.find((i: { code: string }) => i.code === "TATA_AIG").licenceCode,
    ).toBe("AIG-LIC-2");

    // The agent dropdown data groups lines under each insurer.
    const agent = await newAgent(a.cookie, 1);
    const tree = (await call("GET", "/catalog/tree", agent.session)).body.data;
    expect(tree.insurers.map((i: { insurer: { code: string } }) => i.insurer.code)).toEqual([
      "TATA_AIA",
      "TATA_AIG",
    ]);
    expect(tree.insurers[0].lines.map((l: { line: string }) => l.line)).toEqual(["LIFE"]);
    expect(tree.insurers[1].lines.map((l: { line: string }) => l.line)).toEqual(["HEALTH", "MOTOR"]);
    const filtered = (await call("GET", `/catalog/tree?insurerId=${aigId}`, agent.session)).body
      .data;
    expect(filtered.insurers).toHaveLength(1);

    // With two insurers, new categories and policies must say which one.
    expect(
      (await call("POST", "/catalog/categories", a.cookie, { line: "MOTOR", name: "Cars" })).status,
    ).toBe(400);
    const cars = await call("POST", "/catalog/categories", a.cookie, {
      line: "MOTOR",
      name: "Cars",
      insurerId: aigId,
    });
    expect(cars.status).toBe(201);
    expect(cars.body.data.insurerId).toBe(aigId);
    const sub = await call("POST", "/catalog/categories", a.cookie, {
      line: "MOTOR",
      name: "Comprehensive",
      parentId: cars.body.data.id,
    });
    expect(sub.body.data.insurerId).toBe(aigId); // inherited from the parent
    const policy = { policyCode: "MOT-1", policyName: "Car Secure", insuranceType: "MOTOR" };
    expect((await call("POST", "/policies", a.cookie, policy)).status).toBe(400);
    expect(
      (
        await call("POST", "/policies", a.cookie, {
          ...policy,
          insurerId: aiaId,
          categoryId: cars.body.data.id,
        })
      ).status,
    ).toBe(400); // category belongs to AIG
    const created = await call("POST", "/policies", a.cookie, {
      ...policy,
      categoryId: sub.body.data.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.insurer.code).toBe("TATA_AIG"); // taken from the category
    // A policy never moves to another insurer.
    await call("PATCH", `/policies/${created.body.data.id}`, a.cookie, {
      insurerId: aiaId,
      policyName: "Car Secure+",
    });
    expect(
      (await call("GET", `/policies/${created.body.data.id}`, a.cookie)).body.data.insurer.code,
    ).toBe("TATA_AIG");
    const byInsurer = await call("GET", `/policies?insurerId=${aiaId}&limit=100`, a.cookie);
    expect(byInsurer.body.meta.total).toBe(47);

    // Sold policies work across insurers.
    const customer = await call("POST", "/customers", agent.session, {
      fullName: "Cust",
      phone: "9666666666",
    });
    const health = tree.insurers[1].lines[0].categories[0].policies[0];
    const sale = await call("POST", "/sold-policies", agent.session, {
      policyId: health.id,
      customerId: customer.body.data.id,
      premium: 7289, // the AIG plans carry a 12-month term but no fixed premium
    });
    expect(sale.status).toBe(201);
  });
});
