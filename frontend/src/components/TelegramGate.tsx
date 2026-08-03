import { useState } from 'react';
import { BOT_USERNAME, BOT_APP_NAME } from '@/lib/botConfig';

const DISMISS_KEY = 'khgo-telegram-banner-dismissed';

function getMiniAppLink(): string {
  if (BOT_USERNAME && BOT_APP_NAME) return `https://t.me/${BOT_USERNAME}/${BOT_APP_NAME}`;
  if (BOT_USERNAME) return `https://t.me/${BOT_USERNAME}`;
  return 'https://telegram.org/';
}

/**
 * Ненав'язливий банер, що пропонує відкрити Kharkiv GO як Telegram Mini App,
 * коли застосунок працює у звичайному браузері (наприклад, на GitHub Pages).
 *
 * На відміну від попередньої версії, застосунок ПОВНІСТЮ функціональний і
 * поза Telegram — карта, маршрути, обране й історія працюють локально
 * (localStorage/IndexedDB) без бекенду. Telegram лише додає персональний
 * профіль і кнопку "Відкрити в Telegram", тож блокувати основний інтерфейс
 * немає причин: це ламало б сумісність із GitHub Pages.
 */
export function TelegramGate() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');
  const link = getMiniAppLink();

  if (dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl2 border border-white/60 bg-white/95 p-3 shadow-glass-lg backdrop-blur-xs animate-slide-up">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/90 shadow-glass">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-forest">
            <path d="M21.94 3.14a1.5 1.5 0 0 0-1.53-.26L2.86 9.9a1.35 1.35 0 0 0 .07 2.54l4.62 1.45 1.78 5.72a1.3 1.3 0 0 0 2.2.5l2.55-2.6 4.5 3.3a1.5 1.5 0 0 0 2.37-.9l3.02-14.4a1.5 1.5 0 0 0-.03-.87ZM9.6 14.35l-1.15 3.68-1.1-3.52 10.4-6.9-8.15 6.74Z" />
          </svg>
        </div>
        <p className="flex-1 text-xs leading-snug text-graphite/80">
          Відкрийте Kharkiv GO в Telegram, щоб отримати персональний профіль і швидкий доступ з чату.
        </p>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full bg-forest px-3 py-1.5 text-[11px] font-bold text-white shadow-glass transition hover:bg-forest-light"
        >
          Відкрити
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрити"
          className="shrink-0 text-graphite/40 hover:text-graphite"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
