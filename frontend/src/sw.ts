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
const scopeUrl = self.registration.scope;
const indexUrl = `${scopeUrl}index.html`;
const offlineFallbackUrl = `${scopeUrl}offline.html`;

const navigationHandler = new NetworkFirst({
  cacheName: 'pages-cache',
  // 4с раніше було замало для "холодного" відкриття НОВОЇ вкладки в
  // зовнішньому браузері (саме так відкривається /install-app з кнопки в
  // профілі) — DNS + TLS-рукостискання + перший запит на мобільній мережі
  // легко перевищують 4с навіть при робочому інтернеті, і замість реальної
  // сторінки користувач бачив "Немає з'єднання з інтернетом".
  networkTimeoutSeconds: 8,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
});

// Прекешований index.html (SPA-оболонка) як SPA-фолбек — окремий handler,
// прив'язаний ІМЕННО до precache-запису (а не до pages-cache з попередніх
// відвідувань), тож він гарантовано доступний з першого встановлення SW,
// а не лише для сторінок, які вже колись успішно відкривались онлайн.
const shellHandler = createHandlerBoundToURL(indexUrl);

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
        // ГОЛОВНИЙ ФІКС: до того, як показати "офлайн" — пробуємо
        // віддати кешовану SPA-оболонку (index.html + вже завантажені
        // JS/CSS-чанки). Це САМЕ ТОЙ ФАЙЛ, з якого React Router клієнтськи
        // рендерить БУДЬ-ЯКИЙ маршрут застосунку (/install-app, /route/42,
        // /stop/15 тощо) — тож навіть коли мережа справді недоступна або
        // просто забракло 8с на відповідь конкретно ЦІЄЇ адреси, сам
        // застосунок все одно відкриється і покаже потрібну сторінку.
        // Раніше для БУДЬ-ЯКОЇ адреси, яку не встигли/не змогли закешувати
        // саме під її власним URL раніше (а нова сторінка типу
        // "/install-app" ще не встигла туди потрапити), користувач бачив
        // тупикову заглушку "ця сторінка ще не завантажувалась раніше",
        // хоча сам застосунок (JS-бандл) уже давно лежав у кеші.
        try {
          const shell = await shellHandler({ event, request: new Request(indexUrl) });
          if (shell) return shell;
        } catch {
          // якщо навіть прекеш недоступний (щойно встановлений SW, ще
          // не пройшов install) — падаємо далі, на офлайн-заглушку.
        }

        const cachedOffline = await self.caches.match(offlineFallbackUrl);
        return cachedOffline ?? Response.error();
      }
    })()
  );
});

// Реєструємо той самий handler і як NavigationRoute — для сумісності з
// іншими місцями Workbox, що очікують navigationRoute (нешкідливо дублює
// вище, спрацьовує лише якщо перший listener чомусь не відповів).
registerRoute(new NavigationRoute(shellHandler, { denylist: [/^\/api\//] }));

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
