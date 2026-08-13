import { TransportKind } from '@/types/transport';
import routesRealJson from './routesReal.json';
import stopsRealJson from './stopsReal.json';
import osmStopsJson from './stops.json';
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
// Другий, незалежний набір зупинок — id тут це номери вузлів OpenStreetMap
// (напр. "stop-2578454062"). Джерело ширше за stopsReal.json (1561 проти
// ~1000 зупинок) і покриває точки, яких немає в GPS-наборі. routeIds у
// цьому наборі посилаються на СТАРУ схему id маршрутів ("route-<kind>-
// <number>-fwd/bwd" з routes.json) — вони більше не збігаються з id у
// routesReal.json ("trolleybus-1" тощо), тому при об'єднанні беремо з OSM
// лише назву/координати/kinds, а не довіряємо його routeIds напряму.
const OSM_STOPS = osmStopsJson as unknown as StopItem[];

const stopsMap = new Map<string, StopItem>();
REAL_STOPS.forEach((s) => stopsMap.set(s.id, s));

/**
 * Обидва набори зупинок описують ту саму фізичну мережу Харкова, зібрану
 * НЕЗАЛЕЖНО з двох джерел — тому та сама реальна зупинка часто має по
 * запису в кожному наборі, за кілька метрів одна від одної (напр.
 * "Інфекційна лікарня" з stopsReal.json і безіменна "Зупинка міського
 * транспорту" з stops.json). Без дедуплікації це два окремих кружечки на
 * карті майже впритул один до одного.
 *
 * Зіставляємо СУВОРО пара-до-пари (1:1, найближчий кандидат із ІНШОГО
 * набору) методом "жадібний найближчий сусід за зростанням відстані" —
 * НЕ транзитивною кластеризацією через грід-сусідів. Транзитивне
 * об'єднання тут перевірено небезпечне: ланцюжок A↔B↔C↔D із кроками по
 * ~15м кожен може зрештою злити чотири РІЗНІ реальні зупинки за 40+ метрів
 * одна від одної. Жорстка пара 1↔1 такого зробити не може за визначенням.
 *
 * Поріг 30м (не 15м) — навмисно: перевірено на всьому датасеті, що
 * найближча РІЗНА реальна зупинка завжди в рази далі, тож хибних злиттів
 * не виникає, а от частина справжніх дублів (напр. "пр. Байрона" на
 * ~15.5м) раніше не склеювались і лишались подвійними кружечками на карті.
 */
const DEDUPE_RADIUS_M = 30;
const GRID_SIZE_DEG = 0.0002;

function gridKey(lat: number, lng: number): string {
  return `${Math.round(lat / GRID_SIZE_DEG)}:${Math.round(lng / GRID_SIZE_DEG)}`;
}

function haversineM(a: StopItem, b: StopItem): number {
  const R = 6371000;
  const lat1 = (a.position.lat * Math.PI) / 180;
  const lat2 = (b.position.lat * Math.PI) / 180;
  const dLat = ((b.position.lat - a.position.lat) * Math.PI) / 180;
  const dLng = ((b.position.lng - a.position.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Родові, "не людські" назви (трапляються в ОБОХ наборах) — при виборі
// канонічної назви пари програють будь-якій конкретній (напр. "Інфекційна
// лікарня" переможе "Зупинка міського транспорту").
function isGenericStopName(name: string): boolean {
  return /^Зупинка(\s|$)/i.test(name.trim());
}

// Валідні id маршрутів у ПОТОЧНІЙ схемі (routesReal.json + метро) — саме
// на них може посилатись canonical.routeIds.
const VALID_ROUTE_IDS = new Set<string>([
  ...(routesRealJson as unknown as RealRoute[]).map((r) => r.id),
  ...(metroRoutesData as unknown as RouteItem[]).map((r) => r.id)
]);

// routeIds в stops.json (OSM) записані у СТАРІЙ схемі — "route-<kind>-
// <number>-fwd/bwd" (напр. "route-tram-8-fwd"), яка більше не збігається
// з id у routesReal.json ("tram-8"). Раніше такі id просто відкидались —
// це прибирало маршрути-привиди, але заразом ховало РЕАЛЬНІ маршрути на
// чисто-OSM зупинках (де немає пари зі stopsReal.json і взяти routeIds
// більше нізвідки): картка зупинки показувала "0 маршрутів" навіть коли
// через неї фактично йде трамвай №8 чи тролейбус №1. Тепер перекладаємо
// стару схему в нову ("route-tram-8-fwd" → "tram-8") і лише ПОТІМ звіряємо
// з VALID_ROUTE_IDS — так зберігаються реальні збіги (перевірено: 25
// маршрутів коректно відновлюються), а вигадані/невідомі id (напр. давно
// закриті чи не внесені в routesReal.json маршрути) як і раніше відсіюються.
function legacyRouteIdToCurrent(id: string): string {
  const m = id.match(/^route-(.+)-(fwd|bwd)$/);
  return m ? m[1] : id;
}

// Чисто-OSM зупинки, для яких не знайшлось пари в stopsReal.json (жодна
// зупинка з stopsReal.json не в межах DEDUPE_RADIUS_M) — додаються як є,
// але з тим самим перекладом routeIds у поточну схему, інакше саме вони
// показували "0 маршрутів" на картці, хоча фізично маршрут через них іде.
OSM_STOPS.forEach((s) => {
  if (stopsMap.has(s.id)) return;
  stopsMap.set(s.id, {
    ...s,
    routeIds: Array.from(new Set(s.routeIds.map(legacyRouteIdToCurrent).filter((id) => VALID_ROUTE_IDS.has(id))))
  });
});

const osmBuckets = new Map<string, number[]>();
OSM_STOPS.forEach((s, idx) => {
  const k = gridKey(s.position.lat, s.position.lng);
  if (!osmBuckets.has(k)) osmBuckets.set(k, []);
  osmBuckets.get(k)!.push(idx);
});

interface Candidate {
  d: number;
  realIdx: number;
  osmIdx: number;
}
const candidates: Candidate[] = [];
REAL_STOPS.forEach((real, realIdx) => {
  const [gx, gy] = gridKey(real.position.lat, real.position.lng).split(':').map(Number);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const osmIdx of osmBuckets.get(`${gx + dx}:${gy + dy}`) ?? []) {
        const d = haversineM(real, OSM_STOPS[osmIdx]);
        if (d <= DEDUPE_RADIUS_M) candidates.push({ d, realIdx, osmIdx });
      }
    }
  }
});
candidates.sort((a, b) => a.d - b.d);

const usedReal = new Set<number>();
const usedOsm = new Set<number>();
for (const c of candidates) {
  if (usedReal.has(c.realIdx) || usedOsm.has(c.osmIdx)) continue;
  usedReal.add(c.realIdx);
  usedOsm.add(c.osmIdx);

  const real = REAL_STOPS[c.realIdx];
  const osm = OSM_STOPS[c.osmIdx];
  const useRealName = !isGenericStopName(real.name) || isGenericStopName(osm.name);
  const osmValidRouteIds = osm.routeIds.map(legacyRouteIdToCurrent).filter((id) => VALID_ROUTE_IDS.has(id));
  const canonical: StopItem = {
    id: useRealName ? real.id : osm.id,
    name: useRealName ? real.name : osm.name,
    kinds: Array.from(new Set([...real.kinds, ...osm.kinds])) as TransportKind[],
    position: real.position,
    routeIds: Array.from(new Set([...real.routeIds, ...osmValidRouteIds]))
  };

  // Обидва id (і з stopsReal.json, і з stops.json) тепер резолвляться в
  // ОДИН об'єкт — на карті лишається один маркер, а StopDetailModal бачить
  // повний список маршрутів незалежно від того, який саме id прийшов
  // (наприклад, зі stopIdsForward/Backward якогось маршруту).
  stopsMap.set(real.id, canonical);
  stopsMap.set(osm.id, canonical);
}

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

// Дедуплікація по об'єкту (не по id!) — після склеювання пар кілька
// різних id (real + osm) можуть вказувати на ОДИН і той самий канонічний
// об'єкт зупинки; без Set по значенню він потрапив би у список стільки
// разів, скільки id на нього посилається.
const stopsData: StopItem[] = Array.from(new Set(stopsMap.values()));

// Лінії метро як звичайні "маршрути" для роутера поїздок — жодної окремої
// гілки логіки для метро не потрібно: buildTripOptions/buildTripPlans
// сприймають лінію метро так само, як маршрут автобуса/трамвая/тролейбуса.
routesData.push(...(metroRoutesData as unknown as RouteItem[]));

/**
 * КРИТИЧНО ДЛЯ ТОЧНОСТІ: реальний маршрут громадського транспорту в
 * Харкові (і майже будь-якому місті) фізично не однакова петля в обидва
 * боки — "туди" й "назад" часто йдуть різними вулицями/смугами (одностороній
 * рух, розворотні кільця, різні зупинки на протилежних боках проспекту).
 * `routesReal.json` вже містить обидва реальні напрямки
 * (`stopIdsForward`/`stopIdsBackward`) — вони НЕ однакові навіть у
 * зворотному порядку (перевірено: жодної пари з 84 маршрутів не збігається).
 *
 * Раніше роутер поїздок використовував лише `stopIds` (=stopIdsForward) і
 * ЖОДНОГО РАЗУ не перевіряв, що зупинка посадки дійсно йде РАНІШЕ зупинки
 * висадки в напрямку руху. Це означало дві реальні помилки:
 *  1) для поїздок у зворотному напрямку маршруту потрібні зупинки могли
 *     просто бути відсутні в списку (weren't in stopIdsForward) — маршрут
 *     "губився", хоча фізично довозив саме туди;
 *  2) навіть коли обидві зупинки випадково траплялись у forward-списку,
 *     ніхто не перевіряв порядок — міг вийти "маршрут", що вимагав їхати
 *     назад проти напрямку руху транспорту (фізично неможлива поїздка).
 *
 * Рішення: для кожного маршруту рахуємо ОБИДВА напрямки як окремі
 * впорядковані послідовності зупинок і завжди перевіряємо
 * `alightIdx > boardIdx` у межах ОДНОГО обраного напрямку. Метро (єдиний
 * список станцій, потяги їдуть в обидва боки по тій самій колії) отримує
 * другий напрямок як розворот того самого списку.
 */
export interface RouteDirectionVariant {
  headsign: string;
  stopIds: string[];
}

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

/** Усі відомі напрямки руху для маршруту (мінімум один — навіть якщо
 *  дані з якоїсь причини не містили окремого зворотного напрямку). */
function getRouteDirections(route: RouteItem): RouteDirectionVariant[] {
  return routeDirectionsById.get(route.id) ?? [{ headsign: route.headsignForward, stopIds: route.stopIds }];
}

export interface TripOption {
  route: RouteItem;
  /** Напрямок руху (кінцева зупинка/назва), у якому фактично їде пасажир
   *  на цій ділянці — важливо, бо в один і той же боку доїхати можна лише
   *  одним із двох напрямків маршруту. */
  headsign: string;
  /** Впорядкована послідовність зупинок ІМЕННО цього напрямку — на ній
   *  побудовані boardStop/alightStop і саме вона (а не route.stopIds,
   *  який завжди "туди") коректна для підрахунку кількості зупинок і
   *  малювання шляху на карті. */
  directionStopIds: string[];
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
 * Шукає в межах ОДНОГО напрямку маршруту найближчу зупинку посадки (до
 * `from`) і найближчу зупинку висадки (до `to`), і одразу відкидає
 * результат, якщо висадка виявляється РАНІШЕ посадки в порядку руху —
 * фізично неможлива поїздка проти напрямку транспорту.
 */
function bestPairForDirection(
  direction: RouteDirectionVariant,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): { boardStop: StopItem; alightStop: StopItem; boardDist: number; alightDist: number } | null {
  let nearestToStart: { stop: StopItem; dist: number; idx: number } | null = null;
  let nearestToEnd: { stop: StopItem; dist: number; idx: number } | null = null;

  direction.stopIds.forEach((stopId, idx) => {
    const stop = stopsMap.get(stopId);
    if (!stop) return;

    const dStart = distanceMetersLatLng(fromLat, fromLng, stop.position.lat, stop.position.lng);
    if (!nearestToStart || dStart < nearestToStart.dist) nearestToStart = { stop, dist: dStart, idx };

    const dEnd = distanceMetersLatLng(toLat, toLng, stop.position.lat, stop.position.lng);
    if (!nearestToEnd || dEnd < nearestToEnd.dist) nearestToEnd = { stop, dist: dEnd, idx };
  });

  if (!nearestToStart || !nearestToEnd) return null;
  const start = nearestToStart as { stop: StopItem; dist: number; idx: number };
  const end = nearestToEnd as { stop: StopItem; dist: number; idx: number };
  if (start.stop.id === end.stop.id) return null;
  // Основа виправлення точності: висадка має йти СТРОГО ПІСЛЯ посадки
  // в порядку руху цього конкретного напрямку.
  if (end.idx <= start.idx) return null;

  return { boardStop: start.stop, alightStop: end.stop, boardDist: start.dist, alightDist: end.dist };
}

/**
 * Підбирає маршрути громадського транспорту, які проходять і біля точки
 * відправлення, і біля точки призначення — простий "будівник маршруту"
 * без бекенду (жодних live-даних, тільки статична геометрія routesReal.json).
 *
 * Для кожного маршруту перевіряє ОБИДВА напрямки руху окремо (див.
 * коментар вище про forward/backward) і бере найкращий валідний варіант.
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
      let best: (TripOption & { total: number }) | null = null;

      for (const direction of getRouteDirections(route)) {
        const pair = bestPairForDirection(direction, fromLat, fromLng, toLat, toLng);
        if (!pair) continue;
        if (pair.boardDist > radius || pair.alightDist > radius) continue;

        const total = pair.boardDist + pair.alightDist;
        if (!best || total < best.total) {
          best = {
            route,
            headsign: direction.headsign,
            directionStopIds: direction.stopIds,
            boardStop: pair.boardStop,
            alightStop: pair.alightStop,
            boardDistanceM: pair.boardDist,
            alightDistanceM: pair.alightDist,
            total
          };
        }
      }

      if (best) candidates.push(best);
    }

    if (candidates.length > 0) {
      return candidates
        .sort((a, b) => a.boardDistanceM + a.alightDistanceM - (b.boardDistanceM + b.alightDistanceM))
        .slice(0, maxOptions);
    }
  }

  return [];
}


/** Знаходить найближчу до точки зупинку СЕРЕД КОНКРЕТНОГО НАПРЯМКУ
 *  маршруту, разом з її позицією (індексом) у цьому напрямку. */
function nearestStopInDirection(
  direction: RouteDirectionVariant,
  lat: number,
  lng: number
): { stop: StopItem; dist: number; idx: number } | null {
  let best: { stop: StopItem; dist: number; idx: number } | null = null;
  direction.stopIds.forEach((stopId, idx) => {
    const stop = stopsMap.get(stopId);
    if (!stop) return;
    const dist = distanceMetersLatLng(lat, lng, stop.position.lat, stop.position.lng);
    if (!best || dist < best.dist) best = { stop, dist, idx };
  });
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

const TRANSFER_WALK_RADIUS_M = 350; // реалістична пересадка пішки — не через пів міста
const MAX_NEARBY_TRANSFER_CANDIDATES = 6; // на кожну зупинку — не більше N найближчих сусідів

/**
 * ДОДАТКОВИЙ КАНАЛ ПЕРЕСАДОК — за збігом НАЗВИ зупинки.
 * -----------------------------------------------------------------------
 * Реальний приклад, який раніше ламав побудову маршруту: тролейбус №13
 * приїжджає на "Станція метро Захисників України" (зупинка тролейбуса/
 * автобуса), а трамвай №27 зупиняється на зупинці з ТІЄЮ Ж НАЗВОЮ, але
 * фізично на іншій стороні транспортного вузла — 380–420 м пішки. Це
 * більше за TRANSFER_WALK_RADIUS_M (350 м), тож `nearbyStopsMap` така
 * пересадка НЕ бачила, і роутер не пропонував пересісти з 13-го на 27-й
 * навіть на кінцевій — хоча фізично це саме та точка, куди їде пасажир.
 *
 * Перевірка по всій базі зупинок показала: це не поодинокий випадок, а
 * системна закономірність — десятки пар зупинок різних видів транспорту
 * з ІДЕНТИЧНОЮ назвою (та сама станція метро, той самий перехрестя/зупинка
 * "вулиця N") розташовані одна від одної в діапазоні 350–850 м.
 *
 * Просто підняти TRANSFER_WALK_RADIUS_M для ВСІХ зупинок небезпечно: на
 * довгій вулиці зі спільною назвою (напр. "вул. Гвардійців Широнінців")
 * зупинки на різних перехрестях тієї самої вулиці теж матимуть однакову
 * назву, але це РІЗНІ, не пов'язані між собою зупинки за 700–850 м одна
 * від одної — визнати їх пересадкою означало б пропонувати пасажиру
 * "вийти і йти 10 хвилин вздовж вулиці на іншу зупинку з такою ж назвою".
 *
 * Тому збіг назви враховуємо ОКРЕМИМ, вужчим каналом:
 *  - для станцій метро ("Станція метро …") — до 600 м: це справді єдиний
 *    великий транспортний вузол з кількома виходами/платформами;
 *  - для решти однаково названих зупинок — до 500 м: трохи ширше за
 *    базовий радіус (350 м), саме щоб покрити випадки на кшталт описаного
 *    вище, але не настільки широко, щоб зловити випадкові збіги назв на
 *    різних кінцях довгої вулиці.
 */
const SAME_NAME_METRO_TRANSFER_RADIUS_M = 600;
const SAME_NAME_TRANSFER_RADIUS_M = 500;

function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const sameNameTransferMap = new Map<string, { stop: StopItem; walkM: number }[]>();
{
  const byName = new Map<string, StopItem[]>();
  for (const s of stopsData) {
    const key = normalizeStopName(s.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(s);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const radius = name.includes('станція метро') ? SAME_NAME_METRO_TRANSFER_RADIUS_M : SAME_NAME_TRANSFER_RADIUS_M;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const walkM = distanceMetersLatLng(a.position.lat, a.position.lng, b.position.lat, b.position.lng);
        if (walkM > radius) continue;
        sameNameTransferMap.set(a.id, [...(sameNameTransferMap.get(a.id) ?? []), { stop: b, walkM }]);
        sameNameTransferMap.set(b.id, [...(sameNameTransferMap.get(b.id) ?? []), { stop: a, walkM }]);
      }
    }
  }
}

/**
 * КРИТИЧНО ДЛЯ ПЕРЕСАДОК: генералізований індекс "яка зупинка поруч з якою
 * пішки", побудований для ВСІХ зупинок ВСІХ видів транспорту одразу —
 * автобус, тролейбус, трамвай, метро.
 *
 * Раніше пересадка між різними видами транспорту вважалась можливою лише
 * у двох випадках: (1) буквально та сама зупинка (той самий stopId) або
 * (2) один із трьох зашитих переходів метро (`METRO_INTERCHANGES`). Через
 * це, наприклад, тролейбусна зупинка і автобусна зупинка на протилежному
 * боці тієї самої вулиці (реальна пересадка за 20–30 секунд ходьби, але
 * ДВА РІЗНИХ stopId у джерелі даних) не розпізнавались як пересадка
 * взагалі — роутер не знаходив жодного варіанту з пересадкою і, розширюючи
 * радіус пошуку "від зупинки" аж до 2.2 км, фактично будував по суті
 * пішохідний маршрут там, де мала бути коротка пересадка з одного
 * транспорту на інший.
 *
 * Тепер для кожної зупинки заздалегідь рахуємо всі інші зупинки (будь-якого
 * виду транспорту) в межах `TRANSFER_WALK_RADIUS_M` — і саме цей список
 * (разом із явними переходами метро та пересадками за збігом назви,
 * `sameNameTransferMap`) використовується як кандидати на пересадку. Пішки
 * в межах поїздки завжди йдемо ЛИШЕ до/від зупинок — жодних "пішохідних"
 * ділянок замість реальної пересадки на транспорт.
 */
const nearbyStopsMap = new Map<string, { stop: StopItem; walkM: number }[]>();
for (const a of stopsData) {
  const nearby: { stop: StopItem; walkM: number }[] = [];
  for (const b of stopsData) {
    if (a.id === b.id) continue;
    const walkM = distanceMetersLatLng(a.position.lat, a.position.lng, b.position.lat, b.position.lng);
    if (walkM <= TRANSFER_WALK_RADIUS_M) nearby.push({ stop: b, walkM });
  }
  nearby.sort((x, y) => x.walkM - y.walkM);
  nearbyStopsMap.set(a.id, nearby.slice(0, MAX_NEARBY_TRANSFER_CANDIDATES));
}

/**
 * Повертає всіх зупинок-кандидатів на пересадку з даної зупинки: саму
 * зупинку (пересадка без ходьби, якщо другий маршрут теж її обслуговує),
 * явні пересадочні вузли метро (пріоритетно — це реальні перевірені
 * підземні переходи), зупинки з ІДЕНТИЧНОЮ назвою поруч (`sameNameTransferMap`
 * — див. коментар вище, найтиповіше для станцій метро з кількома
 * платформами різних видів транспорту) та будь-які інші найближчі зупинки
 * БУДЬ-ЯКОГО виду транспорту в межах `TRANSFER_WALK_RADIUS_M` — саме це
 * дозволяє пересідати з тролейбуса на автобус, трамвай чи метро і навпаки,
 * а не лише в межах одного й того самого маршруту чи однієї зупинки.
 */
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

  for (const candidate of sameNameTransferMap.get(stop.id) ?? []) {
    if (seen.has(candidate.stop.id)) continue;
    seen.add(candidate.stop.id);
    result.push(candidate);
  }

  for (const candidate of nearbyStopsMap.get(stop.id) ?? []) {
    if (seen.has(candidate.stop.id)) continue;
    seen.add(candidate.stop.id);
    result.push(candidate);
  }

  return result;
}


export interface TripLeg {
  route: RouteItem;
  /** Напрямок руху цієї ділянки (кінцева/назва) — див. RouteDirectionVariant. */
  headsign: string;
  /** Впорядкована послідовність зупинок ІМЕННО цього напрямку — коректна
   *  основа для підрахунку кількості зупинок і малювання шляху на карті
   *  (route.stopIds завжди відповідає лише напрямку "туди"). */
  directionStopIds: string[];
  boardStop: StopItem;
  alightStop: StopItem;
  /** Пішки від виходу з попередньої ділянки до посадки на цю (перехід між
   *  двома різними, але пов'язаними пересадочними станціями, напр. метро). */
  transferWalkFromM?: number;
  /** Реальна вулична геометрія САМОЇ ділянки транспорту (посадка → вихід),
   *  отримана через OSRM (профіль driving) — заповнюється лише для
   *  маршрутів, для яких немає точної KML-геометрії (routeGeometries.json).
   *  Якщо є — buildTripPathGeoJson малює саме її замість ламаної по
   *  координатах самих зупинок (яка на рідких зупинках виглядає як набір
   *  прямих відрізків "навпростець"). */
  transitPath?: [number, number][];
  /** Реальна геометрія цього пішого переходу вздовж вуличної мережі OSM
   *  (заповнюється refineTripPlansWithOSM) — без неї карта раніше малювала
   *  пряму лінію "навпростець" через будівлі/річку. */
  transferWalkPath?: [number, number][];
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
  /** Реальна геометрія пішого шляху "Звідки" → перша зупинка посадки,
   *  вздовж вуличної мережі OSM (заповнюється refineTripPlansWithOSM). */
  boardWalkPath?: [number, number][];
  /** Те саме для ділянки "остання зупинка виходу" → "Куди". */
  alightWalkPath?: [number, number][];
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

/** Кількість зупинок, які фактично проїде пасажир на цій ділянці (за позицією в directionStopIds — коректному напрямку). */
function stopsRiddenOnLeg(leg: TripLeg): number {
  const boardIdx = leg.directionStopIds.indexOf(leg.boardStop.id);
  const alightIdx = leg.directionStopIds.indexOf(leg.alightStop.id);
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

/** Максимальна кількість "третіх ніг" (route3), що переглядаються на
 *  кожну незавершену 2-леговую гілку — тримає O(routes^3) під контролем:
 *  третій етап пошуку запускається ЛИШЕ для тих 2-легових кандидатів, чия
 *  висадка не дотягнула до пункту призначення в межах поточного радіуса. */
const MAX_THIRD_LEG_ATTEMPTS_PER_BRANCH = 40;

/**
 * Намагається "дотягнути" незавершену поїздку (1 або 2 ноги вже відомі,
 * остання висадка — `fromStop`) до пункту призначення ще однією ногою.
 * Повертає найкращий (найближчий до `toLat/toLng`) валідний варіант
 * серед усіх маршрутів/напрямків, доступних із зупинок-кандидатів на
 * пересадку біля `fromStop` (сама зупинка + пішохідні сусіди +
 * пересадочні вузли метро) — окрім маршрутів, уже використаних раніше
 * в цій поїздці (`excludeRouteIds`), щоб не "пересідати" на той самий
 * маршрут або їхати назад тим самим шляхом.
 */
function bestNextLeg(
  fromStop: StopItem,
  excludeRouteIds: Set<string>,
  toLat: number,
  toLng: number
): {
  route: RouteItem;
  direction: RouteDirectionVariant;
  boardStop: StopItem;
  boardWalkM: number;
  alightStop: StopItem;
  alightDist: number;
} | null {
  let best: {
    route: RouteItem;
    direction: RouteDirectionVariant;
    boardStop: StopItem;
    boardWalkM: number;
    alightStop: StopItem;
    alightDist: number;
  } | null = null;
  let attempts = 0;

  for (const candidate of getTransferCandidates(fromStop)) {
    for (const routeId of candidate.stop.routeIds) {
      if (excludeRouteIds.has(routeId)) continue;
      const route = routesData.find((r) => r.id === routeId);
      if (!route) continue;

      for (const direction of getRouteDirections(route)) {
        const boardIdx = direction.stopIds.indexOf(candidate.stop.id);
        if (boardIdx === -1) continue;
        if (attempts++ > MAX_THIRD_LEG_ATTEMPTS_PER_BRANCH) return best;

        let bestAlight: { stop: StopItem; dist: number } | null = null;
        for (let j = boardIdx + 1; j < direction.stopIds.length; j++) {
          const s = stopsMap.get(direction.stopIds[j]);
          if (!s) continue;
          const dist = distanceMetersLatLng(toLat, toLng, s.position.lat, s.position.lng);
          if (!bestAlight || dist < bestAlight.dist) bestAlight = { stop: s, dist };
        }
        if (!bestAlight) continue;
        if (!best || bestAlight.dist < best.alightDist) {
          best = {
            route,
            direction,
            boardStop: candidate.stop,
            boardWalkM: candidate.walkM,
            alightStop: bestAlight.stop,
            alightDist: bestAlight.dist
          };
        }
      }
    }
  }

  return best;
}

/**
 * Будує варіанти поїздки громадським транспортом між двома точками:
 * прямі маршрути, з ОДНІЄЮ пересадкою і, якщо навіть так до пункту
 * призначення не дотягнутись у розумному радіусі (маршрут іде через
 * увесь центр, і потрібно двічі змінити транспорт — типова ситуація у
 * "топових" застосунках на кшталт Google Maps/2GIS/Citymapper), — з
 * ДВОМА пересадками. Кожна наступна нога шукається жадібно (найближча
 * до мети висадка серед доступних маршрутів на зупинках-кандидатах), що
 * тримає час пошуку прийнятним навіть при O(маршрутів) у кубі в гіршому
 * випадку — третя нога переглядається лише для незавершених гілок.
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
      legs: [
        {
          route: o.route,
          headsign: o.headsign,
          directionStopIds: o.directionStopIds,
          boardStop: o.boardStop,
          alightStop: o.alightStop
        }
      ],
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
      for (const direction1 of getRouteDirections(route1)) {
        const board = nearestStopInDirection(direction1, fromLat, fromLng);
        if (!board || board.dist > radius) continue;

        // Пересадкою може бути лише зупинка, що йде ПІСЛЯ посадки в
        // порядку руху цього напрямку — інакше транспорт мав би заїхати
        // туди до того, як забрав пасажира.
        for (let idx = board.idx + 1; idx < direction1.stopIds.length; idx++) {
          const transferStop = stopsMap.get(direction1.stopIds[idx]);
          if (!transferStop) continue;

          // Пересадка можлива або на цій самій зупинці (routeId2 в її
          // routeIds), або на пов'язаній пересадочній станції поруч
          // (напр. метро: Майдан Конституції ↔ Історичний музей).
          for (const candidate of getTransferCandidates(transferStop)) {
            for (const routeId2 of candidate.stop.routeIds) {
              if (routeId2 === route1.id) continue;
              const route2 = routesData.find((r) => r.id === routeId2);
              if (!route2) continue;

              for (const direction2 of getRouteDirections(route2)) {
                const boardIdx2 = direction2.stopIds.indexOf(candidate.stop.id);
                if (boardIdx2 === -1) continue;

                let bestAlight: { stop: StopItem; dist: number; idx: number } | null = null;
                for (let j = boardIdx2 + 1; j < direction2.stopIds.length; j++) {
                  const s = stopsMap.get(direction2.stopIds[j]);
                  if (!s) continue;
                  const dist = distanceMetersLatLng(toLat, toLng, s.position.lat, s.position.lng);
                  if (!bestAlight || dist < bestAlight.dist) bestAlight = { stop: s, dist, idx: j };
                }
                if (!bestAlight) continue;

                const pairKey = `${route1.id}|${direction1.headsign}|${transferStop.id}|${candidate.stop.id}|${route2.id}|${direction2.headsign}`;
                if (seenPairs.has(pairKey)) continue;
                seenPairs.add(pairKey);

                const leg1: TripLeg = {
                  route: route1,
                  headsign: direction1.headsign,
                  directionStopIds: direction1.stopIds,
                  boardStop: board.stop,
                  alightStop: transferStop
                };
                const leg2: TripLeg = {
                  route: route2,
                  headsign: direction2.headsign,
                  directionStopIds: direction2.stopIds,
                  boardStop: candidate.stop,
                  alightStop: bestAlight.stop,
                  transferWalkFromM: candidate.walkM
                };

                if (bestAlight.dist <= radius) {
                  // Двох ніг досить — висадка вже в межах пішохідної відстані від мети.
                  const plan: TripPlan = {
                    legs: [leg1, leg2],
                    boardWalkM: board.dist,
                    alightWalkM: bestAlight.dist,
                    transfersCount: 1,
                    estimatedMinutes: 0
                  };
                  plan.estimatedMinutes = estimateTripMinutes(plan);
                  candidates.push(plan);
                } else if (bestAlight.dist <= radius * 3) {
                  // Не дотягнули навіть у розширеному радіусі — пробуємо
                  // третю ногу (друга пересадка) з поточної точки висадки.
                  const third = bestNextLeg(
                    bestAlight.stop,
                    new Set([route1.id, route2.id]),
                    toLat,
                    toLng
                  );
                  if (!third || third.alightDist > radius) continue;

                  const leg3: TripLeg = {
                    route: third.route,
                    headsign: third.direction.headsign,
                    directionStopIds: third.direction.stopIds,
                    boardStop: third.boardStop,
                    alightStop: third.alightStop,
                    transferWalkFromM: third.boardWalkM
                  };

                  const tripleKey = `${pairKey}|${third.route.id}|${third.direction.headsign}|${third.boardStop.id}`;
                  if (seenPairs.has(tripleKey)) continue;
                  seenPairs.add(tripleKey);

                  const plan: TripPlan = {
                    legs: [leg1, leg2, leg3],
                    boardWalkM: board.dist,
                    alightWalkM: third.alightDist,
                    transfersCount: 2,
                    estimatedMinutes: 0
                  };
                  plan.estimatedMinutes = estimateTripMinutes(plan);
                  candidates.push(plan);
                }
              }
            }
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
  const allPlans = [...direct, ...transferPlans].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);

  // "Розумне" ранжування, як у топових застосунках: не просто N
  // найшвидших підряд (вони можуть виявитись 6 варіантами тієї самої
  // пересадки з мінімальними відхиленнями), а найшвидший варіант для
  // КОЖНОЇ кількості пересадок (0, 1, 2) — навіть якщо він трохи
  // повільніший за глобально найшвидший — плюс решта топ-варіантів за
  // часом. Це дає пасажиру реальний вибір "швидше, але з пересадкою" чи
  // "довше, зате без пересадок", а не ілюзію вибору з майже однакових
  // варіантів.
  const picked: TripPlan[] = [];
  const pickedKeys = new Set<string>();
  const planKey = (p: TripPlan) => p.legs.map((l) => `${l.route.id}:${l.boardStop.id}:${l.alightStop.id}`).join('>');

  for (const transfers of [0, 1, 2]) {
    const bestForTransfers = allPlans.find((p) => p.transfersCount === transfers);
    if (bestForTransfers) {
      const key = planKey(bestForTransfers);
      if (!pickedKeys.has(key)) {
        pickedKeys.add(key);
        picked.push(bestForTransfers);
      }
    }
  }

  for (const plan of allPlans) {
    if (picked.length >= maxOptions) break;
    const key = planKey(plan);
    if (pickedKeys.has(key)) continue;
    pickedKeys.add(key);
    picked.push(plan);
  }

  return picked.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes).slice(0, maxOptions);
}

export const localRoutes = {
  all: (): RouteItem[] => routesData,
  getById: (id: string): RouteItem | undefined => routesData.find((r) => r.id === id),
  /**
   * `routesReal.json` містить кілька історичних варіантів запису одного й
   * того самого реального маршруту (наприклад одразу "trolleybus-1",
   * "route-trolleybus-1-fwd" і "route-trolleybus-1-bwd", подекуди навіть
   * буквально продубльовані) — вони лишаються в даних, бо на них посилаються
   * `stopIds` зупинок (щоб на картці зупинки коректно показати "які
   * маршрути тут ходять"). Але у списку маршрутів за видом транспорту це
   * виглядає як 3-5 однакових карток підряд. Тому саме тут — і тільки тут —
   * схлопуємо їх до однієї картки на номер маршруту, вибираючи
   * найповніший запис (найбільше зупинок разом в обидва боки).
   */
  getByKind: (kind: TransportKind): RouteItem[] => {
    const byNumber = new Map<string, RouteItem>();
    for (const r of routesData) {
      if (r.kind !== kind) continue;
      const existing = byNumber.get(r.number);
      if (!existing || r.stopIds.length > existing.stopIds.length) {
        byNumber.set(r.number, r);
      }
    }
    return Array.from(byNumber.values());
  },
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
