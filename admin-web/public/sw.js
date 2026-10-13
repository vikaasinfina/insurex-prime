/* InsuroX service worker: fast repeat loads + an offline page. Data (the API) is never cached. */
const VERSION = "v1";
const ASSETS = `insurox-assets-${VERSION}`; // hashed build files: safe to keep forever
const STATIC = `insurox-static-${VERSION}`; // icons, fonts
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll([OFFLINE_URL, "/pwa-192.png", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("insurox-") && ![ASSETS, STATIC].includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || refresh;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Google Fonts: the stylesheet and the font files rarely change.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, STATIC));
    return;
  }

  // Everything else cross-origin (the API, Firebase, ...) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Hashed build output never changes under the same name.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (/\.(?:png|jpe?g|svg|ico|webp|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request, STATIC));
    return;
  }

  // Pages: always try the network (so a new deploy shows up), fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

// Phone alerts (Web Push): meeting invitations and "starts in 2 hours / 15 minutes" reminders.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "InsuroX", body: event.data ? event.data.text() : "" };
  }
  const actions = data.joinUrl ? [{ action: "join", title: "Join meeting" }] : [];
  event.waitUntil(
    self.registration.showNotification(data.title || "InsuroX", {
      body: data.body || "",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: Boolean(data.joinUrl),
      data: { url: data.url || "/", joinUrl: data.joinUrl || "" },
      actions,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, joinUrl } = event.notification.data || {};
  // "Join meeting" goes straight to the call; tapping the message opens the schedule.
  const target = event.action === "join" && joinUrl ? joinUrl : new URL(url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const sameApp = target.startsWith(self.location.origin) ? windows[0] : undefined;
      if (sameApp && "navigate" in sameApp) return sameApp.navigate(target).then((client) => client && client.focus());
      return self.clients.openWindow(target);
    }),
  );
});
