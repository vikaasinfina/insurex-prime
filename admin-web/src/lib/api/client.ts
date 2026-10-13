/**
 * Base URL of the InsuroX backend (e.g. https://api.example.com). When unset, the
 * admin pages keep using their built-in demo data and the agent workspace is disabled.
 */
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

export const isApiConfigured = rawBaseUrl.length > 0;
export const API_BASE_URL = rawBaseUrl ? `${rawBaseUrl}/api/v1` : "";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Error returned by the backend's `{ success: false, error }` envelope. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The signed-in session is gone (expired, revoked or never existed). */
export const isSessionEndedError = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 401 &&
  ["UNAUTHENTICATED", "INVALID_TOKEN", "TOKEN_EXPIRED"].includes(error.code);

/** React Query retry policy: never retry 4xx responses, retry other failures once. */
export const retryUnlessClientError = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1;

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue>;

export const toQuery = (params: object | undefined): Query => ({
  ...(params as Query | undefined),
});

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Kept for call-site clarity: sign-in endpoints are public. Sessions use the cookie. */
  auth?: boolean;
  /** Non-2xx statuses whose JSON `data` is still a valid result (e.g. /health answers 503 when degraded). */
  acceptStatuses?: number[];
}

async function send(path: string, options: RequestOptions) {
  if (!isApiConfigured) {
    throw new ApiError(0, "API_NOT_CONFIGURED", "The InsuroX API is not configured.");
  }
  if (typeof window === "undefined") {
    throw new ApiError(0, "BROWSER_ONLY", "API requests are only made from the browser.");
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      // Sends and stores the session cookie (agents and Super Admin) (HttpOnly; never readable here).
      credentials: "include",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the InsuroX server. Try again.");
  }

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: unknown;
    meta?: PaginationMeta;
    error?: { code?: string; message?: string; requestId?: string };
  } | null;

  const accepted =
    options.acceptStatuses?.includes(response.status) === true && payload?.data !== undefined;
  if (!accepted && (!response.ok || !payload?.success)) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "UNKNOWN_ERROR",
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.requestId ?? response.headers.get("x-request-id") ?? undefined,
    );
  }
  return payload;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await send(path, options)).data as T;
}

export async function apiRequestPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Paginated<T>> {
  const payload = await send(path, options);
  return { data: payload.data as T[], meta: payload.meta as PaginationMeta };
}

/** Shared list parameters supported by the backend. */
export interface ListParams {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  sortBy?: string | undefined;
  order?: "asc" | "desc";
  from?: string | undefined;
  to?: string | undefined;
}
