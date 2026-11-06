// Service worker: makes the console installable, keeps a copy of the app shell for flaky networks,
// and shows (disguised) notifications.
const CACHE = 'gw-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/app.css', './js/accounts.js', './js/chat.js', './js/config.js', './js/core.js', './js/data.js', './js/firebase.js', './js/main.js', './js/menus.js', './js/notes-board.js', './js/pwa.js', './js/reader-extras.js', './js/reader.js', './js/render.js', './js/shell.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin files: network first (so updates arrive right away), cached copy when offline.
// Everything else (Firebase, fonts) goes straight to the network.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
// Ready for server push later: the payload only ever carries disguised text.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'api-gateway', {
    body: d.body || 'CI: 1 new change', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'gw', renotify: true,
  }));
});
