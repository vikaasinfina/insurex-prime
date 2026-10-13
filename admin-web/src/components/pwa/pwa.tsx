import { Download, Share, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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

const isIosSafari = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

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
    setIosHint(isIosSafari());
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
              Tap <Share className="mx-0.5 inline size-3.5 align-text-bottom" /> Share, then{" "}
              <strong>Add to Home Screen</strong>.
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
