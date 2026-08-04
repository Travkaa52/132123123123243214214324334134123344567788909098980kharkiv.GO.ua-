import { assetUrl } from '@/lib/assetUrl';

export interface NotificationItem {
  id: string;
  channel: string;
  channelTitle: string;
  text: string;
  date: string;
  link: string;
  hasMedia: boolean;
  /** Чи це репост з іншого каналу (наявне лише якщо парсер це визначив). */
  isForwarded?: boolean;
  /** К-сть переглядів поста, як показує t.me/s/ (напр. "18.2K"), якщо є. */
  views?: string | null;
  /**
   * Класифікація повідомлення від офіційного каналу метрополітену
   * (@kh_metro): "alert" — термінове оголошення (зупинка/обмеження руху,
   * закриття станції, повітряна тривога тощо), "info" — звичайна новина.
   * Для інших каналів не заповнюється.
   */
  kind?: 'alert' | 'info';
  /** Id ліній метро (route-metro-1/2/3), згаданих у тексті, якщо визначено. */
  lineIds?: string[];
}

interface NotificationsFeed {
  updatedAt: string;
  items: NotificationItem[];
}

/**
 * Стрічка сповіщень генерується GitHub Actions (scripts/parse-telegram-channels.mjs,
 * .github/workflows/telegram-notifications.yml) окремо, без жодного бекенда:
 * скрипт читає ПУБЛІЧНІ прев'ю-сторінки Telegram-каналів (t.me/s/<канал>,
 * без входу в акаунт) і комітить готовий public/data/notifications.json назад
 * у репозиторій. Vite сам роздає цей файл як звичайний статичний файл, тому
 * тут просто fetch — жодних заголовків авторизації, initData тощо.
 *
 * VITE_NOTIFICATIONS_URL можна задати, якщо фронтенд і файл живуть не в
 * одному деплої (наприклад, файл роздається з іншого домену/GitHub Pages).
 * За замовчуванням використовується assetUrl() (див. lib/assetUrl.ts) —
 * а не жорстко "/data/...", бо GitHub Pages для репозиторіїв виду
 * <user>.github.io/<repo>/ роздає сайт з підпапки, абсолютний шлях від
 * кореня домену повернув би 404.
 */
export async function fetchNotifications(): Promise<NotificationItem[] | null> {
  const url = import.meta.env.VITE_NOTIFICATIONS_URL || assetUrl('data/notifications.json');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as NotificationsFeed;
    return Array.isArray(data.items) ? data.items : null;
  } catch {
    return null;
  }
}
