const SHELL_CACHE = 'megatronics-daytask-shell-v1';
const scopeUrl = self.registration.scope;
const shellUrl = new URL('./', scopeUrl).href;
const shellAssets = [
  shellUrl,
  new URL('manifest.webmanifest', scopeUrl).href,
  new URL('apple-touch-icon.png', scopeUrl).href,
  new URL('megatronics-icon-192.png', scopeUrl).href,
  new URL('megatronics-icon-512.png', scopeUrl).href,
  new URL('megatronics-icon-maskable-512.png', scopeUrl).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(shellAssets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('megatronics-daytask-') && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  const scopePath = new URL(scopeUrl).pathname;
  const isAppNavigation = request.mode === 'navigate' && url.pathname.startsWith(scopePath);
  const isBuiltAsset = url.pathname.startsWith(`${scopePath}assets/`);

  if (isAppNavigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(shellUrl, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(shellUrl)) || Response.error();
      }
    })());
    return;
  }

  // Only cache Vite's fingerprinted build files. API responses and task data
  // remain network-only so cached data can never mask a newer task status.
  if (isBuiltAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});

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
