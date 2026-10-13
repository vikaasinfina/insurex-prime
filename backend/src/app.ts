import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Database } from "./config/database.js";
import type { Env } from "./config/env.js";
import type { TokenVerifier } from "./config/firebase.js";
import { authPlugin } from "./middleware/auth.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { genReqId, registerRequestIdHeader, REQUEST_ID_HEADER } from "./middleware/request-id.js";
import { registerRoutes } from "./routes/index.js";

export interface AppDependencies {
  env: Env;
  db: Database;
  /** Firebase ID-token verifier (tests inject a fake). */
  tokenVerifier: TokenVerifier;
  /** Override the logger (tests pass `false`). */
  logger?: FastifyServerOptions["logger"];
}

export const API_PREFIX = "/api/v1";

export async function buildApp(deps: AppDependencies) {
  const { env } = deps;

  const app = Fastify({
    logger: deps.logger ?? {
      level: env.LOG_LEVEL,
      // Defence in depth: request logs never include credentials.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "headers.authorization",
          "headers.cookie",
        ],
        censor: "[REDACTED]",
      },
    },
    genReqId,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("config", env);
  app.decorate("db", deps.db);

  await app.register(authPlugin, { tokenVerifier: deps.tokenVerifier });
  registerRequestIdHeader(app);
  registerErrorHandler(app);

  const allowAnyOrigin = env.FRONTEND_URL.includes("*");
  await app.register(cors, {
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, server-to-server) are not CORS requests.
      if (!origin || allowAnyOrigin || env.FRONTEND_URL.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Tenant-Id", REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    // Agents authenticate with an HttpOnly session cookie; Super Admins with bearer tokens.
    credentials: true,
    maxAge: 600,
  });

  if (env.DOCS_ENABLED) {
    await app.register(swagger, {
      openapi: {
        openapi: "3.1.0",
        info: {
          title: "InsuroX Prime API",
          version: "1.0.0",
          description: [
            "REST API for the InsuroX Prime insurance management platform.",
            "",
            "**Authentication:** send a Firebase ID token from the signed-in frontend user as",
            "`Authorization: Bearer <Firebase ID token>`. The token is verified with the Firebase",
            "Admin SDK; the caller's role is always read from the database, never from the client.",
            "Agents sign in with `POST /api/v1/auth/agent/login` (agent code or email + password),",
            "which sets an HttpOnly session cookie that the browser sends with `credentials: include`.",
            "",
            "**Tenants:** each tenant is one agency attached to one insurer (e.g. Aakruthi Enterprises on",
            "TATA AIA). All customers, agents, policies, sales and receipts belong to exactly one tenant and",
            "are invisible to every other tenant.",
            "",
            "**Roles:** `SUPER_ADMIN` is the platform operator (tenants and insurers); to inspect a tenant's",
            "data they send `X-Tenant-Id`. `TENANT_ADMIN` has full access inside their own tenant. `AGENT` is",
            "limited to their own profile, customers, sold policies and receipts, and reads ACTIVE catalog",
            "policies of their tenant only.",
            "",
            "All responses use `{ success: true, data }` or",
            "`{ success: false, error: { code, message, requestId } }`.",
          ].join("\n"),
        },
        servers: [{ url: "/" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "Firebase ID token",
            },
          },
        },
        tags: [
          { name: "Health", description: "Service status" },
          {
            name: "Auth",
            description: "Firebase token verification, agent sign-in and current user",
          },
          { name: "Agent Portal", description: "The signed-in agent's dashboard and profile" },
          {
            name: "Agents",
            description: "Agent management (SUPER_ADMIN; agents can read themselves)",
          },
          { name: "Customers", description: "Customers (agents see only their own)" },
          { name: "Policies", description: "Policy catalog (agents see ACTIVE policies only)" },
          { name: "Catalog", description: "The tenant's category tree and dropdown data" },
          { name: "Platform: Insurers", description: "Insurance companies (SUPER_ADMIN)" },
          {
            name: "Platform: Tenants",
            description: "Tenant activation and lifecycle (SUPER_ADMIN)",
          },
          { name: "Sold Policies", description: "Policies sold to customers" },
          { name: "Receipts", description: "Payment receipts" },
          { name: "Dashboard", description: "Aggregated statistics, scoped by role" },
          { name: "Reports", description: "SUPER_ADMIN reports" },
          { name: "Audit Logs", description: "SUPER_ADMIN audit trail" },
        ],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  await app.register(registerRoutes, { prefix: API_PREFIX });

  app.addHook("onClose", async () => {
    await deps.db.$disconnect();
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
