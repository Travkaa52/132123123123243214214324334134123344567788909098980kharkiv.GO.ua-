import { getTelegramWebApp } from '@/lib/telegram';
import { BOT_USERNAME } from '@/lib/botConfig';
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
 * Готові варіанти коментаря — щоб не набирати текст руками. Тап замість
 * клавіатури: більшість скарг однакові за суттю ("немає Х хвилин",
 * "переповнений" тощо), тож обираємо з кнопок.
 */
export const QUICK_COMMENTS = [
  'Немає вже 10+ хв',
  'Немає вже 20+ хв',
  'Переповнений, не влізти',
  'Проїхав повз зупинку',
  'Зійшов з маршруту достроково'
] as const;

const COOLDOWN_STORAGE_KEY = 'khgo:delay-reports:recent';
const COOLDOWN_MS = 10 * 60 * 1000; // 10 хв — щоб не дублювати одну й ту саму скаргу поспіль

function recentKey(kind: TransportKind | null, routeNumber: string): string {
  return `${kind ?? '_'}::${routeNumber.trim().toLowerCase()}`;
}

function readRecentMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeRecentMap(map: Record<string, number>) {
  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage недоступний (приватний режим тощо) — не критично, просто без кулдауну
  }
}

/**
 * Скільки хвилин тому користувач востаннє повідомляв про затримку саме цього
 * маршруту (з цього пристрою) — або null, якщо ще не повідомляв / кулдаун
 * вже минув. Використовується лише для дружнього попередження в UI, не
 * блокує відправку жорстко.
 */
export function minutesSinceLastReport(kind: TransportKind | null, routeNumber: string): number | null {
  if (!routeNumber.trim()) return null;
  const map = readRecentMap();
  const ts = map[recentKey(kind, routeNumber)];
  if (!ts) return null;
  const elapsed = Date.now() - ts;
  if (elapsed > COOLDOWN_MS) return null;
  return Math.max(0, Math.round(elapsed / 60000));
}

function markReported(kind: TransportKind | null, routeNumber: string) {
  const map = readRecentMap();
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const key of Object.keys(map)) {
    if (map[key] < cutoff) delete map[key];
  }
  map[recentKey(kind, routeNumber)] = Date.now();
  writeRecentMap(map);
}

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
  const kindTag = input.kind ?? '_';
  const kindLabel = input.kind ? KIND_LABELS[input.kind] : 'Транспорт';

  let text = `#delay:${kindTag}:${input.routeNumber.trim() || '—'}# 🚨 Затримка транспорту\nВид: ${kindLabel}\nМаршрут: ${input.routeNumber.trim() || '—'}`;
  if (input.stopName?.trim()) text += `\nЗупинка: ${input.stopName.trim()}`;
  if (input.comment?.trim()) text += `\nКоментар: ${input.comment.trim()}`;

  const url = `https://t.me/${BOT_USERNAME}?text=${encodeURIComponent(text)}`;
  const tg = getTelegramWebApp();

  tg?.HapticFeedback?.impactOccurred('medium');

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  markReported(input.kind, input.routeNumber);

  return { ok: true };
}
