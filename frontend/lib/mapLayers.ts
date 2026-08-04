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

function dominantKind(kinds: TransportKind[]): TransportKind {
  for (const k of KIND_PRIORITY) {
    if (kinds.includes(k as TransportKind)) return k as TransportKind;
  }
  return kinds[0] ?? 'bus';
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
 * між ними, — якщо геометрія для маршруту є; інакше — по прямій між
 * зупинками зі списку route.stopIds.
 */
export function buildTripPathGeoJson(
  plan: TripPlan,
  fromPoint?: { lat: number; lng: number } | null,
  toPoint?: { lat: number; lng: number } | null
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];

  const addWalk = (a: [number, number], b: [number, number]) => {
    features.push({
      type: 'Feature',
      properties: { kind: 'walk', color: '#9AA3AE' },
      geometry: { type: 'LineString', coordinates: [a, b] }
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

    const realGeometry = ROUTE_GEOMETRIES[geometryKey(leg.route.kind, leg.route.number)];
    let coords: [number, number][];

    if (realGeometry && realGeometry.length > 0) {
      const flat = realGeometry.flat();
      const boardCoord: [number, number] = [leg.boardStop.position.lng, leg.boardStop.position.lat];
      const alightCoord: [number, number] = [leg.alightStop.position.lng, leg.alightStop.position.lat];

      const nearestIndex = (target: [number, number]) => {
        let bestI = 0;
        let bestD = Infinity;
        flat.forEach((c, i) => {
          const d = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2;
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        });
        return bestI;
      };

      const iBoard = nearestIndex(boardCoord);
      const iAlight = nearestIndex(alightCoord);
      const [lo, hi] = iBoard <= iAlight ? [iBoard, iAlight] : [iAlight, iBoard];
      const sliced = flat.slice(lo, hi + 1);
      coords = iBoard <= iAlight ? sliced : [...sliced].reverse();
      if (coords.length < 2) coords = [boardCoord, alightCoord];
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
        [leg.boardStop.position.lng, leg.boardStop.position.lat]
      );
    }
  });

  const firstLeg = plan.legs[0];
  const lastLeg = plan.legs[plan.legs.length - 1];

  if (fromPoint && firstLeg) {
    addWalk([fromPoint.lng, fromPoint.lat], [firstLeg.boardStop.position.lng, firstLeg.boardStop.position.lat]);
  }
  if (toPoint && lastLeg) {
    addWalk([lastLeg.alightStop.position.lng, lastLeg.alightStop.position.lat], [toPoint.lng, toPoint.lat]);
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
