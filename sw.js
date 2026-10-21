/* Service Worker: permite que la app cargue sin conexión y sea instalable en Chrome */
const CACHE_NAME = 'estacionamiento-maroa-v9';

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
