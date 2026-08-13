import { localRoutes, localStops } from '@/data/localData';
import type { TripPlan } from '@/data/localData';
import { KIND_PRIORITY, TRANSPORT_COLORS } from '@/config/map';
import routeGeometriesJson from '@/data/routeGeometries.json';
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { TransportKind } from '@/types/transport';

/**
 * Реальнi геометрії маршрутів (координати вздовж вулиць), розшифровані з
 * офіційних KML-схем. Ключ — `${kind}-${number}`.
 */
const ROUTE_GEOMETRIES = routeGeometriesJson as unknown as Record<string, [number, number][][]>;

function geometryKey(kind: TransportKind, number: string): string {
  return `${kind}-${number}`;
}

/** Чи є для цього маршруту точна геометрія з офіційної KML-схеми
 *  (routeGeometries.json). Використовується як тригер для OSRM-фолбека
 *  ділянки транспорту (getTransitStreetPath) — щоб не ганяти мережевий
 *  запит там, де й так є найточніше можливе джерело. */
export function hasKmlGeometry(kind: TransportKind, number: string): boolean {
  const g = ROUTE_GEOMETRIES[geometryKey(kind, number)];
  return !!g && g.length > 0;
}

function dominantKind(kinds: TransportKind[]): TransportKind {
  for (const k of KIND_PRIORITY) {
    if (kinds.includes(k as TransportKind)) return k as TransportKind;
  }
  return kinds[0] ?? 'bus';
}

function sqDist(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * ГОЛОВНИЙ ФІКС: раніше геометрія маршруту (масив із декількох KML-ліній,
 * зазвичай "туди" + "назад") просто "сплющувалась" в один список точок
 * (`.flat()`), а зупинки посадки/висадки шукались як НАЙБЛИЖЧА точка в
 * усьому цьому сплющеному масиві незалежно одна від одної. Через це на
 * кільцевих/петльових маршрутах (а майже всі маршрути Харкова — саме
 * такі: 2 KML-лінії, що фізично з'єднуються в одну петлю) посадка й
 * висадка часто "прилипали" до різних, непослідовних ліній — і замість
 * шматка реальної вулиці малювалась пряма лінія напряму через місто
 * (найкоротший фолбек `coords.length < 2 → [board, alight]`) або
 * "розірваний" шлях, що телепортується.
 *
 * Тут дві зміни:
 *  1) `connectGeometrySegments` з'єднує KML-лінії в один суцільний шлях
 *     у правильному порядку/орієнтації (за збігом кінцевих точок), а не
 *     просто конкатенує їх як є.
 *  2) `matchStopsMonotonic` прив'язує ВСІ зупинки напрямку (а не лише
 *     дві — посадку й висадку) до цього шляху по порядку, з пошуком
 *     "тільки вперед" від попередньої знайденої точки. Це використовує
 *     вже відомий порядок зупинок маршруту, щоб однозначно розв'язати
 *     неоднозначність на петлях/самоперетинах — головна причина, чому
 *     раніше посадка й висадка могли "збитись" на різні гілки маршруту.
 */
function connectGeometrySegments(segments: [number, number][][]): [number, number][] {
  if (segments.length === 0) return [];
  let path: [number, number][] = [...segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length === 0) continue;
    const tail = path[path.length - 1];
    const distToStart = sqDist(tail, seg[0]);
    const distToEnd = sqDist(tail, seg[seg.length - 1]);
    const oriented = distToEnd < distToStart ? [...seg].reverse() : seg;
    // Уникаємо дубльованої точки стику, якщо кінці збігаються.
    const startFrom = sqDist(tail, oriented[0]) < 1e-12 ? 1 : 0;
    path = path.concat(oriented.slice(startFrom));
  }
  return path;
}

interface StopMatch {
  indices: number[];
  totalError: number;
}

/**
 * ГОЛОВНИЙ ФІКС #2: попередня версія (`matchStopsMonotonic`) прив'язувала
 * зупинки ЖАДІБНО — для кожної зупинки шукала найближчу точку шляху лише
 * "вперед" від позиції попередньої, беручи ЛОКАЛЬНО найкращий варіант.
 * На кільцевих/петльових маршрутах (а це переважна більшість маршрутів
 * Харкова — виїзд і повернення до тієї самої кінцевої) початок і кінець
 * з'єднаного шляху фізично лежать в одній точці. Через це ПЕРША ж зупинка
 * (кінцева) могла на лічені метри "виграти" прив'язку не до індексу 0
 * (початок шляху), а до індексу в самому кінці масиву (бо там теж проходить
 * шлях повз ту саму кінцеву) — і тоді ВСІ наступні зупинки жадібно шукались
 * вже тільки в вузькому хвості шляху, даючи похибку в кілометри й навіть
 * десятки кілометрів для переважної більшості маршрутів.
 *
 * Рішення: замінити жадібний пошук на динамічне програмування, що шукає
 * ГЛОБАЛЬНО оптимальну (мінімальна сумарна похибка) монотонну (неспадну)
 * послідовність індексів для ВСІХ зупинок одразу, а не крок за кроком.
 * Складність O(n_зупинок × m_точок_шляху) — тривіальна для маршруту (≤60
 * зупинок × ≤300 точок геометрії), рахується миттєво, і завдяки глобальній
 * оптимізації неоднозначність на початку/кінці петлі більше не "тягне за
 * собою" помилку по всьому маршруту.
 */
function matchStopsMonotonic(path: [number, number][], stopCoords: [number, number][]): StopMatch {
  const n = stopCoords.length;
  const m = path.length;
  if (m === 0 || n === 0) return { indices: stopCoords.map(() => 0), totalError: Infinity };

  // dpPrev[j] — мінімальна сумарна похибка прив'язки zupynok[0..k] за умови,
  // що zupynka[k] прив'язана саме до path[j].
  let dpPrev = new Float64Array(m);
  for (let j = 0; j < m; j++) dpPrev[j] = sqDist(path[j], stopCoords[0]);

  // backptr[k][j] — який індекс шляху було обрано для zupynka[k-1], якщо
  // zupynka[k] прив'язана до path[j] (для відновлення повного шляху назад).
  const backptr: Int32Array[] = [];

  for (let k = 1; k < n; k++) {
    const dpCur = new Float64Array(m);
    const bp = new Int32Array(m);
    // runningMin — мінімум dpPrev[0..j] і індекс, на якому він досягнутий;
    // рахуємо "на льоту" зліва направо, щоб уникнути O(m^2).
    let bestVal = dpPrev[0];
    let bestArg = 0;
    for (let j = 0; j < m; j++) {
      if (dpPrev[j] < bestVal) {
        bestVal = dpPrev[j];
        bestArg = j;
      }
      dpCur[j] = sqDist(path[j], stopCoords[k]) + bestVal;
      bp[j] = bestArg;
    }
    backptr.push(bp);
    dpPrev = dpCur;
  }

  let bestJ = 0;
  let bestVal = dpPrev[0];
  for (let j = 1; j < m; j++) {
    if (dpPrev[j] < bestVal) {
      bestVal = dpPrev[j];
      bestJ = j;
    }
  }

  const indices = new Array<number>(n);
  let j = bestJ;
  for (let k = n - 1; k >= 0; k--) {
    indices[k] = j;
    if (k > 0) j = backptr[k - 1][j];
  }

  return { indices, totalError: bestVal };
}

const routePathCache = new Map<string, [number, number][]>();

/** Повний, з'єднаний в один шлях контур маршруту (кеш на ключ геометрії). */
function getConnectedRoutePath(key: string): [number, number][] | null {
  const cached = routePathCache.get(key);
  if (cached) return cached;
  const segments = ROUTE_GEOMETRIES[key];
  if (!segments || segments.length === 0) return null;
  const path = connectGeometrySegments(segments);
  routePathCache.set(key, path);
  return path;
}

/**
 * Прив'язує ВЕСЬ впорядкований список зупинок одного напрямку маршруту
 * до реального шляху (пробуючи обидві орієнтації шляху — прямий і
 * реверсований — і обираючи ту, що дає меншу сумарну похибку прив'язки),
 * і повертає індекс уздовж цього шляху для кожної зупинки. Це
 * розраховується один раз на весь напрямок, а не окремо для посадки й
 * висадки — тому індекси для будь-якої пари зупинок цього напрямку
 * узгоджені між собою (монотонні відносно порядку руху).
 */
function matchDirectionToPath(
  path: [number, number][],
  stopCoords: [number, number][]
): { path: [number, number][]; indices: number[] } {
  const forward = matchStopsMonotonic(path, stopCoords);
  const reversedPath = [...path].reverse();
  const backward = matchStopsMonotonic(reversedPath, stopCoords);
  return backward.totalError < forward.totalError
    ? { path: reversedPath, indices: backward.indices }
    : { path, indices: forward.indices };
}

/**
 * Статичні шари маршрутів і зупинок на основі KML-даних.
 */
export function buildRouteLinesGeoJson(
  visibleKinds?: TransportKind[],
  selectedRouteId?: string | null
): FeatureCollection<LineString | MultiLineString> {
  const routes = localRoutes.all().filter((r) => !visibleKinds || visibleKinds.includes(r.kind));
  
  return {
    type: 'FeatureCollection',
    features: routes
      .map((route) => {
        const realGeometry = ROUTE_GEOMETRIES[geometryKey(route.kind, route.number)];

        // Якщо для маршруту немає геометрії в KML, пропускаємо його
        if (!realGeometry || realGeometry.length === 0) {
          return null;
        }

        const properties = {
          routeId: route.id,
          kind: route.kind,
          number: route.number,
          color: route.color ?? TRANSPORT_COLORS[route.kind],
          selected: selectedRouteId ? route.id === selectedRouteId : true,
          dimmed: !!selectedRouteId && route.id !== selectedRouteId
        };

        return {
          type: 'Feature' as const,
          properties,
          geometry: { type: 'MultiLineString' as const, coordinates: realGeometry }
        };
      })
      .filter((f): f is NonNullable<typeof f> => !!f)
  };
}

export function buildStopsGeoJson(visibleKinds?: TransportKind[]): FeatureCollection<Point> {
  const stops = localStops.all().filter((s) => !visibleKinds || s.kinds.some((k) => visibleKinds.includes(k)));
  return {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature' as const,
      properties: {
        stopId: stop.id,
        name: stop.name,
        kinds: stop.kinds.join(','),
        dominantKind: dominantKind(stop.kinds),
        isHub: stop.kinds.length > 1
      },
      geometry: { type: 'Point' as const, coordinates: [stop.position.lng, stop.position.lat] }
    }))
  };
}

/**
 * Будує GeoJSON для намальованого на карті шляху обраного варіанту поїздки
 * (`TripPlan`): одна лінія на кожну ділянку (`leg`), пофарбована кольором
 * її виду транспорту (`route.color`), + пунктирні пішохідні відрізки
 * "від точки Звідки до посадки", "пересадка" і "від виходу до точки Куди".
 *
 * Ділянка транспорту малюється вздовж РЕАЛЬНОЇ геометрії маршруту (KML),
 * обрізаної між зупинкою посадки та зупинкою виходу — а не прямою лінією
 * між ними, — якщо геометрія для маршруту є; інакше — по послідовності
 * зупинок цього напрямку; і лише як останній фолбек — пряма лінія між
 * посадкою й висадкою.
 */
export function buildTripPathGeoJson(
  plan: TripPlan,
  fromPoint?: { lat: number; lng: number } | null,
  toPoint?: { lat: number; lng: number } | null
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];

  const addWalk = (a: [number, number], b: [number, number], realPath?: [number, number][]) => {
    // Якщо є реальна геометрія (OSRM, після refineTripPlansWithOSM) —
    // малюємо саме її, вздовж вулиць/переходів. Раніше тут завжди була
    // пряма лінія "навпростець" між двома точками — навіть коли між ними
    // будівля, річка чи проспект без переходу — що виглядало як "іди
    // напряму" і не відповідало жодному реальному пішому маршруту.
    const coordinates = realPath && realPath.length >= 2 ? realPath : [a, b];
    features.push({
      type: 'Feature',
      properties: { kind: 'walk', color: '#9AA3AE' },
      geometry: { type: 'LineString', coordinates }
    });
  };

  plan.legs.forEach((leg, legIndex) => {
    // ВАЖЛИВО: індекси рахуємо по leg.directionStopIds — послідовності
    // зупинок САМЕ того напрямку, яким їде пасажир на цій ділянці, а не
    // по leg.route.stopIds (це завжди лише напрямок "туди" і для поїздки
    // "назад" зупинка посадки/висадки могла там взагалі бути відсутньою
    // або йти у хибному порядку — раніше це давало неправильно намальовану
    // чи навіть порожню лінію на карті для зворотних поїздок).
    const stopSequence = leg.directionStopIds ?? leg.route.stopIds;
    const boardIdx = stopSequence.indexOf(leg.boardStop.id);
    const alightIdx = stopSequence.indexOf(leg.alightStop.id);
    const forward = alightIdx >= boardIdx;
    const [startIdx, endIdx] = forward ? [boardIdx, alightIdx] : [alightIdx, boardIdx];

    const connectedPath = getConnectedRoutePath(geometryKey(leg.route.kind, leg.route.number));
    const boardCoord: [number, number] = [leg.boardStop.position.lng, leg.boardStop.position.lat];
    const alightCoord: [number, number] = [leg.alightStop.position.lng, leg.alightStop.position.lat];
    let coords: [number, number][];

    if (connectedPath && connectedPath.length > 1 && startIdx !== -1 && endIdx !== -1) {
      // Прив'язуємо ВЕСЬ напрямок (усі зупинки по порядку) до шляху одним
      // проходом — це узгоджує посадку й висадку між собою й не дає їм
      // "розбігтися" по різних гілках петльового маршруту (див. коментар
      // вище над connectGeometrySegments/matchStopsMonotonic).
      // Довжина й порядок мають лишитись 1:1 з stopSequence (щоб
      // boardIdx/alightIdx залишались валідними індексами в `indices`),
      // тож для зупинки без відомих координат підставляємо координати
      // сусідньої відомої зупинки замість того, щоб її пропускати.
      let lastKnownCoord: [number, number] = [leg.boardStop.position.lng, leg.boardStop.position.lat];
      const orderedStopCoords: [number, number][] = stopSequence.map((id) => {
        const s = localStops.getById(id);
        if (s) lastKnownCoord = [s.position.lng, s.position.lat];
        return lastKnownCoord;
      });

      const { path: matchedPath, indices } = matchDirectionToPath(connectedPath, orderedStopCoords);
      // indices вирівняні з тим самим порядком, що й stopSequence, тож
      // boardIdx/alightIdx (позиції посадки/висадки в напрямку) звідси й
      // беремо напряму — жодних окремих "найближчих точок" одна від одної.
      const iBoard = indices[boardIdx];
      const iAlight = indices[alightIdx];
      const [lo, hi] = iBoard <= iAlight ? [iBoard, iAlight] : [iAlight, iBoard];
      const sliced = matchedPath.slice(lo, hi + 1);
      coords = iBoard <= iAlight ? sliced : [...sliced].reverse();
      if (coords.length < 2) coords = [boardCoord, alightCoord];
    } else if (leg.transitPath && leg.transitPath.length >= 2) {
      // Немає KML для цього маршруту, зате refineTripPlansWithOSM уже
      // уточнив вуличну трасу через OSRM (профіль driving) — малюємо її
      // замість ламаної по рідких координатах самих зупинок.
      coords = leg.transitPath;
    } else if (startIdx !== -1 && endIdx !== -1) {
      coords = stopSequence
        .slice(startIdx, endIdx + 1)
        .map((id) => localStops.getById(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => [s.position.lng, s.position.lat] as [number, number]);
      if (!forward) coords = coords.reverse();
    } else {
      // Останній запасний варіант — обидві зупинки все одно відомі, тож
      // пряма лінія між ними краща за порожню/зламану ділянку на карті.
      coords = [
        [leg.boardStop.position.lng, leg.boardStop.position.lat],
        [leg.alightStop.position.lng, leg.alightStop.position.lat]
      ];
    }

    features.push({
      type: 'Feature',
      properties: {
        kind: 'transit',
        legIndex,
        transportKind: leg.route.kind,
        color: leg.route.color ?? TRANSPORT_COLORS[leg.route.kind],
        routeNumber: leg.route.number
      },
      geometry: { type: 'LineString', coordinates: coords }
    });

    // Пунктир пересадки: від виходу з попереднього legу до посадки на цей.
    const prevLeg = plan.legs[legIndex - 1];
    if (prevLeg) {
      addWalk(
        [prevLeg.alightStop.position.lng, prevLeg.alightStop.position.lat],
        [leg.boardStop.position.lng, leg.boardStop.position.lat],
        leg.transferWalkPath
      );
    }
  });

  const firstLeg = plan.legs[0];
  const lastLeg = plan.legs[plan.legs.length - 1];

  if (fromPoint && firstLeg) {
    addWalk(
      [fromPoint.lng, fromPoint.lat],
      [firstLeg.boardStop.position.lng, firstLeg.boardStop.position.lat],
      plan.boardWalkPath
    );
  }
  if (toPoint && lastLeg) {
    addWalk(
      [lastLeg.alightStop.position.lng, lastLeg.alightStop.position.lat],
      [toPoint.lng, toPoint.lat],
      plan.alightWalkPath
    );
  }

  return { type: 'FeatureCollection', features };
}

export function getRouteBounds(routeId: string): [number, number][] {
  const route = localRoutes.getById(routeId);
  if (!route) return [];
  return route.stopIds
    .map((stopId) => localStops.getById(stopId))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => [s.position.lng, s.position.lat] as [number, number]);
}
