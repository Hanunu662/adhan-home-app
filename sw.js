// Adhan Home service worker: lets the desktop/browser version open offline and load fast.
// App files have hashed names, so they're cached forever; the page itself is
// fetched fresh when online and served from cache when offline.
const VERSION = 'adhan-home-v77';
const BASE = '/adhan-home-app';
const SHELL = [BASE + '/', BASE + '/manifest.webmanifest', BASE + '/icons/icon-192.png', BASE + '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Hashed app files and fonts never change, so they live in their own cache that survives updates:
// after a new version only the files that actually changed are downloaded again.
const ASSETS = 'adhan-home-assets';
const KEEP_ASSETS = 300;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== ASSETS).map((k) => caches.delete(k))))
      // Old versions' files pile up; keep the newest few hundred.
      .then(() => caches.open(ASSETS))
      .then((c) => c.keys().then((reqs) => Promise.all(reqs.slice(0, Math.max(0, reqs.length - KEEP_ASSETS)).map((r) => c.delete(r)))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Quran text and audio handle their own caching

  // Pages: the newest page if the network answers quickly, otherwise the saved one straight away
  // (so a slow connection never leaves a blank screen), updating the saved copy in the background.
  if (req.mode === 'navigate') {
    const fresh = fetch(req).then((res) => {
      if (res.ok || res.status === 404) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(BASE + '/', copy));
      }
      return res;
    });
    event.respondWith(
      caches.match(BASE + '/').then((saved) => {
        if (!saved) return fresh;
        const late = new Promise((resolve) => setTimeout(() => resolve(saved), 1500));
        return Promise.race([fresh.catch(() => saved), late]);
      }),
    );
    event.waitUntil(fresh.then(() => undefined, () => undefined));
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
              caches.open(ASSETS).then((c) => c.put(req, copy));
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
