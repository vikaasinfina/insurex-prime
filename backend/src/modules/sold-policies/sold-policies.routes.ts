import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../middleware/role.js";
import {
  errorResponses,
  ok,
  paginated,
  paginatedSchema,
  successSchema,
} from "../../utils/response.js";
import {
  createSoldPolicyBodySchema,
  listSoldPoliciesQuerySchema,
  quoteSoldPolicyQuerySchema,
  soldPolicyDetailSchema,
  soldPolicyIdParamsSchema,
  soldPolicyQuoteSchema,
  soldPolicySchema,
  updateSoldPolicyBodySchema,
} from "./sold-policies.schemas.js";
import {
  createSoldPolicy,
  deleteSoldPolicy,
  getSoldPolicy,
  listSoldPolicies,
  quoteSoldPolicy,
  updateSoldPolicy,
} from "./sold-policies.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Sold Policies"];

export const soldPolicyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get(
    "",
    {
      schema: {
        tags,
        security,
        summary: "List sold policies",
        description:
          "AGENT callers see only their own sales. Search matches policy number, customer name/code and policy name/code. Date range filters `issueDate`.",
        querystring: listSoldPoliciesQuerySchema,
        response: { 200: paginatedSchema(soldPolicySchema), ...errorResponses },
      },
    },
    async (request) => {
      const { items, meta } = await listSoldPolicies(
        request.db,
        requireAuth(request),
        request.query,
      );
      return paginated(items, meta);
    },
  );

  app.get(
    "/quote",
    {
      schema: {
        tags,
        security,
        summary: "Preview a sale (premium and expiry) without recording it",
        description:
          "Runs the same checks as recording a sale (customer ownership, ACTIVE policy, issue date) and returns the server-computed premium and expiry date.",
        querystring: quoteSoldPolicyQuerySchema,
        response: { 200: successSchema(soldPolicyQuoteSchema), ...errorResponses },
      },
    },
    async (request) => ok(await quoteSoldPolicy(request.db, requireAuth(request), request.query)),
  );

  app.get(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Get a sold policy with its receipts",
        params: soldPolicyIdParamsSchema,
        response: { 200: successSchema(soldPolicyDetailSchema), ...errorResponses },
      },
    },
    async (request) => ok(await getSoldPolicy(request.db, requireAuth(request), request.params.id)),
  );

  app.post(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Record a policy sale",
        description:
          "The policy must be ACTIVE. AGENT callers can sell only to their own ACTIVE/PENDING customers, at the catalog premium, with an issue date from 30 days ago to 90 days ahead; the sale is always attributed to the calling agent. Expiry and the policy number are generated on the server. With `paymentMethod`, a PAID receipt for the full premium is created atomically and the policy starts ACTIVE; otherwise it starts PENDING until paid.",
        body: createSoldPolicyBodySchema,
        response: { 201: successSchema(soldPolicyDetailSchema), ...errorResponses },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(ok(await createSoldPolicy(request.db, requireAuth(request), request, request.body))),
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Update a sold policy (admins any; agents their own)",
        params: soldPolicyIdParamsSchema,
        body: updateSoldPolicyBodySchema,
        response: { 200: successSchema(soldPolicyDetailSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await updateSoldPolicy(
          request.db,
          requireAuth(request),
          request,
          request.params.id,
          request.body,
        ),
      ),
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Delete a sold policy and its receipts (admins any; agents their own)",
        params: soldPolicyIdParamsSchema,
        response: { 200: successSchema(z.object({ id: z.uuid() })), ...errorResponses },
      },
    },
    async (request) => {
      await deleteSoldPolicy(request.db, requireAuth(request), request, request.params.id);
      return ok({ id: request.params.id });
    },
  );
};
