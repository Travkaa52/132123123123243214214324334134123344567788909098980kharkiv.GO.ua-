import { getTelegramWebApp } from '@/lib/telegram';
import { BOT_USERNAME } from '@/lib/botConfig';

/**
 * Немає бекенду (GitHub Pages + Actions) — замість POST-запиту ми відкриваємо
 * чат із ботом у Telegram із заздалегідь заповненим текстом (deep link
 * t.me/<bot>?text=...). Користувач сам тисне "Надіслати" в Telegram — так
 * з'являється звичайне повідомлення боту, яке забирає scripts/process-telegram-bot.mjs
 * (запускається за розкладом через GitHub Actions).
 *
 * Адмін відповідає користувачу звичайним Reply прямо в Telegram — відповідь
 * приходить користувачу особистим повідомленням від бота. Окремого екрану
 * "історія листування" в застосунку немає (немає бекенду, який міг би
 * безпечно віддавати приватне листування конкретного користувача) —
 * вся розмова відбувається нативно в чаті Telegram.
 */
export function openSupportChat(message: string): { ok: true } | { ok: false; reason: 'not-configured' } {
  const text = `#support# ${message.trim()}`;
  const url = `https://t.me/${BOT_USERNAME}?text=${encodeURIComponent(text)}`;
  const tg = getTelegramWebApp();

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return { ok: true };
}
