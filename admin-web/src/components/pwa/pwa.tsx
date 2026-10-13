import { Bell, BellOff, Download, Share, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

type PushState = "unsupported" | "off" | "on" | "blocked" | "needs-install";

/**
 * Turns phone alerts (meeting invitations and 2-hour / 15-minute reminders) on or off for this
 * device. Hidden when the server has no push keys. iPhone only allows alerts from the installed app.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isApiConfigured || !import.meta.env.PROD) return;
    let cancelled = false;
    (async () => {
      try {
        const { enabled } = await pushApi.key();
        if (!enabled) return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          if (!cancelled) setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
          return;
        }
        if (Notification.permission === "denied") return void (!cancelled && setState("blocked"));
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing && Notification.permission === "granted" ? "on" : "off");
      } catch {
        // Alerts are optional: leave the button hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null || state === "unsupported") return null;

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState(Notification.permission === "denied" ? "blocked" : "off");
        return;
      }
      const { publicKey } = await pushApi.key();
      if (!publicKey) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(publicKey),
        }));
      await pushApi.subscribe(subscription.toJSON());
      setState("on");
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
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn't turn off alerts. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "needs-install") {
    return (
      <p className="text-xs text-muted-foreground">
        For phone alerts on iPhone, add InsuroX to your Home Screen and open it from there.
      </p>
    );
  }
  if (state === "blocked") {
    return (
      <p className="text-xs text-muted-foreground">
        Alerts are blocked. Allow notifications for InsuroX in your phone's settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        className="rounded-xl"
        disabled={busy}
        onClick={() => void (state === "on" ? turnOff() : turnOn())}
      >
        {state === "on" ? (
          <BellOff className="mr-1.5 size-4" />
        ) : (
          <Bell className="mr-1.5 size-4" />
        )}
        {state === "on" ? "Turn off phone alerts" : "Turn on phone alerts"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
