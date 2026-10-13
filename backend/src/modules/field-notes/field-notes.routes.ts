import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  requireAgentId,
  requireAuth,
  requireRole,
  requireTenantId,
} from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import {
  bulkUpdateFieldNotesBodySchema,
  createFieldNoteBodySchema,
  fieldNoteIdParamsSchema,
  fieldNoteSchema,
  listFieldNotesQuerySchema,
  updateFieldNoteBodySchema,
} from "./field-notes.schemas.js";
import {
  parseMemo,
  parseMemoBodySchema,
  parsedMemoSchema,
  reviseMemo,
  reviseMemoBodySchema,
  revisedMemoSchema,
} from "./memo-parser.service.js";
import {
  bulkUpdateFieldNotes,
  createFieldNote,
  deleteFieldNote,
  listFieldNotes,
  updateFieldNote,
} from "./field-notes.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Field Notes"];

/** AGENT-only. An agent can only ever read and change their own memos. */
export const fieldNoteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", requireRole("AGENT"));

  app.get(
    "",
    {
      schema: {
        tags,
        security,
        summary: "List the signed-in agent's field notes (newest first, max 500)",
        querystring: listFieldNotesQuerySchema,
        response: { 200: successSchema(z.array(fieldNoteSchema)), ...errorResponses },
      },
    },
    async (request) =>
      ok(await listFieldNotes(request.db, requireAgentId(requireAuth(request)), request.query)),
  );

  app.post(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Log a field note",
        body: createFieldNoteBodySchema,
        response: { 201: successSchema(fieldNoteSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const created = await createFieldNote(
        request.db,
        requireTenantId(auth),
        requireAgentId(auth),
        request.body,
      );
      return reply.code(201).send(ok(created));
    },
  );

  app.post(
    "/parse",
    {
      schema: {
        tags,
        security,
        summary: "Read a spoken or typed memo into note fields (AI)",
        description:
          'Turns free text such as "I spoke to Kamal Nath about the new health policy, he will confirm in two days" into client, category, summary and follow-up date. Nothing is saved: send the result to POST /agent/field-notes. Without a Gemini key, or if the call fails, `source` is "basic" and `clientName` is empty so the agent can complete it.',
        body: parseMemoBodySchema,
        response: { 200: successSchema(parsedMemoSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await parseMemo(
          app.config,
          requireAgentId(requireAuth(request)),
          request.body,
          request.log,
        ),
      ),
  );

  app.post(
    "/revise",
    {
      schema: {
        tags,
        security,
        summary: "Update a memo from a spoken or typed instruction (AI)",
        description:
          'Applies an instruction such as "meeting postponed to next week, client has urgent work" to the memo in the form and returns the complete updated memo (note, follow-up date, status…). Nothing is saved: send the result to PATCH /agent/field-notes/:id. Without a Gemini key, or if the call fails, `source` is "basic": the memo is unchanged except the instruction is added to the note.',
        body: reviseMemoBodySchema,
        response: { 200: successSchema(revisedMemoSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await reviseMemo(
          app.config,
          requireAgentId(requireAuth(request)),
          request.body,
          request.log,
        ),
      ),
  );

  app.patch(
    "/bulk",
    {
      schema: {
        tags,
        security,
        summary: "Apply the same change to several notes (complete, reschedule)",
        body: bulkUpdateFieldNotesBodySchema,
        response: { 200: successSchema(z.array(fieldNoteSchema)), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await bulkUpdateFieldNotes(
          request.db,
          requireAgentId(requireAuth(request)),
          request.body.ids,
          request.body.patch,
        ),
      ),
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Update a field note",
        params: fieldNoteIdParamsSchema,
        body: updateFieldNoteBodySchema,
        response: { 200: successSchema(fieldNoteSchema), ...errorResponses },
      },
    },
    async (request) =>
      ok(
        await updateFieldNote(
          request.db,
          requireAgentId(requireAuth(request)),
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
        summary: "Delete (archive) a field note",
        params: fieldNoteIdParamsSchema,
        response: { 200: successSchema(z.object({ id: z.uuid() })), ...errorResponses },
      },
    },
    async (request) =>
      ok(await deleteFieldNote(request.db, requireAgentId(requireAuth(request)), request.params.id)),
  );
};
