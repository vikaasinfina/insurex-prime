import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { TokenVerificationError, type TokenVerifier } from "../config/firebase.js";
import type { Database } from "../config/database.js";
import { scopeToTenant } from "../config/tenant-db.js";
import type { Role } from "../generated/prisma/enums.js";
import { hashSessionToken, readSessionCookie, setSessionCookie } from "../modules/auth/agent-session.js";
import {
  assertCanSignIn,
  resolveUserForIdentity,
  userInclude,
} from "../modules/auth/auth.service.js";
import { AppError, forbidden, unauthenticated } from "../utils/errors.js";

export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  /** Set for AGENT users; null for admins. */
  agentId: string | null;
  /**
   * The tenant this request acts in. Always the user's own tenant for TENANT_ADMIN and
   * AGENT; for a platform SUPER_ADMIN it is the optional `X-Tenant-Id` header, else null.
   */
  tenantId: string | null;
  /** Set when signed in with an agent password session (cookie); null for Firebase tokens. */
  sessionId: string | null;
  /** The agent signed in with a temporary password and must choose a new one. */
  mustChangePassword: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    tokenVerifier: TokenVerifier;
    authenticate: (request: FastifyRequest, reply?: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
    /** Database client restricted to `auth.tenantId`; use this for all tenant data. */
    db: Database;
  }
  interface FastifyContextConfig {
    /** Reachable while the agent still has to replace a temporary password. */
    allowPendingPasswordChange?: boolean;
  }
}

const MAX_TOKEN_LENGTH = 8192;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Avoid a write per request just to track activity.
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

function extractBearerToken(header: string): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) throw unauthenticated("Authorization header must be 'Bearer <token>'.");
  if (match[1].length > MAX_TOKEN_LENGTH)
    throw new AppError(401, "INVALID_TOKEN", "Invalid token.");
  return match[1];
}

/**
 * Cookie-authenticated writes must come from an allowed frontend origin (CSRF defence
 * on top of SameSite). Browsers always send Origin on cross-origin writes; requests
 * without one are not browser cross-site requests.
 */
export function assertTrustedOrigin(app: FastifyInstance, request: FastifyRequest) {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.origin;
  if (!origin) return;
  const allowed = app.config.FRONTEND_URL;
  if (allowed.includes("*") || allowed.includes(origin)) return;
  throw forbidden("This request was blocked because it came from an untrusted site.");
}

/**
 * Identifies the caller from either
 *  - `Authorization: Bearer <Firebase ID token>` (Super Admins, Google sign-in), or
 *  - the agent session cookie set by `POST /auth/agent/login`.
 * The user, role and status are always loaded from the database. Nothing about identity
 * or role is taken from the request body or query.
 */
export const authPlugin = fp(
  async (app: FastifyInstance, options: { tokenVerifier: TokenVerifier }) => {
    app.decorate("tokenVerifier", options.tokenVerifier);
    app.decorateRequest("auth", null);
    app.decorateRequest("db", null as unknown as Database);

    /** Resolves the acting tenant and attaches the tenant-scoped database client. */
    async function bindTenant(
      request: FastifyRequest,
      user: { role: Role; tenantId: string | null },
    ): Promise<string | null> {
      let tenantId = user.tenantId;
      if (user.role === "SUPER_ADMIN") {
        const header = request.headers["x-tenant-id"];
        const requested = Array.isArray(header) ? header[0] : header;
        if (requested) {
          const tenant = /^[0-9a-f-]{36}$/i.test(requested)
            ? await app.db.tenant.findUnique({ where: { id: requested }, select: { id: true } })
            : null;
          if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found.");
          tenantId = tenant.id;
        }
      }
      request.db = scopeToTenant(app.db, tenantId);
      return tenantId;
    }

    async function authenticateSession(
      request: FastifyRequest,
      reply: FastifyReply | undefined,
      token: string,
    ) {
      assertTrustedOrigin(app, request);
      const session = await app.db.agentSession.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: { include: userInclude } },
      });
      if (!session || session.revokedAt) {
        throw new AppError(401, "INVALID_TOKEN", "Your session has ended. Please sign in again.");
      }
      if (session.expiresAt.getTime() <= Date.now()) {
        throw new AppError(401, "TOKEN_EXPIRED", "Your session has expired. Please sign in again.");
      }
      const { user } = session;
      assertCanSignIn(user);

      if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
        // Sliding session: every active day pushes expiry out by a full TTL again.
        const ttlHours = app.config.AGENT_SESSION_TTL_HOURS;
        await app.db.agentSession.update({
          where: { id: session.id },
          data: {
            lastSeenAt: new Date(),
            expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
          },
        });
        if (reply) setSessionCookie(reply, app.config, token);
      }

      request.auth = {
        userId: user.id,
        email: user.email,
        role: user.role,
        agentId: user.agent?.id ?? null,
        tenantId: await bindTenant(request, user),
        sessionId: session.id,
        mustChangePassword: user.mustChangePassword,
      };

      if (user.mustChangePassword && !request.routeOptions.config.allowPendingPasswordChange) {
        throw new AppError(
          403,
          "PASSWORD_CHANGE_REQUIRED",
          "Please change your temporary password to continue.",
        );
      }
    }

    async function authenticateFirebase(request: FastifyRequest, token: string) {
      let identity;
      try {
        identity = await app.tokenVerifier.verifyIdToken(token);
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          throw error.reason === "expired"
            ? new AppError(401, "TOKEN_EXPIRED", "Your session has expired. Please sign in again.")
            : new AppError(401, "INVALID_TOKEN", "Invalid or revoked token. Please sign in again.");
        }
        // Never log the token itself.
        request.log.error({ err: error }, "Firebase token verification unavailable");
        throw new AppError(
          503,
          "SERVICE_UNAVAILABLE",
          "Authentication is temporarily unavailable.",
        );
      }

      if (!identity.email || !identity.emailVerified) {
        throw new AppError(403, "FORBIDDEN", "A verified email address is required.");
      }

      const user = await resolveUserForIdentity(app.db, app.config.SUPER_ADMIN_EMAILS, {
        uid: identity.uid,
        email: identity.email,
      });

      request.auth = {
        userId: user.id,
        email: user.email,
        role: user.role,
        agentId: user.agent?.id ?? null,
        tenantId: await bindTenant(request, user),
        sessionId: null,
        mustChangePassword: false,
      };
    }

    app.decorate("authenticate", async (request: FastifyRequest, reply?: FastifyReply) => {
      const header = request.headers.authorization;
      if (header) return authenticateFirebase(request, extractBearerToken(header));

      const sessionToken = readSessionCookie(request);
      if (sessionToken) return authenticateSession(request, reply, sessionToken);

      throw unauthenticated();
    });
  },
  { name: "insurex-auth" },
);
