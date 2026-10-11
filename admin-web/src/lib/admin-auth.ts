import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";
import { clearSession, getSession, updateSession } from "@tanstack/react-start/server";
import { z } from "zod";

interface AdminSessionData {
  uid: string;
  email: string;
  role: "super_admin";
}

const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
const minSessionSecretLength = 32;

const serverNotConfiguredMessage = "Admin sign-in is not configured on this server.";

// Presence and length only — never log the values themselves.
function logAuthEnvDiagnostics(reason: string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  console.error(`[admin-auth] ${reason}`, {
    hasAuthSessionSecret: Boolean(secret),
    authSessionSecretLength: secret?.length ?? 0,
    authSessionSecretMinLength: minSessionSecretLength,
    hasAdminPassword: Boolean(process.env["ADMIN_PASSWORD"]),
  });
}

function getSessionConfig() {
  const password = process.env.AUTH_SESSION_SECRET;
  if (!password || password.length < minSessionSecretLength) return null;

  return {
    name: "insurex_admin_session",
    password,
    maxAge: sessionLifetimeSeconds,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] !== "development",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function getAllowedAdminEmails() {
  return (process.env["AUTH_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAuthorizedAdminEmail(email: string) {
  const allowedEmails = getAllowedAdminEmails();
  return allowedEmails.length === 0 || allowedEmails.includes(email);
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const config = getSessionConfig();
  if (!config) return null;

  try {
    const session = await getSession<AdminSessionData>(config);
    const email = session.data.email?.toLowerCase();
    if (session.data.role !== "super_admin" || !email || !isAuthorizedAdminEmail(email)) {
      return null;
    }
    // Sliding session: each visit renews the cookie for another full lifetime.
    await updateSession<AdminSessionData>(config, { ...session.data }).catch(() => undefined);
    return { email };
  } catch {
    return null;
  }
});

/** Fixed Super Admin credentials from the server environment (never bundled into the client). */
function getAdminCredentials() {
  const ids = (process.env["ADMIN_LOGIN_IDS"] ?? "")
    .split(",")
    .map((id) => normalizeAdminId(id))
    .filter(Boolean);
  const password = process.env["ADMIN_PASSWORD"];
  const email = (process.env["ADMIN_LOGIN_IDS"] ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .find((id) => id.includes("@"));
  return { ids, password, email };
}

/** "9090 909 090" and "9090909090" are the same phone-style ID; emails compare lowercase. */
function normalizeAdminId(id: string) {
  const value = id.trim().toLowerCase();
  return /^\+?[\d\s-]{7,20}$/.test(value) ? value.replace(/\D/g, "") : value;
}

const digest = (value: string) => createHash("sha256").update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export const adminPasswordLogin = createServerFn({ method: "POST" })
  .validator(
    z.object({ identifier: z.string().min(1).max(254), password: z.string().min(1).max(128) }),
  )
  .handler(async ({ data }) => {
    const config = getSessionConfig();
    const { ids, password, email } = getAdminCredentials();
    if (!config || !password || !email) {
      logAuthEnvDiagnostics("Admin sign-in is not configured on this server.");
      throw new Error(serverNotConfiguredMessage);
    }

    const identifier = normalizeAdminId(data.identifier);
    // Evaluate both checks so timing does not reveal which one failed.
    const idOk = ids.some((id) => safeEqual(id, identifier));
    const passwordOk = safeEqual(password, data.password);
    if (!idOk || !passwordOk) throw new Error("Incorrect admin ID or password.");

    try {
      await updateSession<AdminSessionData>(config, { uid: "admin", email, role: "super_admin" });
    } catch (error) {
      console.error("[admin-auth] Failed to create admin session.", error);
      throw new Error("Your session could not be created. Please try again.");
    }
    return { email };
  });

export const endAdminSession = createServerFn({ method: "POST" }).handler(async () => {
  const config = getSessionConfig();
  if (config) await clearSession(config);
  return { success: true };
});
