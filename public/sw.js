/* Service worker Web Push PUSAKA: menampilkan notifikasi (termasuk di layar kunci) saat absen tercatat. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'PUSAKA';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'pusaka-absensi',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate && c.navigate(url); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
