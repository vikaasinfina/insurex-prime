import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  requireAuth,
  requireRole,
  requireTenantId,
  tenantAdminOnly,
} from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import {
  createMeetingBodySchema,
  createdMeetingSchema,
  listMeetingsQuerySchema,
  meetingAgentSchema,
  meetingIdParamsSchema,
  meetingSchema,
  updateMeetingBodySchema,
} from "./meetings.schemas.js";
import {
  createMeeting,
  deleteMeeting,
  listInvitableAgents,
  listMeetings,
  updateMeeting,
} from "./meetings.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Meetings"];

/**
 * Shared calendar for admins and agents. Everyone sees the meetings they organize or are
 * invited to; only the organizer can change or cancel one.
 */
export const meetingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "AGENT"));

  app.get(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Meetings the signed-in user organizes or is invited to, within a date window",
        querystring: listMeetingsQuerySchema,
        response: { 200: successSchema(z.array(meetingSchema)), ...errorResponses },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      requireTenantId(auth);
      return ok(await listMeetings(request.db, auth, request.query.from, request.query.to));
    },
  );

  app.get(
    "/agents",
    {
      preHandler: tenantAdminOnly,
      schema: {
        tags,
        security,
        summary: "Active agents an admin can invite",
        response: { 200: successSchema(z.array(meetingAgentSchema)), ...errorResponses },
      },
    },
    async (request) => {
      requireTenantId(requireAuth(request));
      return ok(await listInvitableAgents(request.db));
    },
  );

  app.post(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Schedule a meeting",
        description:
          "An admin invites selected agents (or `allAgents`). An agent's meeting is with the agency's admins. Either can add outside `guestEmails`. Everyone invited is emailed the date, time and link; `emails` reports how many sent.",
        body: createMeetingBodySchema,
        response: { 201: successSchema(createdMeetingSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const created = await createMeeting(request.db, requireTenantId(auth), auth, request.body, {
        config: app.config,
        logger: request.log,
      });
      return reply.code(201).send(ok(created));
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Change a meeting (organizer only)",
        params: meetingIdParamsSchema,
        body: updateMeetingBodySchema,
        response: { 200: successSchema(meetingSchema), ...errorResponses },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      return ok(
        await updateMeeting(request.db, requireTenantId(auth), auth, request.params.id, request.body),
      );
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Cancel a meeting (organizer only)",
        params: meetingIdParamsSchema,
        response: { 200: successSchema(z.object({ id: z.uuid() })), ...errorResponses },
      },
    },
    async (request) => ok(await deleteMeeting(request.db, requireAuth(request), request.params.id)),
  );
};
