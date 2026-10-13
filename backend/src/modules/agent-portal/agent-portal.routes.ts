import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  requireAgentId,
  requireAuth,
  requireRole,
  requireTenantId,
} from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import {
  agentDashboardQuerySchema,
  agentDashboardSchema,
  agentProfileSchema,
  updateAgentProfileBodySchema,
} from "./agent-portal.schemas.js";
import { coachingBodySchema, coachingSchema, getCoaching } from "./coaching.service.js";
import { getAgentDashboard, getAgentProfile, updateAgentProfile } from "./agent-portal.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Agent Portal"];

/** AGENT-only endpoints. The agent is always the authenticated caller. */
export const agentPortalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", requireRole("AGENT"));

  app.get(
    "/dashboard",
    {
      schema: {
        tags,
        security,
        summary: "The signed-in agent's dashboard",
        description:
          "KPIs, sales and premium trends, Health/Motor split, recent sales and customers, and policies expiring within 30 days — all for the calling agent only.",
        querystring: agentDashboardQuerySchema,
        response: { 200: successSchema(agentDashboardSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await getAgentDashboard(
          request.db,
          requireTenantId(requireAuth(request)),
          requireAgentId(requireAuth(request)),
          request.query.range,
        ),
      ),
  );

  app.post(
    "/coaching",
    {
      schema: {
        tags,
        security,
        summary: "AI sales coach: top 5 steps to convert business and reach the goal",
        description:
          "Sends only aggregated goal progress (no customer data) to Gemini and returns five steps. Falls back to a built-in checklist when no API key is configured or the call fails.",
        body: coachingBodySchema,
        response: { 200: successSchema(coachingSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await getCoaching(
          app.config,
          requireAgentId(requireAuth(request)),
          request.body,
          request.log,
        ),
      ),
  );

  app.get(
    "/profile",
    {
      schema: {
        tags,
        security,
        summary: "The signed-in agent's profile",
        response: { 200: successSchema(agentProfileSchema), ...errorResponses },
      },
    },
    async (request) => ok(await getAgentProfile(request.db, requireAgentId(requireAuth(request)))),
  );

  app.patch(
    "/profile",
    {
      schema: {
        tags,
        security,
        summary: "Update the signed-in agent's name, phone or address",
        description: "Email, agent code and status are managed by the Super Admin (400 if sent).",
        body: updateAgentProfileBodySchema,
        response: { 200: successSchema(agentProfileSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await updateAgentProfile(
          request.db,
          request,
          requireAgentId(requireAuth(request)),
          request.body,
        ),
      ),
  );
};
