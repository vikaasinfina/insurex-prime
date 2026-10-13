import { useCallback, useSyncExternalStore } from "react";

/**
 * Read / dismissed marks for the bell menu. The notifications themselves come from live data
 * (meetings, expiring policies), so what someone has read or cleared is remembered on their device.
 */
interface Marks {
  read: string[];
  dismissed: string[];
}

const EMPTY: Marks = { read: [], dismissed: [] };
const MAX_MARKS = 300;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; marks: Marks }>();

const storageKey = (scope: string) => `insurox.notifications.v2.${scope}`;

function load(scope: string): Marks {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(scope));
  } catch {
    // Storage unavailable (private mode): marks just last until the page reloads.
  }
  const hit = cache.get(scope);
  if (hit && hit.raw === raw) return hit.marks;
  let marks = hit?.marks ?? EMPTY;
  if (hit?.raw !== raw) {
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<Marks>) : null;
      marks = {
        read: Array.isArray(parsed?.read) ? parsed.read : [],
        dismissed: Array.isArray(parsed?.dismissed) ? parsed.dismissed : [],
      };
    } catch {
      marks = EMPTY;
    }
  }
  cache.set(scope, { raw, marks });
  return marks;
}

function save(scope: string, marks: Marks) {
  const next = { read: marks.read.slice(-MAX_MARKS), dismissed: marks.dismissed.slice(-MAX_MARKS) };
  let raw: string | null = JSON.stringify(next);
  try {
    window.localStorage.setItem(storageKey(scope), raw);
  } catch {
    raw = null;
  }
  cache.set(scope, { raw, marks: next });
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

export function useNotificationState(scope: string) {
  const marks = useSyncExternalStore(
    subscribe,
    () => load(scope),
    () => EMPTY,
  );
  const markRead = useCallback(
    (ids: string[]) => {
      const current = load(scope);
      const fresh = ids.filter((id) => !current.read.includes(id));
      if (fresh.length) save(scope, { ...current, read: [...current.read, ...fresh] });
    },
    [scope],
  );
  const dismiss = useCallback(
    (ids: string[]) => {
      const current = load(scope);
      const fresh = ids.filter((id) => !current.dismissed.includes(id));
      if (fresh.length) save(scope, { ...current, dismissed: [...current.dismissed, ...fresh] });
    },
    [scope],
  );
  return {
    isRead: (id: string) => marks.read.includes(id) || marks.dismissed.includes(id),
    isDismissed: (id: string) => marks.dismissed.includes(id),
    markRead,
    dismiss,
  };
}

export type NotificationState = ReturnType<typeof useNotificationState>;
