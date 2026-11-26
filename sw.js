// Adhan Home service worker: lets the desktop/browser version open offline and load fast.
// App files have hashed names, so they're cached forever; the page itself is
// fetched fresh when online and served from cache when offline.
const VERSION = 'adhan-home-v49';
const BASE = '/adhan-home-app';
const SHELL = [BASE + '/', BASE + '/manifest.webmanifest', BASE + '/icons/icon-192.png', BASE + '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Quran text and audio handle their own caching

  // Pages: network first, fall back to the cached app.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(BASE + '/', copy));
          return res;
        })
        .catch(() => caches.match(BASE + '/')),
    );
    return;
  }

  // Hashed app files, fonts and images: cache first.
  if (url.pathname.startsWith(BASE + '/_expo/') || url.pathname.startsWith(BASE + '/assets/') || url.pathname.startsWith(BASE + '/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Clicking a prayer notification brings the app forward.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(BASE + '/');
    }),
  );
});
