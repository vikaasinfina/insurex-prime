import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyRequest } from "fastify";
import { isAdmin, requireAuth, requireTenantId } from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import { soldPolicySchema } from "../sold-policies/sold-policies.schemas.js";
import {
  getAgentPerformance,
  getPolicyDistribution,
  getPortfolioSummary,
  getRecentSales,
  getSalesOverTime,
  getSummary,
  type AnalyticsScope,
} from "./analytics.service.js";
import {
  agentPerformanceQuerySchema,
  agentPerformanceSchema,
  distributionSchema,
  portfolioSummarySchema,
  recentSalesQuerySchema,
  salesQuerySchema,
  salesSeriesSchema,
  summaryQuerySchema,
  summarySchema,
} from "./reports.schemas.js";

const security = [{ bearerAuth: [] }];
const tags = ["Dashboard"];
const scopeNote = "Admins receive figures for the whole tenant; AGENT receives only their own.";

/** The role decides the scope — never a query parameter. */
function scopeFor(request: FastifyRequest): AnalyticsScope {
  const auth = requireAuth(request);
  return { tenantId: requireTenantId(auth), agentId: isAdmin(auth) ? null : auth.agentId };
}

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get(
    "/summary",
    {
      schema: {
        tags,
        security,
        summary: "KPI summary",
        description: `${scopeNote} Date range filters sold policies by issueDate.`,
        querystring: summaryQuerySchema,
        response: { 200: successSchema(summarySchema), ...errorResponses },
      },
    },
    async (request) => ok(await getSummary(request.db, scopeFor(request), request.query)),
  );

  app.get(
    "/policy-sales",
    {
      schema: {
        tags,
        security,
        summary: "Policies sold and premium over time",
        description: `${scopeNote} Empty periods are returned as zeros. Defaults: last 30 days (day), 12 weeks (week) or 12 months (month).`,
        querystring: salesQuerySchema,
        response: { 200: successSchema(salesSeriesSchema), ...errorResponses },
      },
    },
    async (request) => ok(await getSalesOverTime(request.db, scopeFor(request), request.query)),
  );

  app.get(
    "/policy-distribution",
    {
      schema: {
        tags,
        security,
        summary: "Health vs Motor sales distribution",
        description: scopeNote,
        querystring: summaryQuerySchema,
        response: { 200: successSchema(distributionSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(await getPolicyDistribution(request.db, scopeFor(request), request.query)),
  );

  app.get(
    "/portfolio-summary",
    {
      schema: {
        tags,
        security,
        summary: "Sold policies per line by status",
        description: scopeNote,
        querystring: summaryQuerySchema,
        response: { 200: successSchema(portfolioSummarySchema), ...errorResponses },
      },
    },
    async (request) => ok(await getPortfolioSummary(request.db, scopeFor(request), request.query)),
  );

  app.get(
    "/agent-performance",
    {
      schema: {
        tags,
        security,
        summary: "Top agents by premium, sales or customers",
        description: `${scopeNote} Agents receive a single row for themselves.`,
        querystring: agentPerformanceQuerySchema,
        response: { 200: successSchema(z.array(agentPerformanceSchema)), ...errorResponses },
      },
    },
    async (request) => {
      const { items } = await getAgentPerformance(request.db, scopeFor(request), request.query);
      return ok(items);
    },
  );

  app.get(
    "/recent-sales",
    {
      schema: {
        tags,
        security,
        summary: "Most recent policy sales",
        description: scopeNote,
        querystring: recentSalesQuerySchema,
        response: { 200: successSchema(z.array(soldPolicySchema)), ...errorResponses },
      },
    },
    async (request) => ok(await getRecentSales(request.db, scopeFor(request), request.query.limit)),
  );
};
