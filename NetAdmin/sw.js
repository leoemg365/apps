/* sw.js - Service Worker de NetAdmin
 * - Precarga el shell de la app para que abra sin conexión.
 * - Navegación: red primero, caché como respaldo.
 * - Estáticos propios y CDN: caché primero + revalidación en segundo plano.
 * - La API de GitHub NO se cachea aquí: la app la maneja con ETag en localStorage.
 */
const VERSION = 'netadmin-v19-1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './recientes.js',
  './modalupdate.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll falla entero si un recurso falla: se guardan uno por uno.
      await Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre !== SHELL_CACHE && nombre !== RUNTIME_CACHE)
          .map((nombre) => caches.delete(nombre))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** Caché primero y actualización en segundo plano. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const red = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await red;
  return response || Response.error();
}

/** Red primero, con respaldo en caché (para navegación). */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('./index.html')) || (await cache.match('./'));
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // GitHub API: la app la controla con ETag; el SW no la toca.
  if (url.hostname === 'api.github.com') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
