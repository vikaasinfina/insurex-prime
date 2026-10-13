import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/role.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import { isPushConfigured, removeSubscription, saveSubscription } from "./push.service.js";

const security = [{ bearerAuth: [] }];
const tags = ["Push"];

const subscribeBodySchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** Phone alerts: the browser registers (or removes) the device it wants meeting alerts on. */
export const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);
  app.addHook("preHandler", requireRole("SUPER_ADMIN", "TENANT_ADMIN", "AGENT"));

  app.get(
    "/key",
    {
      schema: {
        tags,
        security,
        summary: "Public key the browser needs to subscribe; `enabled` is false when alerts are not set up",
        response: {
          200: successSchema(z.object({ enabled: z.boolean(), publicKey: z.string().nullable() })),
          ...errorResponses,
        },
      },
    },
    async () =>
      ok({
        enabled: isPushConfigured(app.config),
        publicKey: isPushConfigured(app.config) ? (app.config.VAPID_PUBLIC_KEY ?? null) : null,
      }),
  );

  app.post(
    "/subscribe",
    {
      schema: {
        tags,
        security,
        summary: "Turn on phone alerts for this device",
        body: subscribeBodySchema,
        response: { 200: successSchema(z.object({ subscribed: z.literal(true) })), ...errorResponses },
      },
    },
    async (request) => {
      const { endpoint, keys } = request.body;
      await saveSubscription(request.db, requireAuth(request).userId, {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: request.headers["user-agent"]?.slice(0, 300),
      });
      return ok({ subscribed: true as const });
    },
  );

  app.post(
    "/unsubscribe",
    {
      schema: {
        tags,
        security,
        summary: "Turn off phone alerts for this device",
        body: z.object({ endpoint: z.url().max(2000) }),
        response: { 200: successSchema(z.object({ subscribed: z.literal(false) })), ...errorResponses },
      },
    },
    async (request) => {
      await removeSubscription(request.db, requireAuth(request).userId, request.body.endpoint);
      return ok({ subscribed: false as const });
    },
  );
};
