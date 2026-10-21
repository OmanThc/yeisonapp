/* Service Worker: permite que la app cargue sin conexión y sea instalable en Chrome.
   También recibe los avisos push de Firebase (FCM) cuando la app está cerrada. */
const CACHE_NAME = 'estacionamiento-maroa-v11';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Instalar: precachear el "esqueleto" de la app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches antiguas y tomar el control de inmediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia:
//  - Navegación / HTML / manifest → RED PRIMERO (siempre trae la última versión,
//    y si no hay internet usa la copia guardada). Así las actualizaciones llegan solas.
//  - Recursos estáticos (iconos) → CACHÉ PRIMERO (rápido y funciona offline).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // No interceptar otros orígenes (CDNs de Tailwind/Firebase/fuentes)
  if (url.origin !== self.location.origin) return;

  const esDocumento =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('manifest.json');

  if (esDocumento) {
    // Red primero, caché como respaldo sin conexión
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Estáticos: caché primero
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

// ===========================================================================
// AVISOS PUSH (Firebase Cloud Messaging)
// Este es el ÚNICO service worker registrado, así que es el que recibe el
// evento "push" cuando la app está en segundo plano o totalmente cerrada.
// ===========================================================================
self.addEventListener('push', (event) => {
  let datos = {};
  let notificacion = {};

  try {
    const crudo = event.data ? event.data.json() : {};
    datos = crudo.data || {};
    notificacion = crudo.notification || {};
  } catch (e) {
    try {
      datos = event.data ? event.data.text() : {};
    } catch (e2) { /* sin datos */ }
  }

  const titulo = notificacion.title || datos.title || '💳 Nuevo pago reportado';
  const cuerpo = notificacion.body || datos.body || 'Un residente reportó un pago de estacionamiento.';

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: datos.id || 'pago-nuevo',
      renotify: true,
      vibrate: [120, 60, 120],
      data: { url: './index.html?vista=admin', id: datos.id || '' }
    })
  );
});

// Al tocar el aviso, abrir la app (en el panel del administrador si puede)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || './index.html?vista=admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const c of clientes) {
        if ('focus' in c) {
          c.postMessage({ tipo: 'aviso-pago', id: (event.notification.data && event.notification.data.id) || '' });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
