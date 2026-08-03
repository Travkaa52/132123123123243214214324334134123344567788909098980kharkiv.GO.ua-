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

/**
 * Спеціальне значення routeNumber для "загального" оголошення — не про
 * конкретний маршрут, а про весь вид транспорту (якщо вказано kind) або
 * геть про весь розділ "Транспорт" (якщо kind не вказано). Адмін ставить
 * його командою /alert all ... або /alert all bus ... в боті.
 */
export const GENERAL_ALERT_ROUTE = 'all';

function isGeneralAlert(alert: RouteAlert): boolean {
  return String(alert.routeNumber).trim().toLowerCase() === GENERAL_ALERT_ROUTE;
}

/**
 * Знаходить активне оголошення для конкретного маршруту (номер + вид
 * транспорту). Загальні оголошення (routeNumber === "all") теж враховуються:
 * вони підсвічують будь-який маршрут відповідного виду транспорту (або взагалі
 * будь-який, якщо kind в оголошенні не вказано).
 */
export function findAlertForRoute(
  alerts: RouteAlert[],
  routeNumber: string,
  kind?: TransportKind | null
): RouteAlert | undefined {
  return alerts.find((a) => {
    if (isGeneralAlert(a)) return a.kind == null || a.kind === kind;
    return a.routeNumber === routeNumber && (a.kind == null || a.kind === kind);
  });
}

/**
 * Активні "загальні" оголошення (не привʼязані до конкретного маршруту) —
 * для банера на весь розділ транспорту чи конкретного виду транспорту.
 * Якщо передано kind — повертає загальні оголошення, які стосуються геть
 * усього транспорту (a.kind == null) АБО саме цього виду (a.kind === kind).
 */
export function findGeneralAlerts(alerts: RouteAlert[], kind?: TransportKind | null): RouteAlert[] {
  return alerts.filter((a) => isGeneralAlert(a) && (a.kind == null || kind == null || a.kind === kind));
}
