const CACHE = 'casita-v1.0.6';
const STATIC = [
  '/',
  '/styles.css',
  '/theme-cocina.css',
  '/theme-mercado.css',
  '/theme-nocturno.css',
  '/js/version.js',
  '/js/core.js',
  '/js/utils.js',
  '/js/inicio.js',
  '/js/pendientes.js',
  '/js/mandado-despensa.js',
  '/js/recetas.js',
  '/js/proyectos.js',
  '/js/chat-voz.js',
  '/js/scan-ticket.js',
  '/js/ajustes.js',
  '/js/notificaciones.js',
  '/app.js',
  '/icons/logo.png',
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', ev => {
  if (!ev.data) return;
  const data = ev.data.json();
  ev.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      data: data.data || {},
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  ev.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/.netlify/')) return;
  if (!['http:', 'https:'].includes(url.protocol)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
