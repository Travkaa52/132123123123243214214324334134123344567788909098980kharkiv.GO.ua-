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

// Рядок route_alerts у Supabase (snake_case, як у таблиці supabase/schema.sql)
interface SupabaseRouteAlertRow {
  id: number;
  kind: TransportKind | null;
  route_number: string;
  message: string;
  created_at: number;
  expires_at: number;
  source?: 'manual' | 'auto';
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Активні оголошення про затримку транспорту.
 *
 * Основне джерело — таблиця route_alerts у Supabase (пише бот, дивись
 * supabase/schema.sql і bot/supabase_sync.py): анонімний ключ має право
 * лише на SELECT, дані з'являються практично одразу після дій бота, без
 * очікування коміту/редеплою.
 *
 * Якщо VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY не задані (або запит до
 * Supabase не вдався) — застосунок падає назад на статичний
 * public/data/route-alerts.json, який бот і далі оновлює як резервну копію.
 */
async function fetchFromSupabase(): Promise<RouteAlert[] | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const now = Date.now() / 1000;
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/route_alerts?select=*&expires_at=gt.${now}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as SupabaseRouteAlertRow[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      routeNumber: r.route_number,
      message: r.message,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      source: r.source
    }));
  } catch {
    return null;
  }
}

async function fetchFromStaticJson(): Promise<RouteAlert[]> {
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

export async function fetchRouteAlerts(): Promise<RouteAlert[]> {
  const fromSupabase = await fetchFromSupabase();
  if (fromSupabase !== null) return fromSupabase;
  return fetchFromStaticJson();
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
