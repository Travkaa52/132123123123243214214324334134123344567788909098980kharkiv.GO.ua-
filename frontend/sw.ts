/// <reference lib="webworker" />
/**
 * Власний сервіс-воркер (Workbox injectManifest).
 * ---------------------------------------------------------------------
 * Навіщо власний sw.ts, а не стандартний generateSW з vite-plugin-pwa:
 *  1. Потрібен ПОВНИЙ контроль над стратегією кешування HTML-документа
 *     (навігацій) — саме застаріла закеширована `index.html`, що вказувала
 *     на вже видалені після редеплою хеші JS-чанків, і була причиною
 *     "чорного екрана" (див. lazyWithRetry.ts). Тому тут HTML отримує
 *     NetworkFirst із коротким таймаутом і офлайн-фолбеком — НІКОЛИ
 *     CacheFirst.
 *  2. Хешовані асети (JS/CSS з /assets/*-HASH.js) можна кешувати
 *     агресивно (CacheFirst) — їхній вміст ніколи не змінюється під
 *     тим самим ім'ям файлу, це прибирає зайві мережеві запити повторно.
 *  3. Окремі стратегії для зображень/іконок і для зовнішніх тайлів карти.
 *
 * Результат: застосунок відкривається офлайн (раніше відвідані сторінки,
 * іконки, дані маршрутів/зупинок, тайли карти — з кешу), а онлайн —
 * завжди підвантажує свіжий index.html, тому проблема "старий index.html
 * тягне видалені чанки" більше не повториться.
 */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  // vite-plugin-pwa (injectManifest) підставляє сюди список файлів для
  // прекешування на етапі білда — типу за замовчуванням у ServiceWorkerGlobalScope нема.
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ---------------------------------------------------------------------------
// Precache (список файлів і їхні ревізії підставляє vite-plugin-pwa на білді)
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ---------------------------------------------------------------------------
// Навігації (HTML) — NetworkFirst: спершу мережа (щоб завжди отримати
// актуальний index.html з правильними посиланнями на чанки), і лише якщо
// мережі немає — офлайн-фолбек із precache.
// ---------------------------------------------------------------------------
const offlineFallbackUrl = `${self.registration.scope}offline.html`;

const navigationHandler = new NetworkFirst({
  cacheName: 'pages-cache',
  networkTimeoutSeconds: 4,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      try {
        const response = await navigationHandler.handle({ event, request: req });
        if (response) return response;
        throw new Error('no-response');
      } catch {
        const cached = await self.caches.match(offlineFallbackUrl);
        return cached ?? Response.error();
      }
    })()
  );
});

// Реєструємо той самий handler і як NavigationRoute — для сумісності з
// іншими місцями Workbox, що очікують navigationRoute (нешкідливо дублює
// вище, спрацьовує лише якщо перший listener чомусь не відповів).
registerRoute(new NavigationRoute(createHandlerBoundToURL(offlineFallbackUrl), { denylist: [/^\/api\//] }));

// ---------------------------------------------------------------------------
// Хешовані JS/CSS-асети — CacheFirst. Ім'я файлу містить хеш вмісту, тож
// той самий URL завжди повертає той самий байткод — сміливо кешуємо надовго.
// ---------------------------------------------------------------------------
registerRoute(
  ({ request, url }) =>
    (request.destination === 'script' || request.destination === 'style') && /-[\w-]{6,}\.(js|css)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-resources-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// ---------------------------------------------------------------------------
// Зображення, іконки, шрифти — CacheFirst з обмеженням розміру кешу.
// ---------------------------------------------------------------------------
registerRoute(
  ({ request }) => ['image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'images-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 })
    ]
  })
);

// ---------------------------------------------------------------------------
// Дані застосунку (JSON з /assets або /data — розклади, зупинки, маршрути) —
// StaleWhileRevalidate: миттєво віддаємо з кешу (працює офлайн), і паралельно
// тихо оновлюємо кеш у фоні, якщо є мережа.
// ---------------------------------------------------------------------------
registerRoute(
  ({ url, request }) => request.destination === '' && url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({
    cacheName: 'app-data-cache',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
  })
);

// ---------------------------------------------------------------------------
// Тайли карти (зовнішній хост) — як і було раніше: CacheFirst з місячним TTL.
// ---------------------------------------------------------------------------
registerRoute(
  ({ url }) => url.hostname === 'tiles.openfreemap.org',
  new CacheFirst({
    cacheName: 'map-tiles-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// ---------------------------------------------------------------------------
// Керування версіями/оновленнями: нова версія sw активується одразу, тільки-но
// сторінка попросить про це (через postMessage від UI, напр. кнопка "Оновити"),
// а не сама собою — щоб не перезавантажувати застосунок непомітно під час
// активної роботи користувача (планування маршруту, відкрита картка станції).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Push-сповіщення про затримки (FCM webpush). Firebase JS SDK НЕ ставить свій
// обробник автоматично, якщо ми не використовуємо firebase-messaging-sw.js —
// тож без цього listener'а браузер отримує push, але ніхто не викликає
// showNotification(), і сповіщення просто зникає в нікуди.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: any;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  // FCM кладе показувані поля або в payload.notification (webpush notification),
  // або (для суто data-повідомлень) лише в payload.data — підстраховуємось під обидва.
  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'Kharkiv GO — затримка руху';
  const body = notification.body || data.body || '';
  const url = data.url || notification.click_action || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.routeNumber ? `delay-${data.routeNumber}` : 'delay-alert',
      renotify: true,
      data: { url }
    })
  );
});

// Клік по сповіщенню — фокусуємо вже відкриту вкладку застосунку, якщо є,
// інакше відкриваємо нову на потрібному маршруті.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await (client as WindowClient).navigate(url);
            } catch {
              // ігноруємо — фокус вже спрацював
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', () => {
  // Нову версію встановлюємо одразу, але переходимо в дію лише за SKIP_WAITING.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
