import { localRoutes, localStops } from '@/data/localData';
import type { GeoPoint } from '@/types/transport';
import type { LeaveTimePlan, SmartReminder } from '@/types/reminder';

/** Середня швидкість пішохода за замовчуванням, якщо користувач не змінював. */
export const DEFAULT_WALK_SPEED_KMH = 4.5;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Хвилини пішки з округленням вгору (краще прийти на хвилину раніше, ніж запізнитись). */
export function walkMinutes(distanceM: number, walkSpeedKmh: number): number {
  const speedMPerMin = (walkSpeedKmh * 1000) / 60;
  return Math.max(1, Math.ceil(distanceM / Math.max(speedMPerMin, 1)));
}

/**
 * Найближчий рейс обраного маршруту від зупинки посадки, рахуючи від "зараз".
 * Використовує ту саму детерміновану симуляцію інтервалів руху, що й
 * `localStops.getArrivals` (єдине джерело правди для ETA на всій сторінці зупинки).
 */
export function getNextDepartureMinutes(routeId: string, stopId: string): number | null {
  const arrivals = localStops.getArrivals(stopId);
  const match = arrivals.find((a) => a.routeId === routeId);
  return match ? match.etaMinutes : null;
}

/**
 * Рахує повний план "коли виходити" для нагадування станом на поточний момент:
 * скільки йти пішки до зупинки посадки, коли їде обраний маршрут, і коли,
 * власне, треба вийти з дому, щоб встигнути. Викликається періодично
 * планувальником (useDepartureReminder) — тому "перебудова маршруту" при
 * запізненні відбувається сама собою: наступний виклик просто підхопить
 * наступний рейс, бо etaMinutes рахується від нового "зараз".
 */
export function computeLeavePlan(reminder: SmartReminder, now: Date = new Date()): LeaveTimePlan | null {
  const route = localRoutes.getById(reminder.routeId);
  if (!route) return null;

  const walkM = walkMinutes(reminder.home.walkDistanceM, reminder.walkSpeedKmh);

  const etaMinutes = getNextDepartureMinutes(reminder.routeId, reminder.home.stopId);
  if (etaMinutes === null) return null;

  const departsAt = new Date(now.getTime() + etaMinutes * 60_000);
  const leaveAt = new Date(departsAt.getTime() - walkM * 60_000);
  const minutesUntilLeave = Math.round((leaveAt.getTime() - now.getTime()) / 60_000);

  return {
    reminder,
    walkMinutes: walkM,
    departure: { etaMinutes, departsAt },
    leaveAt,
    minutesUntilLeave
  };
}

/** Чи нагадування взагалі має бути активним зараз (день тижня + часове вікно). */
export function isReminderInWindow(reminder: SmartReminder, now: Date = new Date()): boolean {
  if (!reminder.enabled) return false;
  if (!reminder.activeDays.includes(now.getDay())) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = reminder.windowStart.split(':').map(Number);
  const [endH, endM] = reminder.windowEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function formatMinutesUntil(minutes: number): string {
  if (minutes <= 0) return 'зараз';
  if (minutes < 60) return `${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} год` : `${h} год ${m} хв`;
}
