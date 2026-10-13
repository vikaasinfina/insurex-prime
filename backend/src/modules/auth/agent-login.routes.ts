import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { assertTrustedOrigin } from "../../middleware/auth.js";
import { requireAuth } from "../../middleware/role.js";
import { AppError, badRequest, forbidden } from "../../utils/errors.js";
import { errorResponses, ok, successSchema } from "../../utils/response.js";
import { recordAudit } from "../audit-logs/audit-logs.service.js";
import {
  findAgentLoginUser,
  LoginAttemptLimiter,
  parseAgentIdentifier,
} from "./agent-login.service.js";
import {
  clearSessionCookie,
  createAgentSession,
  hashSessionToken,
  readSessionCookie,
  revokeUserSessions,
  setSessionCookie,
} from "./agent-session.js";
import { meSchema, toMeDto } from "./auth.routes.js";
import { assertCanSignIn, getCurrentUser } from "./auth.service.js";
import { getDummyHash, hashPassword, newPasswordSchema, verifyPassword } from "./password.js";
import { clearAuthCache } from "../../middleware/auth-cache.js";

const loginBodySchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your agent code, phone number or email.")
    .max(254)
    .describe("Agent code (e.g. AGT-DEMO1), registered phone number, or the agent's account email"),
  password: z.string().min(1, "Enter your password.").max(128),
});

const sessionResponseSchema = z
  .object({
    expiresAt: z.iso.datetime(),
    user: meSchema,
  })
  .meta({ id: "AgentSession" });

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Incorrect agent code, phone, email or password.");

/**
 * Agent password sign-in. Sessions are HttpOnly cookies (see agent-session.ts);
 * the browser never sees the session token.
 */
export const agentLoginRoutes: FastifyPluginAsyncZod = async (app) => {
  const loginLimiter = new LoginAttemptLimiter();
  const passwordLimiter = new LoginAttemptLimiter();
  const cookieConfig = app.config;

  app.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Agent sign-in with agent code, phone or email + password",
        description:
          "Sets an HttpOnly session cookie. Unknown accounts and wrong passwords both return 401 INVALID_CREDENTIALS; inactive or suspended agents return 403 ACCOUNT_DISABLED (only after the password is verified). When `user.mustChangePassword` is true, every endpoint except `/auth/me`, `/auth/agent/change-password` and `/auth/agent/logout` returns 403 PASSWORD_CHANGE_REQUIRED. Five failures in 15 minutes lock the identifier for that client (429).",
        body: loginBodySchema,
        response: { 200: successSchema(sessionResponseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      assertTrustedOrigin(app, request);
      const identifier = parseAgentIdentifier(request.body.identifier);
      const limiterKey = `${request.ip}|${identifier.kind}:${identifier.value}`;
      loginLimiter.assertAllowed(limiterKey);

      const user = await findAgentLoginUser(app.db, identifier);
      // Always run one hash so unknown accounts are not distinguishable by timing.
      const passwordOk = await verifyPassword(
        request.body.password,
        user?.passwordHash ?? (await getDummyHash()),
      );
      if (!user || !user.passwordHash || !passwordOk) {
        loginLimiter.recordFailure(limiterKey);
        if (user) {
          await recordAudit(app.db, request, {
            action: "auth.agent_login_failed",
            entity: "User",
            entityId: user.id,
            userId: user.id,
            tenantId: user.tenantId,
            metadata: { identifierType: identifier.kind },
          });
        }
        throw invalidCredentials();
      }

      // The password is right; account state decides the rest (403 for suspended/inactive).
      assertCanSignIn(user);
      loginLimiter.reset(limiterKey);

      const session = await createAgentSession(
        app.db,
        request,
        user.id,
        app.config.AGENT_SESSION_TTL_HOURS,
      );
      await app.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await recordAudit(app.db, request, {
        action: "auth.login",
        entity: "User",
        entityId: user.id,
        userId: user.id,
        tenantId: user.tenantId,
        metadata: { role: user.role, method: "PASSWORD", identifierType: identifier.kind },
      });

      setSessionCookie(reply, cookieConfig, session.token);
      return ok({
        expiresAt: session.expiresAt.toISOString(),
        user: toMeDto(await getCurrentUser(app.db, user.id)),
      });
    },
  );

  app.post(
    "/logout",
    {
      config: { allowPendingPasswordChange: true },
      schema: {
        tags: ["Auth"],
        summary: "End the agent session",
        description:
          "Revokes the session server-side and clears the cookie. Safe to call when already signed out.",
        response: {
          200: successSchema(z.object({ signedOut: z.literal(true) })),
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      assertTrustedOrigin(app, request);
      const token = readSessionCookie(request);
      if (token) {
        const session = await app.db.agentSession.findUnique({
          where: { tokenHash: hashSessionToken(token) },
          select: { id: true, userId: true, revokedAt: true, user: { select: { tenantId: true } } },
        });
        if (session && !session.revokedAt) {
          clearAuthCache();
          await app.db.agentSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          await recordAudit(app.db, request, {
            action: "auth.logout",
            entity: "User",
            entityId: session.userId,
            userId: session.userId,
            tenantId: session.user.tenantId,
          });
        }
      }
      clearSessionCookie(reply, cookieConfig);
      return ok({ signedOut: true as const });
    },
  );

  app.post(
    "/change-password",
    {
      onRequest: app.authenticate,
      config: { allowPendingPasswordChange: true },
      schema: {
        tags: ["Auth"],
        summary: "Change the signed-in agent's password",
        description:
          "Requires the current (or temporary) password. New passwords need 8–128 characters with at least one letter and one number. Ends every other session and issues a fresh cookie.",
        body: changePasswordBodySchema,
        response: { 200: successSchema(meSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      if (auth.role === "SUPER_ADMIN" || !auth.sessionId) {
        throw forbidden(
          "Only agents and tenant admins signed in with a password can change it here.",
        );
      }
      const limiterKey = `password|${auth.userId}`;
      passwordLimiter.assertAllowed(limiterKey);

      const { currentPassword, newPassword } = request.body;
      const user = await app.db.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { passwordHash: true },
      });
      if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
        passwordLimiter.recordFailure(limiterKey);
        throw new AppError(401, "INVALID_CREDENTIALS", "Your current password is incorrect.");
      }
      if (newPassword === currentPassword) {
        throw badRequest("Choose a new password that is different from the current one.");
      }
      passwordLimiter.reset(limiterKey);

      const passwordHash = await hashPassword(newPassword);
      await app.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: auth.userId },
          data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
        });
        await revokeUserSessions(tx, auth.userId);
        await recordAudit(tx, request, {
          action: "auth.password_changed",
          entity: "User",
          entityId: auth.userId,
        });
      });

      // Rotate the session so a token captured before the change stops working.
      const session = await createAgentSession(
        app.db,
        request,
        auth.userId,
        app.config.AGENT_SESSION_TTL_HOURS,
      );
      setSessionCookie(reply, cookieConfig, session.token);
      return ok(toMeDto(await getCurrentUser(app.db, auth.userId)));
    },
  );
};
