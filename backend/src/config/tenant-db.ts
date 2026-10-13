import type { Database } from "./database.js";
import { AppError } from "../utils/errors.js";

/**
 * Models whose rows belong to exactly one tenant. Every query on them through a
 * tenant-scoped client is filtered by `tenantId`, and every create stamps it, so a
 * service cannot forget the filter or read another tenant's rows.
 * (User and AuditLog carry a nullable tenantId and are handled explicitly.)
 */
const TENANT_MODELS = new Set([
  "Agent",
  "Customer",
  "Policy",
  "PolicyCategory",
  "SoldPolicy",
  "Receipt",
  "SalesGoal",
  "FieldNote",
  "Meeting",
]);

const FILTERED_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

const UNIQUE_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);

type Args = Record<string, unknown> | undefined;

const withTenantData = (data: unknown, tenantId: string) =>
  Array.isArray(data)
    ? data.map((row) => ({ ...(row as object), tenantId }))
    : { ...(data as object), tenantId };

/**
 * Returns a client that can only see and write the given tenant's data. With a null
 * tenant (a platform Super Admin who has not chosen one) any access to tenant data fails.
 */
export function scopeToTenant(db: Database, tenantId: string | null): Database {
  return db.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          if (!tenantId) {
            throw new AppError(
              400,
              "TENANT_REQUIRED",
              "Choose a tenant first (send the X-Tenant-Id header).",
            );
          }
          const next = { ...(args as Args) } as Record<string, unknown>;
          if (FILTERED_OPERATIONS.has(operation)) {
            const where = (next.where as object | undefined) ?? {};
            // Unique lookups keep their unique key at the top level; the rest are AND-ed.
            next.where = UNIQUE_OPERATIONS.has(operation)
              ? { ...where, tenantId }
              : { AND: [where, { tenantId }] };
          } else if (
            operation === "create" ||
            operation === "createMany" ||
            operation === "createManyAndReturn"
          ) {
            next.data = withTenantData(next.data, tenantId);
          } else if (operation === "upsert") {
            next.where = { ...(args as { where: object }).where, tenantId };
            next.create = withTenantData(next.create, tenantId);
          } else {
            throw new AppError(
              500,
              "INTERNAL_ERROR",
              `Unsupported tenant-scoped operation ${operation}.`,
            );
          }
          return query(next as never);
        },
      },
    },
  }) as unknown as Database;
}
