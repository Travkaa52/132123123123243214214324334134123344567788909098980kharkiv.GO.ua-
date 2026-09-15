import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

interface Changelog {
  version?: string;
  date?: string;
  changes: string[];
}

/**
 * Реєструє сервіс-воркер (src/sw.ts, injectManifest) і показує ненав'язливий
 * банер, коли готова нова версія застосунку. Навмисно НЕ оновлює мовчки —
 * sw.ts чекає повідомлення SKIP_WAITING саме від цієї кнопки: інакше
 * застосунок міг би непомітно перезавантажитись просто під час активної
 * роботи (відкрита картка маршруту, заповнена форма скарги на затримку тощо).
 */
export function PwaUpdateBanner() {
  const [showModal, setShowModal] = useState(false);
  const [changelog, setChangelog] = useState<Changelog | null>(null);

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

  // Завантажуємо чейнджлог, коли з'являється оновлення
  useEffect(() => {
    if (needRefresh) {
      fetch(`/changelog.json?t=${Date.now()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Changelog) => {
          if (data && Array.isArray(data.changes)) {
            setChangelog(data);
          }
        })
        .catch(() => {
          // Якщо файлу немає або помилка мережі — залишаємо changelog = null
        });
    }
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <>
      {/* Верхній ненав'язливий банер */}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center px-3">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl2 border border-white/60 bg-white/95 p-3 shadow-glass-lg backdrop-blur-xs animate-slide-up">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <RefreshCw size={16} />
          </div>

          <div className="flex flex-1 flex-col">
            <p className="text-xs leading-snug text-graphite/80">
              Доступна нова версія Kharkiv GO.
            </p>
            {changelog && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="mt-0.5 self-start text-[11px] font-medium text-forest underline hover:text-forest-light"
              >
                Переглянути зміни
              </button>
            )}
          </div>

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

      {/* Модальне вікно списку змін */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/95 p-5 shadow-glass-lg backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-graphite/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest/10 text-forest">
                  <Sparkles size={16} />
                </div>
                <h3 className="text-sm font-bold text-graphite">
                  Що нового {changelog?.version ? `v${changelog.version}` : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-full p-1 text-graphite/40 hover:bg-graphite/5 hover:text-graphite"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="my-4 max-h-60 space-y-2 overflow-y-auto pr-1 text-xs text-graphite/80">
              {changelog?.changes.map((change, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                  <span className="leading-relaxed">{change}</span>
                </li>
              ))}
            </ul>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  updateServiceWorker(true);
                }}
                className="flex-1 rounded-full bg-forest py-2 text-xs font-bold text-white shadow-glass transition hover:bg-forest-light"
              >
                Оновити зараз
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
