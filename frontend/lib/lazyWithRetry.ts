import { lazy, type ComponentType } from 'react';

/**
 * Чому це потрібно
 * -----------------
 * GitHub Pages віддає статичні файли з іменами на кшталт
 * `LiveMetroPage-BkCY6fz9.js` — хеш у назві змінюється при КОЖНОМУ новому
 * деплої. Головний бандл (`index-*.js`) знає ці хеші лише станом на момент,
 * коли він сам був зібраний.
 *
 * Якщо в браузера користувача вже відкрита (або закешована) стара версія
 * `index.html`/головного бандла, а тим часом на GitHub Pages виїхав новий
 * деплой — старі файли на кшталт `LiveMetroPage-BkCY6fz9.js` вже видалені
 * (їх замінили нові з іншим хешем). Спроба лінивого `import()` такого файлу
 * дає `404 (Not Found)` і падає в консоль з
 * `Failed to fetch dynamically imported module`.
 *
 * Це і була причина "чорного екрана": React lazy() кидає цю помилку під час
 * рендеру, ErrorBoundary її ловить, але користувачу все одно потрібен НОВИЙ
 * `index.html` з актуальними хешами файлів — саме тому єдиний надійний
 * вихід тут — одне примусове перезавантаження сторінки (обов'язково НЕ по
 * кешу), яке підтягне свіжий index.html із правильними посиланнями.
 *
 * lazyWithRetry обгортає React.lazy(): якщо динамічний імпорт впав саме
 * через мережеву помилку завантаження чанка (а не через помилку всередині
 * самого компонента), він перезавантажує сторінку ОДИН РАЗ (захист від
 * нескінченного циклу — прапорець у sessionStorage), і лише якщо це не
 * допомогло — прокидає помилку далі, щоб її показав ErrorBoundary.
 */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message) ||
    /Loading chunk .* failed/i.test(error.message) ||
    /dynamically imported module/i.test(error.message)
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName: string
) {
  return lazy(async () => {
    const storageKey = `chunk-retry:${chunkName}`;
    try {
      const module = await factory();
      // Успішне завантаження — скидаємо прапорець ретраю для цього чанка.
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      const alreadyRetried = sessionStorage.getItem(storageKey) === '1';
      if (alreadyRetried) {
        // Уже перезавантажували через цей чанк і все одно впало —
        // далі показуємо повідомлення про помилку, а не зациклюємось.
        sessionStorage.removeItem(storageKey);
        throw error;
      }

      sessionStorage.setItem(storageKey, '1');
      // Примусове перезавантаження з мережі (не з кешу), щоб отримати
      // свіжий index.html із правильними хешами всіх чанків.
      window.location.reload();
      // Тримаємо Suspense у стані завантаження до фактичного перезавантаження сторінки.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
