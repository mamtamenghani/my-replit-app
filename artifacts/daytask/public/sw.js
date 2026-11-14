self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { message: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification('Megatronics Day Task', {
    body: payload.message || 'A task was updated',
    icon: new URL('megatronics-icon-192.png', self.registration.scope).href,
    tag: 'daytask-' + (payload.id || Date.now()),
    data: { url: self.registration.scope + 'dashboard' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
