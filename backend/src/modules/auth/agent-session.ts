import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "../../config/database.js";
import type { Env } from "../../config/env.js";
import { clearAuthCache } from "../../middleware/auth-cache.js";

/**
 * Agent browser sessions.
 *
 * The browser holds a random 256-bit token in an HttpOnly cookie; the database stores
 * only its SHA-256 hash, so a database leak does not expose usable sessions. Sessions
 * are revocable (logout, password change, suspension) and re-checked on every request.
 */
export const AGENT_SESSION_COOKIE = "insurex_agent_session";

type CookieConfig = Pick<
  Env,
  | "AGENT_SESSION_TTL_HOURS"
  | "AGENT_COOKIE_SAMESITE"
  | "AGENT_COOKIE_SECURE"
  | "AGENT_COOKIE_DOMAIN"
>;

export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Reads the session token from the Cookie header (no cookie plugin needed). */
export function readSessionCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== AGENT_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    // Tokens are base64url; anything else is not ours.
    return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
  }
  return null;
}

function serializeCookie(config: CookieConfig, value: string, maxAgeSeconds: number) {
  const sameSite = config.AGENT_COOKIE_SAMESITE;
  return [
    `${AGENT_SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite[0]!.toUpperCase()}${sameSite.slice(1)}`,
    `Max-Age=${maxAgeSeconds}`,
    ...(config.AGENT_COOKIE_SECURE ? ["Secure"] : []),
    ...(config.AGENT_COOKIE_DOMAIN ? [`Domain=${config.AGENT_COOKIE_DOMAIN}`] : []),
  ].join("; ");
}

export function setSessionCookie(reply: FastifyReply, config: CookieConfig, token: string) {
  reply.header("set-cookie", serializeCookie(config, token, config.AGENT_SESSION_TTL_HOURS * 3600));
}

export function clearSessionCookie(reply: FastifyReply, config: CookieConfig) {
  reply.header("set-cookie", serializeCookie(config, "", 0));
}

export async function createAgentSession(
  db: Database,
  request: FastifyRequest,
  userId: string,
  ttlHours: number,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  const session = await db.agentSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });
  return { id: session.id, token, expiresAt };
}

/** Ends every open session of a user (password change/reset, suspension). */
export async function revokeUserSessions(
  db: Pick<Database, "agentSession">,
  userId: string,
  exceptSessionId?: string,
) {
  clearAuthCache();
  await db.agentSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
