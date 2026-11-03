// ═══════════════════════════════════════════════════════════════════════════
// SPIE North America · HSE Reporting
// Service Worker
//
// QUÉ HACE
//   Guarda una copia de la aplicación en el teléfono para que abra sin señal.
//   Eso es lo que hace que la cola de reportes sirva de algo: sin esto, un
//   técnico sin cobertura no puede ni abrir la pantalla para llenar el parte.
//
// QUÉ NO HACE, A PROPÓSITO
//   No toca ni una sola llamada al servidor. Los reportes, las fotos y los
//   catálogos van y vienen por su cuenta. Un Service Worker que se mete en
//   medio de una petición de datos es la forma más fácil de que alguien vea
//   información vieja y no se entere.
//
// EL PELIGRO DE ESTO Y CÓMO SE EVITA
//   Un Service Worker mal hecho deja a la gente clavada en una versión vieja
//   de la aplicación para siempre, y lo peor es que no se nota: la app abre,
//   funciona, y simplemente no es la última. Aquí se evita así:
//
//     · Las páginas se piden SIEMPRE a la red primero. La copia guardada solo
//       se usa si la red falla. Publicar una versión nueva basta para que
//       llegue a todos los teléfonos.
//     · La versión nueva del propio Service Worker toma el mando de
//       inmediato, sin esperar a que se cierren las pestañas.
//     · Al activarse borra las copias de versiones anteriores.
//
//   Si alguna vez hay que forzar que todos los teléfonos tiren su copia,
//   basta con cambiar el número de VERSION de aquí abajo y publicar.
// ═══════════════════════════════════════════════════════════════════════════

const VERSION = 'spie-na-hse-v1';

// Lo mínimo para que la aplicación abra sin señal. Las páginas también se
// guardan, pero se piden a la red antes de usarlas.
const BASICOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './favicon-32.png',
];

// ── Instalación ────────────────────────────────────────────────────────────
//
// Si alguno de los básicos no está (por ejemplo, un icono que todavía no se
// ha subido), se guarda lo que sí esté en vez de fallar la instalación
// entera. Un icono que falta no puede dejar la aplicación sin funcionar sin
// señal.
self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(BASICOS.map(async (url) => {
      try {
        const r = await fetch(url, { cache: 'reload' });
        if (r.ok) await cache.put(url, r);
      } catch (e) { /* ese archivo se queda fuera y ya está */ }
    }));
    await self.skipWaiting();
  })());
});

// ── Activación ─────────────────────────────────────────────────────────────
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map((n) => (n === VERSION ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

// Permite que la aplicación pida la actualización inmediata si algún día se
// quiere añadir un botón de "actualizar ahora".
self.addEventListener('message', (evento) => {
  if (evento.data === 'actualizar-ya') self.skipWaiting();
});

// ── Peticiones ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (evento) => {
  const pet = evento.request;

  // Solo GET. Un POST es un reporte saliendo: no se toca, no se guarda, no
  // se reintenta desde aquí. De la cola sin señal se encarga la aplicación,
  // que es la que sabe lo que lleva dentro.
  if (pet.method !== 'GET') return;

  const url = new URL(pet.url);

  // Nada que no sea de este mismo sitio. Supabase y las librerías externas
  // pasan de largo.
  if (url.origin !== self.location.origin) return;

  // Las páginas: red primero, copia guardada solo si la red falla.
  const esPagina = pet.mode === 'navigate' ||
                   (pet.headers.get('accept') || '').includes('text/html');

  if (esPagina) {
    evento.respondWith((async () => {
      try {
        const r = await fetch(pet);
        if (r && r.ok) {
          const cache = await caches.open(VERSION);
          cache.put(pet, r.clone());
        }
        return r;
      } catch (e) {
        const guardada = await caches.match(pet) || await caches.match('./index.html');
        if (guardada) return guardada;
        return new Response(
          '<!DOCTYPE html><meta charset="utf-8">' +
          '<body style="font-family:sans-serif;padding:24px;text-align:center">' +
          '<h2>Sin conexión</h2><p>Vuelve a abrir la aplicación cuando tengas señal.</p></body>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Lo demás (iconos): copia guardada primero, que no cambia casi nunca.
  evento.respondWith((async () => {
    const guardada = await caches.match(pet);
    if (guardada) return guardada;
    try {
      const r = await fetch(pet);
      if (r && r.ok) {
        const cache = await caches.open(VERSION);
        cache.put(pet, r.clone());
      }
      return r;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
