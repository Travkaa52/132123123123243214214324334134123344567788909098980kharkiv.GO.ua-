import type { TransportKind } from '@/types/transport';
import { assetUrl } from '@/lib/assetUrl';

export interface RouteAlert {
  id: number;
  kind: TransportKind | null;
  routeNumber: string;
  message: string;
  createdAt: number; // unix seconds
  expiresAt: number; // unix seconds
  source?: 'manual' | 'auto';
}

interface RouteAlertsFeed {
  updatedAt: string | null;
  items: RouteAlert[];
}

/**
 * Активні оголошення про затримку транспорту. Немає бекенду (застосунок на
 * GitHub Pages) — файл генерується і комітиться в репозиторій воркфлоу
 * .github/workflows/telegram-bot.yml (scripts/process-telegram-bot.mjs),
 * так само як public/data/notifications.json для каналів. Тут просто fetch
 * звичайного статичного JSON, жодних заголовків авторизації не потрібно.
 *
 * VITE_ROUTE_ALERTS_URL можна задати, якщо файл роздається з іншого домену
 * (напр. фронтенд і дані живуть в різних деплоях). За замовчуванням
 * використовується assetUrl() (див. lib/assetUrl.ts) — важливо саме так,
 * а не жорстко "/data/...", бо GitHub Pages для репозиторіїв виду
 * <user>.github.io/<repo>/ роздає сайт з підпапки: абсолютний шлях від
 * кореня домену повернув би 404.
 */
export async function fetchRouteAlerts(): Promise<RouteAlert[]> {
  const url = import.meta.env.VITE_ROUTE_ALERTS_URL || assetUrl('data/route-alerts.json');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as RouteAlertsFeed;
    const now = Date.now() / 1000;
    return Array.isArray(data.items) ? data.items.filter((a) => a.expiresAt > now) : [];
  } catch {
    return [];
  }
}

/** Знаходить активне оголошення для конкретного маршруту (номер + вид транспорту). */
export function findAlertForRoute(
  alerts: RouteAlert[],
  routeNumber: string,
  kind?: TransportKind | null
): RouteAlert | undefined {
  return alerts.find((a) => a.routeNumber === routeNumber && (a.kind == null || a.kind === kind));
}
