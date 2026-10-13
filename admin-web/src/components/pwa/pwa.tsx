import { Bell, Download, Share, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isApiConfigured, pushApi } from "@/lib/api";

/** Registers the service worker (production only, so dev servers are never served stale files). */
export function useServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}

/** A thin bar while the phone has no connection. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-3 pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-xs font-semibold text-black"
    >
      <WifiOff className="size-3.5" /> You're offline. Changes can't be saved until you reconnect.
    </div>
  );
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "insurex.install-dismissed";
const DISMISS_DAYS = 14;

const dismissedRecently = () => {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone or iPad, in any browser (iPadOS reports itself as a Mac, so check for touch too). */
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Install the app" card for phones: the real install prompt on Android/Chrome, and the
 * Share → Add to Home Screen steps on iPhone. Hidden once installed or dismissed.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    setHidden(false);
    setIosHint(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: it will just show again next visit.
    }
  };

  if (hidden || (!event && !iosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border bg-card p-3.5 shadow-xl lg:hidden">
      <div className="flex items-start gap-3">
        <img src="/pwa-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Install InsuroX</p>
          {event ? (
            <p className="text-xs text-muted-foreground">
              Open it from your home screen like an app, full screen and faster.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tap <Share className="mx-0.5 inline size-3.5 align-text-bottom" /> Share (bottom of
              Safari), choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </p>
          )}
          {event && (
            <Button
              size="sm"
              className="mt-2 h-8 rounded-lg"
              onClick={async () => {
                await event.prompt();
                const { outcome } = await event.userChoice;
                if (outcome === "accepted") setHidden(true);
                else dismiss();
              }}
            >
              <Download className="mr-1.5 size-3.5" /> Install
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

const urlBase64ToBytes = (value: string) => {
  const raw = atob(
    (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"),
  );
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const OPT_OUT_KEY = "insurox.push-optout";
const ASKED_KEY = "insurox.push-asked";

const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (key: string, on: boolean) => {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
};

const pushSupported = () =>
  import.meta.env.PROD &&
  isApiConfigured &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** Registers this device for the signed-in user (a device always follows whoever is signed in). */
async function subscribeDevice() {
  const { enabled, publicKey } = await pushApi.key();
  if (!enabled || !publicKey) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    }));
  await pushApi.subscribe(subscription.toJSON());
  return true;
}

/** Asks for permission (must run from a tap/click) and registers the device. Returns the new state. */
async function enablePush(): Promise<"on" | "off" | "blocked"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  writeFlag(OPT_OUT_KEY, false);
  return (await subscribeDevice()) ? "on" : "off";
}

async function disablePush() {
  writeFlag(OPT_OUT_KEY, true);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await pushApi.unsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  }
}

/**
 * Phone alerts are on by default: once someone is signed in, alerts are registered on this device
 * without any setup. Browsers only allow the permission prompt after a tap, so the first tap in
 * the app triggers it (once). Someone who switches alerts off, or says no, is never asked again.
 */
export function useAutoPushAlerts() {
  useEffect(() => {
    if (!pushSupported() || readFlag(OPT_OUT_KEY)) return;
    let cancelled = false;
    let detach = () => {};
    (async () => {
      try {
        if (Notification.permission === "granted") {
          await subscribeDevice();
        } else if (Notification.permission === "default" && !readFlag(ASKED_KEY)) {
          const { enabled } = await pushApi.key();
          if (!enabled || cancelled) return;
          const ask = () => {
            detach();
            writeFlag(ASKED_KEY, true);
            void enablePush().catch(() => undefined);
          };
          window.addEventListener("pointerdown", ask, { once: true });
          window.addEventListener("keydown", ask, { once: true });
          detach = () => {
            window.removeEventListener("pointerdown", ask);
            window.removeEventListener("keydown", ask);
          };
        }
      } catch {
        // Alerts are optional: never get in the way of the app.
      }
    })();
    return () => {
      cancelled = true;
      detach();
    };
  }, []);
}

type PushState = "checking" | "off" | "on" | "blocked" | "unavailable";

const UNAVAILABLE_NOTE: Record<string, string> = {
  server: "Phone alerts aren't set up on the server yet.",
  ios: "On iPhone, add InsuroX to your Home Screen and open it from there to turn this on.",
  browser: "This browser can't show phone alerts.",
  signin: "Sign in again to manage phone alerts.",
};

/**
 * On/off switch for phone alerts (meeting invitations and 2-hour / 15-minute reminders) on this
 * device. Always visible so people can see the setting; disabled with a reason when alerts can't
 * work here. iPhone only allows alerts from the installed app.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unavailable = (why: string) => {
      setReason(why);
      setState("unavailable");
    };
    if (!isApiConfigured) return unavailable("server");
    if (!import.meta.env.PROD) return unavailable("dev");
    let cancelled = false;
    (async () => {
      try {
        const { enabled } = await pushApi.key();
        if (cancelled) return;
        if (!enabled) return unavailable("server");
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          return unavailable(isIos() && !isStandalone() ? "ios" : "browser");
        }
        if (Notification.permission === "denied") return setState("blocked");
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing && Notification.permission === "granted" ? "on" : "off");
      } catch {
        if (!cancelled) unavailable("signin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      setState(await enablePush());
    } catch {
      setError("Couldn't turn on alerts. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError("");
    try {
      await disablePush();
      setState("off");
    } catch {
      setError("Couldn't turn off alerts. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const on = state === "on";
  const note =
    state === "blocked"
      ? "Alerts are blocked. Allow notifications for InsuroX in your phone's or browser's settings."
      : state === "unavailable"
        ? UNAVAILABLE_NOTE[reason]
        : error;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Bell className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Phone alerts</span>
        <Switch
          checked={on}
          disabled={busy || state === "checking" || state === "unavailable" || state === "blocked"}
          onCheckedChange={(next) => void (next ? turnOn() : turnOff())}
          aria-label="Phone alerts"
        />
        <span className="text-xs font-medium text-muted-foreground">{on ? "On" : "Off"}</span>
      </div>
      {note && <p className="max-w-xs text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
