import { getTelegramWebApp } from '@/lib/telegram';
import type { TransportKind } from '@/types/transport';

export interface DelayReportInput {
  kind: TransportKind | null;
  routeNumber: string;
  stopName?: string;
  comment: string;
}

export type DelayReportResult =
  | { ok: true }
  | { ok: false; reason: 'not-configured' };

const KIND_LABELS: Record<TransportKind, string> = {
  bus: 'Автобус',
  trolleybus: 'Тролейбус',
  tram: 'Трамвай',
  metro: 'Метро'
};

/**
 * Немає бекенду (застосунок на GitHub Pages + Actions) — тож замість POST-запиту
 * ми відкриваємо чат із ботом у Telegram із заздалегідь заповненим текстом
 * (deep link t.me/<bot>?text=...). Користувач сам тисне "Надіслати" в
 * Telegram — так з'являється звичайне повідомлення боту, яке забирає і
 * обробляє scripts/process-telegram-bot.mjs (запускається за розкладом
 * через GitHub Actions, .github/workflows/telegram-bot.yml).
 *
 * Текст починається з прихованого тегу "#delay:<kind>:<routeNumber>#", за
 * яким скрипт розпізнає структуровану скаргу (і рахує, скільки різних
 * користувачів поскаржилось на той самий маршрут) — сам тег непомітний
 * у звичайному чаті, як і будь-який текст повідомлення.
 */
export function sendDelayReport(input: DelayReportInput): DelayReportResult {
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return { ok: false, reason: 'not-configured' };
  }

  const kindTag = input.kind ?? '_';
  const kindLabel = input.kind ? KIND_LABELS[input.kind] : 'Транспорт';

  let text = `#delay:${kindTag}:${input.routeNumber.trim() || '—'}# 🚨 Затримка транспорту\nВид: ${kindLabel}\nМаршрут: ${input.routeNumber.trim() || '—'}`;
  if (input.stopName?.trim()) text += `\nЗупинка: ${input.stopName.trim()}`;
  if (input.comment?.trim()) text += `\nКоментар: ${input.comment.trim()}`;

  const url = `https://t.me/${botUsername}?text=${encodeURIComponent(text)}`;
  const tg = getTelegramWebApp();

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return { ok: true };
}
