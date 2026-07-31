import { TransportKind } from '@/types/transport';
import routesRealJson from './routesReal.json';
import stopsRealJson from './stopsReal.json';
import { metroStopsData, metroRoutesData, METRO_INTERCHANGES } from './metroStationsReal';

/**
 * Реальні дані маршрутів і зупинок Харкова, розшифровані з офіційних
 * KML-схем (src/assets/marshryt transporty kharkiv/marshryt troleybus,
 * marshryt tramway) та реальних розкладів руху
 * (assets/rozklad ryhy trolley, assets/rozklad ryhy tramway).
 *
 * Жодних вигаданих/рівномірно розставлених зупинок — тільки точні
 * координати та назви з першоджерела. Інтервал руху та перший/останній
 * рейс обчислені з реальних розкладів по кожному маршруту.
 */

export interface RouteItem {
  id: string;
  kind: TransportKind;
  number: string;
  name: string;
  color: string;
  stopIds: string[];
  headsignForward: string;
  headsignBackward: string;
  schedule: any[];
  firstDeparture: string;
  lastDeparture: string;
  intervalMinutes: number;
}

export interface StopItem {
  id: string;
  name: string;
  kinds: TransportKind[];
  position: {
    lat: number;
    lng: number;
  };
  routeIds: string[];
}

interface RealRoute {
  id: string;
  kind: TransportKind;
  number: string;
  name: string;
  color: string;
  headsignForward: string;
  headsignBackward: string;
  firstDeparture: string;
  lastDeparture: string;
  intervalMinutes: number;
  stopIdsForward: string[];
  stopIdsBackward: string[];
}

const REAL_ROUTES = routesRealJson as unknown as RealRoute[];
const REAL_STOPS = stopsRealJson as unknown as StopItem[];

const stopsMap = new Map<string, StopItem>();
REAL_STOPS.forEach((s) => stopsMap.set(s.id, s));
// Станції метро (з KML, координати + українські назви) — окреме джерело,
// без прив'язки до наземних маршрутів, але доступне для пошуку, вибору
// на карті та як точка "Звідси"/"Куди" при побудові поїздки.
metroStopsData.forEach((s) => stopsMap.set(s.id, s));

// stopIds — зупинки в напрямку "туди" (headsignForward), як основний
// список для карти, сторінки маршруту та підрахунку кількості зупинок.
const routesData: RouteItem[] = REAL_ROUTES.map((r) => ({
  id: r.id,
  kind: r.kind,
  number: r.number,
  name: r.name,
  color: r.color,
  stopIds: r.stopIdsForward.length > 0 ? r.stopIdsForward : r.stopIdsBackward,
  headsignForward: r.headsignForward,
  headsignBackward: r.headsignBackward,
  schedule: [],
  firstDeparture: r.firstDeparture,
  lastDeparture: r.lastDeparture,
  intervalMinutes: r.intervalMinutes
}));

const stopsData: StopItem[] = Array.from(stopsMap.values());

// Лінії метро як звичайні "маршрути" для роутера поїздок — жодної окремої
// гілки логіки для метро не потрібно: buildTripOptions/buildTripPlans
// сприймають лінію метро так само, як маршрут автобуса/трамвая/тролейбуса.
routesData.push(...(metroRoutesData as unknown as RouteItem[]));

export interface TripOption {
  route: RouteItem;
  boardStop: StopItem;
  alightStop: StopItem;
  boardDistanceM: number;
  alightDistanceM: number;
}

function distanceMetersLatLng(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Підбирає маршрути громадського транспорту, які проходять і біля точки
 * відправлення, і біля точки призначення — простий "будівник маршруту"
 * без бекенду (жодних live-даних, тільки статична геометрія routesReal.json).
 *
 * Для кожного маршруту шукає найближчу до `from` та найближчу до `to`
 * зупинку з-поміж його власних зупинок; якщо обидві в межах допустимого
 * радіусу (і це різні зупинки) — маршрут вважається придатним варіантом.
 * Радіус пошуку поступово розширюється, якщо нічого не знайдено поруч.
 */
export function buildTripOptions(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  maxOptions = 5
): TripOption[] {
  const RADII_M = [700, 1200, 2200, 4000];

  for (const radius of RADII_M) {
    const candidates: TripOption[] = [];

    for (const route of routesData) {
      let nearestToStart: { stop: StopItem; dist: number } | null = null;
      let nearestToEnd: { stop: StopItem; dist: number } | null = null;

      for (const stopId of route.stopIds) {
        const stop = stopsMap.get(stopId);
        if (!stop) continue;

        const dStart = distanceMetersLatLng(fromLat, fromLng, stop.position.lat, stop.position.lng);
        if (!nearestToStart || dStart < nearestToStart.dist) nearestToStart = { stop, dist: dStart };

        const dEnd = distanceMetersLatLng(toLat, toLng, stop.position.lat, stop.position.lng);
        if (!nearestToEnd || dEnd < nearestToEnd.dist) nearestToEnd = { stop, dist: dEnd };
      }

      if (!nearestToStart || !nearestToEnd) continue;
      if (nearestToStart.stop.id === nearestToEnd.stop.id) continue;
      if (nearestToStart.dist > radius || nearestToEnd.dist > radius) continue;

      candidates.push({
        route,
        boardStop: nearestToStart.stop,
        alightStop: nearestToEnd.stop,
        boardDistanceM: nearestToStart.dist,
        alightDistanceM: nearestToEnd.dist
      });
    }

    if (candidates.length > 0) {
      return candidates
        .sort((a, b) => a.boardDistanceM + a.alightDistanceM - (b.boardDistanceM + b.alightDistanceM))
        .slice(0, maxOptions);
    }
  }

  return [];
}


/** Знаходить найближчу до точки зупинку серед власних зупинок маршруту. */
function nearestStopOnRoute(route: RouteItem, lat: number, lng: number): { stop: StopItem; dist: number } | null {
  let best: { stop: StopItem; dist: number } | null = null;
  for (const stopId of route.stopIds) {
    const stop = stopsMap.get(stopId);
    if (!stop) continue;
    const dist = distanceMetersLatLng(lat, lng, stop.position.lat, stop.position.lng);
    if (!best || dist < best.dist) best = { stop, dist };
  }
  return best;
}

/**
 * Пересадочні вузли (наразі — три реальні пересадки харківського метро,
 * `METRO_INTERCHANGES` з metroStationsReal.ts) як карта "звідси можна
 * пішки перейти сюди", в обидва боки.
 */
const interchangeMap = new Map<string, string[]>();
for (const [a, b] of METRO_INTERCHANGES) {
  interchangeMap.set(a, [...(interchangeMap.get(a) ?? []), b]);
  interchangeMap.set(b, [...(interchangeMap.get(b) ?? []), a]);
}

/**
 * Повертає зупинку-кандидата на пересадку разом із самою зупинкою:
 * саму зупинку (пересадка без ходьби між платформами) та, якщо є,
 * пов'язані пересадочні станції поруч (підземний перехід метро) —
 * з відстанню пішки між ними.
 */
function getTransferCandidates(stop: StopItem): { stop: StopItem; walkM: number }[] {
  const result: { stop: StopItem; walkM: number }[] = [{ stop, walkM: 0 }];
  const linkedIds = interchangeMap.get(stop.id) ?? [];
  for (const id of linkedIds) {
    const linked = stopsMap.get(id);
    if (!linked) continue;
    result.push({
      stop: linked,
      walkM: distanceMetersLatLng(stop.position.lat, stop.position.lng, linked.position.lat, linked.position.lng)
    });
  }
  return result;
}

export interface TripLeg {
  route: RouteItem;
  boardStop: StopItem;
  alightStop: StopItem;
  /** Пішки від виходу з попередньої ділянки до посадки на цю (перехід між
   *  двома різними, але пов'язаними пересадочними станціями, напр. метро). */
  transferWalkFromM?: number;
}

export interface TripPlan {
  /** Одна ділянка — пряма поїздка; дві — з однією пересадкою. */
  legs: TripLeg[];
  /** Пішки від точки "Звідки" до першої зупинки посадки. */
  boardWalkM: number;
  /** Пішки від останньої зупинки виходу до точки "Куди". */
  alightWalkM: number;
  transfersCount: number;
  /** Орієнтовний загальний час поїздки, хв: ходьба + очікування + сам рух + пересадка. */
  estimatedMinutes: number;
}

const WALK_SPEED_M_PER_MIN = 80; // ≈4.8 км/год — середній пішохідний темп у місті
const TRANSFER_PENALTY_MIN = 3; // час на орієнтування/вихід на пересадці, окрім самої ходьби
const MIN_WAIT_MIN = 2;
const MAX_WAIT_MIN = 12;

/** Середній час "перегону" між сусідніми зупинками (хв), включно з зупинкою на посадку/висадку. */
const MINUTES_PER_STOP: Record<TransportKind, number> = {
  metro: 2.0,
  tram: 2.3,
  trolleybus: 2.1,
  bus: 1.9
};

/** Кількість зупинок, які фактично проїде пасажир на цій ділянці (за позицією в route.stopIds). */
function stopsRiddenOnLeg(leg: TripLeg): number {
  const boardIdx = leg.route.stopIds.indexOf(leg.boardStop.id);
  const alightIdx = leg.route.stopIds.indexOf(leg.alightStop.id);
  if (boardIdx === -1 || alightIdx === -1 || boardIdx === alightIdx) return 5; // розумний дефолт, якщо індекс не знайдено
  return Math.abs(alightIdx - boardIdx);
}

/**
 * Орієнтовний час усієї поїздки в хвилинах: ходьба (по прямій або, після
 * refineTripPlansWithOSM, по вуличній мережі) + очікування транспорту
 * (половина інтервалу руху, в розумних межах) + сам рух по маршруту
 * (кількість зупинок × середній час перегону для цього виду транспорту) +
 * штраф за пересадку. Це і є головна "розумна" метрика ранжування — не
 * просто "хто ближче пішки", а хто реально довезе швидше.
 */
export function estimateTripMinutes(plan: TripPlan): number {
  let minutes = (plan.boardWalkM + plan.alightWalkM) / WALK_SPEED_M_PER_MIN;

  plan.legs.forEach((leg, i) => {
    const wait = Math.min(MAX_WAIT_MIN, Math.max(MIN_WAIT_MIN, (leg.route.intervalMinutes || 10) / 2));
    minutes += wait + stopsRiddenOnLeg(leg) * MINUTES_PER_STOP[leg.route.kind];
    if (i > 0) {
      minutes += TRANSFER_PENALTY_MIN + (leg.transferWalkFromM ?? 0) / WALK_SPEED_M_PER_MIN;
    }
  });

  return Math.round(minutes);
}

/**
 * Будує варіанти поїздки громадським транспортом між двома точками,
 * включно з варіантами з ОДНІЄЮ пересадкою, якщо прямого маршруту немає
 * (або їх замало). Пересадка шукається через зупинки-хаби: зупинку, яку
 * обслуговує і перший, і другий маршрут (`StopItem.routeIds`).
 */
export function buildTripPlans(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  maxOptions = 6
): TripPlan[] {
  const direct = buildTripOptions(fromLat, fromLng, toLat, toLng, maxOptions).map((o): TripPlan => {
    const plan: TripPlan = {
      legs: [{ route: o.route, boardStop: o.boardStop, alightStop: o.alightStop }],
      boardWalkM: o.boardDistanceM,
      alightWalkM: o.alightDistanceM,
      transfersCount: 0,
      estimatedMinutes: 0
    };
    plan.estimatedMinutes = estimateTripMinutes(plan);
    return plan;
  });

  // Пряму поїздку шукаємо ширшим "бюджетом" пересадкових варіантів лише
  // тоді, коли прямих замало АБО коли найкращий прямий варіант виявляється
  // повільнішим за типову поїздку з пересадкою — раніше пересадка взагалі
  // не розглядалась, якщо прямих маршрутів було достатньо за кількістю,
  // навіть якщо кожен з них об'їжджав пів міста.
  const bestDirectMinutes = direct.length > 0 ? Math.min(...direct.map((p) => p.estimatedMinutes)) : Infinity;
  if (direct.length >= maxOptions && bestDirectMinutes <= 25) {
    return direct.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes).slice(0, maxOptions);
  }

  const RADII_M = [700, 1200, 2200];
  let transferPlans: TripPlan[] = [];

  for (const radius of RADII_M) {
    const candidates: TripPlan[] = [];
    const seenPairs = new Set<string>();

    for (const route1 of routesData) {
      const board = nearestStopOnRoute(route1, fromLat, fromLng);
      if (!board || board.dist > radius) continue;

      for (const stopId of route1.stopIds) {
        if (stopId === board.stop.id) continue;
        const transferStop = stopsMap.get(stopId);
        if (!transferStop) continue;

        // Пересадка можлива або на цій самій зупинці (routeId2 в її
        // routeIds), або на пов'язаній пересадочній станції поруч
        // (напр. метро: Майдан Конституції ↔ Історичний музей).
        for (const candidate of getTransferCandidates(transferStop)) {
          for (const routeId2 of candidate.stop.routeIds) {
            if (routeId2 === route1.id) continue;
            const route2 = routesData.find((r) => r.id === routeId2);
            if (!route2) continue;

            const alight = nearestStopOnRoute(route2, toLat, toLng);
            if (!alight || alight.dist > radius) continue;
            if (alight.stop.id === candidate.stop.id) continue;

            const pairKey = `${route1.id}|${transferStop.id}|${candidate.stop.id}|${route2.id}`;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const plan: TripPlan = {
              legs: [
                { route: route1, boardStop: board.stop, alightStop: transferStop },
                { route: route2, boardStop: candidate.stop, alightStop: alight.stop, transferWalkFromM: candidate.walkM }
              ],
              boardWalkM: board.dist,
              alightWalkM: alight.dist,
              transfersCount: 1,
              estimatedMinutes: 0
            };
            plan.estimatedMinutes = estimateTripMinutes(plan);
            candidates.push(plan);
          }
        }
      }
    }

    if (candidates.length > 0) {
      transferPlans = candidates.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes).slice(0, maxOptions);
      break;
    }
  }

  // Фінальне ранжування — усі варіанти (прямі й з пересадкою) разом,
  // за реальним орієнтовним часом у дорозі. Раніше прямі маршрути завжди
  // йшли першими незалежно від того, скільки часу вони насправді займали.
  return [...direct, ...transferPlans]
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)
    .slice(0, maxOptions);
}

export const localRoutes = {
  all: (): RouteItem[] => routesData,
  getById: (id: string): RouteItem | undefined => routesData.find((r) => r.id === id),
  getByKind: (kind: TransportKind): RouteItem[] => routesData.filter((r) => r.kind === kind),
  search: (query: string): RouteItem[] => {
    const q = query.toLowerCase();
    return routesData.filter(
      (r) => r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  },
  buildTrip: (fromLat: number, fromLng: number, toLat: number, toLng: number): TripOption[] =>
    buildTripOptions(fromLat, fromLng, toLat, toLng),
  buildTripPlans: (fromLat: number, fromLng: number, toLat: number, toLng: number): TripPlan[] =>
    buildTripPlans(fromLat, fromLng, toLat, toLng)
};

export const localStops = {
  all: (): StopItem[] => stopsData,
  getById: (id: string): StopItem | undefined => stopsData.find((s) => s.id === id),
  search: (query: string): StopItem[] => {
    const q = query.toLowerCase();
    return stopsData.filter((s) => s.name.toLowerCase().includes(q));
  },
  getNearby: (lat: number, lng: number, maxDistance = 1000): StopItem[] => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const R = 6371000;
      const dLat = toRad(bLat - aLat);
      const dLng = toRad(bLng - aLng);
      const la1 = toRad(aLat);
      const la2 = toRad(bLat);
      const x = dLng * Math.cos((la1 + la2) / 2);
      const y = dLat;
      return Math.sqrt(x * x + y * y) * R;
    };
    return stopsData
      .filter((s) => distanceMeters(lat, lng, s.position.lat, s.position.lng) <= maxDistance)
      .sort(
        (a, b) =>
          distanceMeters(lat, lng, a.position.lat, a.position.lng) -
          distanceMeters(lat, lng, b.position.lat, b.position.lng)
      );
  },
  // Симулює найближчі прибуття для кожного маршруту, що проходить через зупинку,
  // на основі реального інтервалу руху (intervalMinutes) та поточного часу доби.
  getArrivals: (stopId: string): { routeId: string; etaMinutes: number }[] => {
    const stop = stopsData.find((s) => s.id === stopId);
    if (!stop) return [];

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return stop.routeIds
      .map((routeId) => {
        const route = routesData.find((r) => r.id === routeId);
        if (!route) return null;

        const [fromH, fromM] = route.firstDeparture.split(':').map(Number);
        const [toH, toM] = route.lastDeparture.split(':').map(Number);
        const startMinutes = fromH * 60 + fromM;
        const endMinutes = toH * 60 + toM;
        if (nowMinutes < startMinutes || nowMinutes > endMinutes) return null;

        const interval = Math.max(route.intervalMinutes || 10, 3);
        // Детермінований, але відмінний для кожного маршруту зсув фази,
        // щоб борти на одній зупинці не прибували всі одночасно.
        const phaseSeed = routeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const minutesIntoInterval = (nowMinutes + phaseSeed) % interval;
        const etaMinutes = interval - minutesIntoInterval;

        return { routeId, etaMinutes: etaMinutes === interval ? 0 : etaMinutes };
      })
      .filter((a): a is { routeId: string; etaMinutes: number } => a !== null);
  }
};
