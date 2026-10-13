import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  requireAgentId,
  requireAuth,
  requireRole,
  requireTenantId,
} from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import {
  cadenceParamsSchema,
  salesGoalsSchema,
  setGoalsBodySchema,
} from "./agent-goals.schemas.js";
import { getSalesGoals, setSalesGoals } from "./agent-goals.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Sales Goals"];

/** AGENT-only. Targets per category (Motor / Health / Life); progress comes from their own sales. */
export const agentGoalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", requireRole("AGENT"));

  app.get(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Goals and progress for the current week, month, quarter and year",
        response: { 200: successSchema(salesGoalsSchema), ...errorResponses },
      },
    },
    async (request) => ok(await getSalesGoals(request.db, requireAgentId(requireAuth(request)))),
  );

  app.put(
    "/:cadence",
    {
      schema: {
        tags,
        security,
        summary: "Set the targets for one cadence",
        description:
          "Replaces the Motor/Health/Life targets of the cadence. A category with 0 policies has its goal removed.",
        params: cadenceParamsSchema,
        body: setGoalsBodySchema,
        response: { 200: successSchema(salesGoalsSchema), ...errorResponses },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return ok(
        await setSalesGoals(
          request.db,
          requireTenantId(auth),
          requireAgentId(auth),
          request.params.cadence,
          request.body,
        ),
      );
    },
  );
};
