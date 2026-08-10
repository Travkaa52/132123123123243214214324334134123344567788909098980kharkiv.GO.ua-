import { TransportKind } from '@/types/transport';
import routesRealJson from './routesReal.json';
import stopsRealJson from './stopsReal.json';
import { metroStopsData, metroRoutesData, METRO_INTERCHANGES } from './metroStationsReal';

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

export interface RouteDirectionVariant {
  headsign: string;
  stopIds: string[];
}

export interface TripLeg {
  route: RouteItem;
  headsign: string;
  directionStopIds: string[];
  boardStop: StopItem;
  alightStop: StopItem;
  boardTimeMin: number;
  alightTimeMin: number;
  rideDurationMin: number;
  waitTimeMin: number;
  transferWalkFromM?: number;
  transferWalkPath?: [number, number][];
}

export interface TripPlan {
  legs: TripLeg[];
  boardWalkM: number;
  alightWalkM: number;
  transfersCount: number;
  estimatedMinutes: number;
  totalWalkM: number;
  tags?: {
    isFastest?: boolean;
    isFewestTransfers?: boolean;
    isLeastWalking?: boolean;
  };
  boardWalkPath?: [number, number][];
  alightWalkPath?: [number, number][];
}

// Константи фізики міського руху
const WALK_SPEED_M_PER_MIN = 75; // 4.5 км/год (реалістична швидкість пішохода в місті)
const TRANSFER_INITIAL_BUFFER_MIN = 2.5; // Час на орієнтування/схід з платформи
const MAX_WALK_TO_FIRST_STOP_M = 1200; // Максимальна відстань пішки до першої зупинки
const MAX_TRANSFER_WALK_M = 400; // Максимальний піший перехід між зупинками
const MAX_WALK_FROM_LAST_STOP_M = 1200;

const MINUTES_PER_STOP: Record<TransportKind, number> = {
  metro: 1.8,
  tram: 2.2,
  trolleybus: 2.0,
  bus: 1.9
};

// --- ІНІЦІАЛІЗАЦІЯ ДАНИХ ---
const REAL_ROUTES = routesRealJson as unknown as RealRoute[];
const REAL_STOPS = stopsRealJson as unknown as StopItem[];

const stopsMap = new Map<string, StopItem>();
REAL_STOPS.forEach((s) => stopsMap.set(s.id, s));
metroStopsData.forEach((s) => stopsMap.set(s.id, s));

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

routesData.push(...(metroRoutesData as unknown as RouteItem[]));
const stopsData: StopItem[] = Array.from(stopsMap.values());

const routeDirectionsById = new Map<string, RouteDirectionVariant[]>();
REAL_ROUTES.forEach((r) => {
  const fwd = r.stopIdsForward.length > 0 ? r.stopIdsForward : r.stopIdsBackward;
  const bwd = r.stopIdsBackward.length > 0 ? r.stopIdsBackward : r.stopIdsForward;
  routeDirectionsById.set(r.id, [
    { headsign: r.headsignForward, stopIds: fwd },
    { headsign: r.headsignBackward, stopIds: bwd }
  ]);
});

(metroRoutesData as unknown as RouteItem[]).forEach((r) => {
  routeDirectionsById.set(r.id, [
    { headsign: r.headsignForward, stopIds: r.stopIds },
    { headsign: r.headsignBackward, stopIds: [...r.stopIds].reverse() }
  ]);
});

function getRouteDirections(route: RouteItem): RouteDirectionVariant[] {
  return routeDirectionsById.get(route.id) ?? [{ headsign: route.headsignForward, stopIds: route.stopIds }];
}

function distanceMetersLatLng(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Граф піших пересадок між зупинками
const interchangeMap = new Map<string, string[]>();
for (const [a, b] of METRO_INTERCHANGES) {
  interchangeMap.set(a, [...(interchangeMap.get(a) ?? []), b]);
  interchangeMap.set(b, [...(interchangeMap.get(b) ?? []), a]);
}

const nearbyStopsMap = new Map<string, { stop: StopItem; walkM: number }[]>();
for (const a of stopsData) {
  const nearby: { stop: StopItem; walkM: number }[] = [];
  for (const b of stopsData) {
    if (a.id === b.id) continue;
    const walkM = distanceMetersLatLng(a.position.lat, a.position.lng, b.position.lat, b.position.lng);
    if (walkM <= MAX_TRANSFER_WALK_M) nearby.push({ stop: b, walkM });
  }
  nearby.sort((x, y) => x.walkM - y.walkM);
  nearbyStopsMap.set(a.id, nearby.slice(0, 8));
}

function getTransferCandidates(stop: StopItem): { stop: StopItem; walkM: number }[] {
  const result: { stop: StopItem; walkM: number }[] = [{ stop, walkM: 0 }];
  const seen = new Set<string>([stop.id]);

  for (const id of interchangeMap.get(stop.id) ?? []) {
    const linked = stopsMap.get(id);
    if (!linked || seen.has(linked.id)) continue;
    seen.add(linked.id);
    result.push({
      stop: linked,
      walkM: distanceMetersLatLng(stop.position.lat, stop.position.lng, linked.position.lat, linked.position.lng)
    });
  }

  for (const candidate of nearbyStopsMap.get(stop.id) ?? []) {
    if (seen.has(candidate.stop.id)) continue;
    seen.add(candidate.stop.id);
    result.push(candidate);
  }

  return result;
}

// --- РОЗРАХУНОК ДИНАМІЧНОГО ОЧІКУВАННЯ ТА ЧАСУ РУХУ ---
function calculateWaitTime(route: RouteItem, arrivalTimeMinutes: number): number {
  const interval = Math.max(route.intervalMinutes || 10, 3);
  const phaseSeed = route.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const cycleTime = (arrivalTimeMinutes + phaseSeed) % interval;
  const wait = (interval - cycleTime) % interval;
  return Math.max(wait, 1.5); // мінімум 1.5 хв на посадку
}

function calculateRideDuration(kind: TransportKind, stopsCount: number): number {
  return stopsCount * MINUTES_PER_STOP[kind];
}

// --- МАТЕМАТИКА ПАРЕТО-ФІЛЬТРАЦІЇ ---
function filterParetoOptimal(plans: TripPlan[]): TripPlan[] {
  const isDominated = (a: TripPlan, b: TripPlan) => {
    // B домінує A, якщо B строго кращий або рівний за всіма 3 параметрами і кращий хоча б в одному
    const timeBetterOrEqual = b.estimatedMinutes <= a.estimatedMinutes;
    const transfersBetterOrEqual = b.transfersCount <= a.transfersCount;
    const walkBetterOrEqual = b.totalWalkM <= a.totalWalkM;

    const strictlyBetterInOne =
      b.estimatedMinutes < a.estimatedMinutes ||
      b.transfersCount < a.transfersCount ||
      b.totalWalkM < a.totalWalkM;

    return timeBetterOrEqual && transfersBetterOrEqual && walkBetterOrEqual && strictlyBetterInOne;
  };

  const pareto = plans.filter((planA) => !plans.some((planB) => isDominated(planA, planB)));

  // Додаємо smart-теги для UI
  if (pareto.length > 0) {
    let minTime = Infinity;
    let minTransfers = Infinity;
    let minWalk = Infinity;

    pareto.forEach((p) => {
      if (p.estimatedMinutes < minTime) minTime = p.estimatedMinutes;
      if (p.transfersCount < minTransfers) minTransfers = p.transfersCount;
      if (p.totalWalkM < minWalk) minWalk = p.totalWalkM;
    });

    pareto.forEach((p) => {
      p.tags = {
        isFastest: p.estimatedMinutes === minTime,
        isFewestTransfers: p.transfersCount === minTransfers,
        isLeastWalking: p.totalWalkM === minWalk
      };
    });
  }

  return pareto;
}

// --- ГОЛОВНИЙ АЛГОРИТМ ПОБУДОВИ МАРШРУТІВ (ULTRA ROUTER) ---
export function buildTripPlans(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  maxOptions = 5
): TripPlan[] {
  const now = new Date();
  const startTimeMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Знаходимо початкові та кінцеві зупинки від точок користувача
  const originStops = stopsData
    .map((s) => ({
      stop: s,
      dist: distanceMetersLatLng(fromLat, fromLng, s.position.lat, s.position.lng)
    }))
    .filter((s) => s.dist <= MAX_WALK_TO_FIRST_STOP_M)
    .sort((a, b) => a.dist - b.dist);

  const destinationStops = stopsData
    .map((s) => ({
      stop: s,
      dist: distanceMetersLatLng(toLat, toLng, s.position.lat, s.position.lng)
    }))
    .filter((s) => s.dist <= MAX_WALK_FROM_LAST_STOP_M)
    .sort((a, b) => a.dist - b.dist);

  if (originStops.length === 0 || destinationStops.length === 0) return [];

  const destinationStopsMap = new Map<string, number>();
  destinationStops.forEach((d) => destinationStopsMap.set(d.stop.id, d.dist));

  const rawPlans: TripPlan[] = [];
  const visitedState = new Map<string, number>(); // routeId+direction+stopId -> minArrivalTime

  // --- РАУНД 1: ПРЯМІ МАРШРУТИ (DIRECT LEGS) ---
  for (const origin of originStops) {
    const walkTimeToBoard = origin.dist / WALK_SPEED_M_PER_MIN;
    const arrivalAtBoard = startTimeMinutes + walkTimeToBoard;

    for (const route of routesData) {
      for (const direction of getRouteDirections(route)) {
        const boardIdx = direction.stopIds.indexOf(origin.stop.id);
        if (boardIdx === -1) continue;

        const waitTime = calculateWaitTime(route, arrivalAtBoard);
        const departTime = arrivalAtBoard + waitTime;

        for (let alightIdx = boardIdx + 1; alightIdx < direction.stopIds.length; alightIdx++) {
          const alightStopId = direction.stopIds[alightIdx];
          const alightStop = stopsMap.get(alightStopId);
          if (!alightStop) continue;

          const stopsRidden = alightIdx - boardIdx;
          const rideDuration = calculateRideDuration(route.kind, stopsRidden);
          const arrivalAtAlight = departTime + rideDuration;

          // Запам'ятовуємо найшвидший час прибуття для раунду 2
          const stateKey = `${route.id}|${alightStopId}`;
          if (!visitedState.has(stateKey) || visitedState.get(stateKey)! > arrivalAtAlight) {
            visitedState.set(stateKey, arrivalAtAlight);
          }

          // Перевіряємо чи є ця зупинка фінішною
          if (destinationStopsMap.has(alightStopId)) {
            const alightWalkM = destinationStopsMap.get(alightStopId)!;
            const walkTimeToDest = alightWalkM / WALK_SPEED_M_PER_MIN;
            const totalTripTime = arrivalAtAlight + walkTimeToDest - startTimeMinutes;

            rawPlans.push({
              legs: [
                {
                  route,
                  headsign: direction.headsign,
                  directionStopIds: direction.stopIds,
                  boardStop: origin.stop,
                  alightStop,
                  boardTimeMin: arrivalAtBoard,
                  alightTimeMin: arrivalAtAlight,
                  rideDurationMin: rideDuration,
                  waitTimeMin: waitTime
                }
              ],
              boardWalkM: origin.dist,
              alightWalkM,
              transfersCount: 0,
              estimatedMinutes: Math.round(totalTripTime),
              totalWalkM: Math.round(origin.dist + alightWalkM)
            });
          }
        }
      }
    }
  }

  // --- РАУНД 2: МАРШРУТИ З ОДНІЄЮ ПЕРЕСАДКОЮ (1-TRANSFER LEGS) ---
  // Запускаємо пошук пересадки тільки якщо потрібні ще варіанти або прямих замало
  for (const origin of originStops) {
    const walkTimeToBoard1 = origin.dist / WALK_SPEED_M_PER_MIN;
    const arrivalAtBoard1 = startTimeMinutes + walkTimeToBoard1;

    for (const route1 of routesData) {
      for (const direction1 of getRouteDirections(route1)) {
        const boardIdx1 = direction1.stopIds.indexOf(origin.stop.id);
        if (boardIdx1 === -1) continue;

        const waitTime1 = calculateWaitTime(route1, arrivalAtBoard1);
        const departTime1 = arrivalAtBoard1 + waitTime1;

        for (let alightIdx1 = boardIdx1 + 1; alightIdx1 < direction1.stopIds.length; alightIdx1++) {
          const transferStop1 = stopsMap.get(direction1.stopIds[alightIdx1]);
          if (!transferStop1) continue;

          const rideDuration1 = calculateRideDuration(route1.kind, alightIdx1 - boardIdx1);
          const arrivalAtTransfer1 = departTime1 + rideDuration1;

          // Отримуємо всі доступні зупинки для пересадки поруч
          for (const transferCandidate of getTransferCandidates(transferStop1)) {
            const transferWalkTime = transferCandidate.walkM / WALK_SPEED_M_PER_MIN;
            const arrivalAtBoard2 = arrivalAtTransfer1 + TRANSFER_INITIAL_BUFFER_MIN + transferWalkTime;

            for (const routeId2 of transferCandidate.stop.routeIds) {
              if (routeId2 === route1.id) continue; // Уникаємо пересадки на той самий маршрут
              const route2 = routesData.find((r) => r.id === routeId2);
              if (!route2) continue;

              for (const direction2 of getRouteDirections(route2)) {
                const boardIdx2 = direction2.stopIds.indexOf(transferCandidate.stop.id);
                if (boardIdx2 === -1) continue;

                const waitTime2 = calculateWaitTime(route2, arrivalAtBoard2);
                const departTime2 = arrivalAtBoard2 + waitTime2;

                for (let alightIdx2 = boardIdx2 + 1; alightIdx2 < direction2.stopIds.length; alightIdx2++) {
                  const alightStopId2 = direction2.stopIds[alightIdx2];
                  if (!destinationStopsMap.has(alightStopId2)) continue;

                  const alightStop2 = stopsMap.get(alightStopId2);
                  if (!alightStop2) continue;

                  const rideDuration2 = calculateRideDuration(route2.kind, alightIdx2 - boardIdx2);
                  const arrivalAtAlight2 = departTime2 + rideDuration2;

                  const alightWalkM = destinationStopsMap.get(alightStopId2)!;
                  const walkTimeToDest = alightWalkM / WALK_SPEED_M_PER_MIN;
                  const totalTripTime = arrivalAtAlight2 + walkTimeToDest - startTimeMinutes;

                  rawPlans.push({
                    legs: [
                      {
                        route: route1,
                        headsign: direction1.headsign,
                        directionStopIds: direction1.stopIds,
                        boardStop: origin.stop,
                        alightStop: transferStop1,
                        boardTimeMin: arrivalAtBoard1,
                        alightTimeMin: arrivalAtTransfer1,
                        rideDurationMin: rideDuration1,
                        waitTimeMin: waitTime1
                      },
                      {
                        route: route2,
                        headsign: direction2.headsign,
                        directionStopIds: direction2.stopIds,
                        boardStop: transferCandidate.stop,
                        alightStop: alightStop2,
                        boardTimeMin: arrivalAtBoard2,
                        alightTimeMin: arrivalAtAlight2,
                        rideDurationMin: rideDuration2,
                        waitTimeMin: waitTime2,
                        transferWalkFromM: transferCandidate.walkM
                      }
                    ],
                    boardWalkM: origin.dist,
                    alightWalkM,
                    transfersCount: 1,
                    estimatedMinutes: Math.round(totalTripTime),
                    totalWalkM: Math.round(origin.dist + alightWalkM + transferCandidate.walkM)
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // --- ФІЛЬТРАЦІЯ ТА ВІДБІР КРАЩИХ МАРШРУТІВ ---
  const paretoOptimalPlans = filterParetoOptimal(rawPlans);

  return paretoOptimalPlans
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)
    .slice(0, maxOptions);
}

// Хелпери експорту
export const localRoutes = {
  all: (): RouteItem[] => routesData,
  getById: (id: string): RouteItem | undefined => routesData.find((r) => r.id === id),
  getByKind: (kind: TransportKind): RouteItem[] => routesData.filter((r) => r.kind === kind),
  search: (query: string): RouteItem[] => {
    const q = query.toLowerCase();
    return routesData.filter((r) => r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  },
  buildTripPlans: (fromLat: number, fromLng: number, toLat: number, toLng: number): TripPlan[] =>
    buildTripPlans(fromLat, fromLng, toLat, toLng)
};

export const localStops = {
  all: (): StopItem[] => stopsData,
  getById: (id: string): StopItem | undefined => stopsData.find((s) => s.id === id),
  search: (query: string): StopItem[] => {
    const q = query.toLowerCase();
    return stopsData.filter((s) => s.name.toLowerCase().includes(q));
  }
};
