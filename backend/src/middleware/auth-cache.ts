/**
 * Short-lived cache for the session lookup that every agent request starts with. Without it
 * each request pays several database round trips just to learn who is calling.
 *
 * Entries live a few seconds, and are dropped immediately when a session is revoked
 * (logout, password change, suspension), so a revoked session stops working at once on this
 * server and within AUTH_CACHE_MS at worst on others.
 */
export const AUTH_CACHE_MS = 10_000;
const MAX_ENTRIES = 2_000;

interface Entry<T> {
  at: number;
  value: T;
}

const entries = new Map<string, Entry<unknown>>();

export function getCachedSession<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > AUTH_CACHE_MS) {
    entries.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSession<T>(key: string, value: T) {
  if (entries.size >= MAX_ENTRIES) {
    // Drop the oldest entry (Map keeps insertion order).
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(key, { at: Date.now(), value });
}

/** Forgets every cached session (call after revoking sessions or changing who may sign in). */
export function clearAuthCache() {
  entries.clear();
}
