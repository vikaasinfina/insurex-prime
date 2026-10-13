import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  requireAuth,
  requireTenantId,
  tenantAdminOnly,
} from "../../middleware/role.js";
import { buildMeta, toSkipTake } from "../../utils/pagination.js";
import {
  errorResponses,
  ok,
  paginated,
  paginatedSchema,
  successSchema,
} from "../../utils/response.js";
import {
  getAgentPerformance,
  getPolicyDistribution,
  getPolicyPerformance,
  getSalesBreakdown,
  getSalesOverTime,
  getSummary,
} from "./analytics.service.js";
import {
  agentPerformanceSchema,
  agentsReportQuerySchema,
  policiesReportQuerySchema,
  policyPerformanceSchema,
  salesReportQuerySchema,
  salesReportSchema,
} from "./reports.schemas.js";

const security = [{ bearerAuth: [] }];
const tags = ["Reports"];

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", tenantAdminOnly);

  app.get(
    "/sales",
    {
      schema: {
        tags,
        security,
        summary: "Sales report (SUPER_ADMIN)",
        description:
          "Summary, timeline, type split and status breakdowns. Filters: date range (issueDate), agentId, insuranceType. Summary KPIs honour `agentId` and the date range.",
        querystring: salesReportQuerySchema,
        response: { 200: successSchema(salesReportSchema), ...errorResponses },
      },
    },
    async (request) => {
      const query = request.query;
      const scope = {
        tenantId: requireTenantId(requireAuth(request)),
        agentId: query.agentId ?? null,
      };
      const [summary, timeline, byType, breakdown] = await Promise.all([
        getSummary(request.db, scope, query),
        getSalesOverTime(request.db, scope, query),
        getPolicyDistribution(request.db, scope, query),
        getSalesBreakdown(request.db, query),
      ]);
      return ok({ summary, timeline, byType, ...breakdown });
    },
  );

  app.get(
    "/policies",
    {
      schema: {
        tags,
        security,
        summary: "Sales per catalog policy (SUPER_ADMIN)",
        querystring: policiesReportQuerySchema,
        response: {
          200: paginatedSchema(policyPerformanceSchema),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { skip, take } = toSkipTake(request.query);
      const { items, total } = await getPolicyPerformance(
        request.db,
        requireTenantId(requireAuth(request)),
        {
          ...request.query,
          limit: take,
          offset: skip,
        },
      );
      return paginated(
        items,
        buildMeta(request.query.page, request.query.limit, total),
      );
    },
  );

  app.get(
    "/agents",
    {
      schema: {
        tags,
        security,
        summary: "Performance per agent (SUPER_ADMIN)",
        querystring: agentsReportQuerySchema,
        response: {
          200: paginatedSchema(agentPerformanceSchema),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { skip, take } = toSkipTake(request.query);
      const { items, total } = await getAgentPerformance(
        request.db,
        { tenantId: requireTenantId(requireAuth(request)), agentId: null },
        { ...request.query, limit: take, offset: skip },
      );
      return paginated(
        items,
        buildMeta(request.query.page, request.query.limit, total),
      );
    },
  );
};
