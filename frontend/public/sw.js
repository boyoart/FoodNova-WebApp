const CACHE_NAME = "foodnova-app-shell-v3";
const STATIC_ASSETS = [
  "/",
  "/foodnova-logo.png",
  "/favicon.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/manifest.webmanifest"
];

const isApiRequest = (url) => {
  if (url.origin !== self.location.origin) return true;
  return url.pathname.startsWith("/api") || url.pathname.startsWith("/uploads");
};

const isSensitiveRoute = (url) => {
  return [
    "/admin",
    "/checkout",
    "/cart",
    "/orders",
    "/profile",
    "/inbox",
    "/notifications",
    "/login",
    "/register"
  ].some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isApiRequest(url) || isSensitiveRoute(url)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (request.destination === "image" || request.destination === "font" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
