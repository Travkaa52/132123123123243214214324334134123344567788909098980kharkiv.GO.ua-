import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

/**
 * Реєструє сервіс-воркер (src/sw.ts, injectManifest) і показує ненав'язливий
 * банер, коли готова нова версія застосунку. Навмисно НЕ оновлює мовчки —
 * sw.ts чекає повідомлення SKIP_WAITING саме від цієї кнопки: інакше
 * застосунок міг би непомітно перезавантажитись просто під час активної
 * роботи (відкрита картка маршруту, заповнена форма скарги на затримку тощо).
 */
export function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Сервіс-воркер сам не перевіряє оновлення у фоні без підказки —
      // раз на годину звіряємось із сервером, чи є нова версія.
      setInterval(() => {
        registration.update().catch(() => {
          // Немає мережі чи сервер недоступний — просто спробуємо пізніше.
        });
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Не вдалося зареєструвати сервіс-воркер:', error);
    }
  });

  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl2 border border-white/60 bg-white/95 p-3 shadow-glass-lg backdrop-blur-xs animate-slide-up">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <RefreshCw size={16} />
        </div>
        <p className="flex-1 text-xs leading-snug text-graphite/80">
          Доступна нова версія Kharkiv GO.
        </p>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-full bg-forest px-3 py-1.5 text-[11px] font-bold text-white shadow-glass transition hover:bg-forest-light"
        >
          Оновити
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Закрити"
          className="shrink-0 text-graphite/40 hover:text-graphite"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
