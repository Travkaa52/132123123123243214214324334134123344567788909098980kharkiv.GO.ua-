import type { TripPlan } from '@/data/localData';

/**
 * "Активна поїздка" — обраний варіант маршруту, який користувач підтвердив
 * кнопкою "В дорогу". На відміну від просто побудованого/обраного варіанту
 * (tripPlans/selectedPlanIndex у MapPage — це лише перегляд варіантів),
 * ActiveTrip живе, поки користувач фактично їде: зберігається в
 * localStorage (переживає перезавантаження сторінки/додатку) і відстежує
 * прогрес за живою геопозицією, підказуючи де сісти/пересісти/вийти.
 */
export interface ActiveTrip {
  plan: TripPlan;
  fromPoint: { lat: number; lng: number } | null;
  toPoint: { lat: number; lng: number } | null;
  startedAt: number;
  /** Індекс наступного ще не пройденого чекпоінта з buildTripCheckpoints.
   *  Зростає лише монотонно — GPS "стрибки" назад ніколи не відкочують прогрес. */
  nextCheckpointIndex: number;
}

export interface TripCheckpoint {
  kind: 'board' | 'alight' | 'destination';
  /** Індекс ділянки (leg) у plan.legs; -1 для фінальної точки призначення. */
  legIndex: number;
  lat: number;
  lng: number;
  label: string;
}

const ARRIVE_THRESHOLD_M = 40;
const STORAGE_KEY = 'kharkiv_go_active_trip_v1';

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Впорядкований список "точок маршруту", які користувач проходить по черзі:
 *  посадка → вихід (кожної ділянки) → за наявності точки "Куди" — вона ж фінальна пішохідна ціль. */
export function buildTripCheckpoints(
  plan: TripPlan,
  toPoint: { lat: number; lng: number } | null
): TripCheckpoint[] {
  const checkpoints: TripCheckpoint[] = [];
  plan.legs.forEach((leg, i) => {
    checkpoints.push({
      kind: 'board',
      legIndex: i,
      lat: leg.boardStop.position.lat,
      lng: leg.boardStop.position.lng,
      label: leg.boardStop.name
    });
    checkpoints.push({
      kind: 'alight',
      legIndex: i,
      lat: leg.alightStop.position.lat,
      lng: leg.alightStop.position.lng,
      label: leg.alightStop.name
    });
  });
  if (toPoint) {
    checkpoints.push({ kind: 'destination', legIndex: -1, lat: toPoint.lat, lng: toPoint.lng, label: 'пункту призначення' });
  }
  return checkpoints;
}

export function startActiveTrip(
  plan: TripPlan,
  fromPoint: { lat: number; lng: number } | null,
  toPoint: { lat: number; lng: number } | null
): ActiveTrip {
  return { plan, fromPoint, toPoint, startedAt: Date.now(), nextCheckpointIndex: 0 };
}

/** Просуває прогрес поїздки відповідно до поточної позиції. Повертає той
 *  самий об'єкт trip, якщо прогрес не змінився (щоб не тригерити зайві
 *  ререндери/записи в сховище), інакше — оновлений trip і список
 *  чекпоінтів, які саме щойно "пройдені" в цьому виклику (для тостів). */
export function advanceTripProgress(
  trip: ActiveTrip,
  checkpoints: TripCheckpoint[],
  position: { lat: number; lng: number } | null
): { trip: ActiveTrip; justReached: TripCheckpoint[] } {
  if (!position) return { trip, justReached: [] };

  let idx = trip.nextCheckpointIndex;
  const justReached: TripCheckpoint[] = [];
  while (idx < checkpoints.length) {
    const cp = checkpoints[idx];
    const d = distanceMeters(position.lat, position.lng, cp.lat, cp.lng);
    if (d <= ARRIVE_THRESHOLD_M) {
      justReached.push(cp);
      idx += 1;
    } else {
      break;
    }
  }

  if (idx === trip.nextCheckpointIndex) return { trip, justReached: [] };
  return { trip: { ...trip, nextCheckpointIndex: idx }, justReached };
}

export function isTripComplete(trip: ActiveTrip, checkpoints: TripCheckpoint[]): boolean {
  return checkpoints.length > 0 && trip.nextCheckpointIndex >= checkpoints.length;
}

export function currentTripTarget(trip: ActiveTrip, checkpoints: TripCheckpoint[]): TripCheckpoint | null {
  return checkpoints[trip.nextCheckpointIndex] ?? null;
}

/** Коротка інструкція "що робити зараз" для панелі активної поїздки. */
export function describeTarget(trip: ActiveTrip, target: TripCheckpoint): string {
  const leg = target.legIndex >= 0 ? trip.plan.legs[target.legIndex] : null;
  if (target.kind === 'board' && leg) {
    return `Прямуйте до зупинки «${target.label}» і сідайте на №${leg.route.number} → ${leg.headsign}`;
  }
  if (target.kind === 'alight' && leg) {
    const isLastLeg = target.legIndex === trip.plan.legs.length - 1;
    return isLastLeg
      ? `Їдьте до зупинки «${target.label}» — там виходити`
      : `Їдьте до зупинки «${target.label}» — там пересадка`;
  }
  return 'Йдіть пішки до пункту призначення';
}

/** Повідомлення-тост у момент, коли checkpoint щойно пройдено (для
 *  пересадки/посадки) — null, якщо для цього чекпоінта підказка не потрібна. */
export function describeReached(trip: ActiveTrip, cp: TripCheckpoint): string | null {
  if (cp.kind === 'board') {
    const leg = trip.plan.legs[cp.legIndex];
    return `Посадка на маршрут №${leg.route.number} на «${cp.label}»`;
  }
  if (cp.kind === 'alight') {
    const isLastLeg = cp.legIndex === trip.plan.legs.length - 1;
    if (!isLastLeg) {
      const nextLeg = trip.plan.legs[cp.legIndex + 1];
      return `Пересадка! Вийдіть на «${cp.label}» і сідайте на №${nextLeg.route.number} → ${nextLeg.headsign}`;
    }
    return `Виходьте на «${cp.label}» — це ваша зупинка`;
  }
  return null;
}

export function loadActiveTrip(): ActiveTrip | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTrip;
    if (!parsed?.plan?.legs?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveTrip(trip: ActiveTrip | null) {
  try {
    if (trip) localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // quota exceeded or private mode — просто не зберігаємо
  }
}
