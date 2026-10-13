import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { agentPortalRoutes } from "../modules/agent-portal/agent-portal.routes.js";
import { agentGoalRoutes } from "../modules/agent-goals/agent-goals.routes.js";
import { fieldNoteRoutes } from "../modules/field-notes/field-notes.routes.js";
import { agentRoutes } from "../modules/agents/agents.routes.js";
import { auditLogRoutes } from "../modules/audit-logs/audit-logs.routes.js";
import { adminLoginRoutes } from "../modules/auth/admin-login.routes.js";
import { agentLoginRoutes } from "../modules/auth/agent-login.routes.js";
import { passwordResetRoutes } from "../modules/auth/password-reset.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { catalogRoutes } from "../modules/catalog/catalog.routes.js";
import { customerRoutes } from "../modules/customers/customers.routes.js";
import { meetingRoutes } from "../modules/meetings/meetings.routes.js";
import { platformRoutes } from "../modules/platform/platform.routes.js";
import { policyRoutes } from "../modules/policies/policies.routes.js";
import { receiptRoutes } from "../modules/receipts/receipts.routes.js";
import { dashboardRoutes } from "../modules/reports/dashboard.routes.js";
import { reportRoutes } from "../modules/reports/reports.routes.js";
import { settingsRoutes } from "../modules/settings/settings.routes.js";
import { tenantProfileRoutes } from "../modules/tenant-profile/tenant-profile.routes.js";
import { soldPolicyRoutes } from "../modules/sold-policies/sold-policies.routes.js";
import { healthRoutes } from "./health.js";

/**
 * All /api/v1 routes. Every module except health and agent sign-in/out requires either a
 * Firebase ID token (`Authorization: Bearer`) or the agent session cookie.
 */
export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(agentLoginRoutes, { prefix: "/auth/agent" });
  await app.register(adminLoginRoutes, { prefix: "/auth/admin" });
  await app.register(passwordResetRoutes, { prefix: "/auth/password-reset" });
  await app.register(platformRoutes, { prefix: "/platform" });
  await app.register(catalogRoutes, { prefix: "/catalog" });
  await app.register(agentRoutes, { prefix: "/agents" });
  await app.register(agentPortalRoutes, { prefix: "/agent" });
  await app.register(agentGoalRoutes, { prefix: "/agent/goals" });
  // Agents and admins share the notes API; the /agent path stays for older frontends.
  await app.register(fieldNoteRoutes, { prefix: "/field-notes" });
  await app.register(fieldNoteRoutes, { prefix: "/agent/field-notes" });
  await app.register(meetingRoutes, { prefix: "/meetings" });
  await app.register(customerRoutes, { prefix: "/customers" });
  await app.register(policyRoutes, { prefix: "/policies" });
  await app.register(soldPolicyRoutes, { prefix: "/sold-policies" });
  await app.register(receiptRoutes, { prefix: "/receipts" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
  await app.register(reportRoutes, { prefix: "/reports" });
  await app.register(auditLogRoutes, { prefix: "/audit-logs" });
  await app.register(settingsRoutes, { prefix: "/settings" });
  await app.register(tenantProfileRoutes, { prefix: "/tenant/profile" });
};
