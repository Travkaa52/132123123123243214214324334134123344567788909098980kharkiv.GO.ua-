/**
 * Уточнення пішохідних відстаней через публічний OSRM-роутер, побудований
 * на даних OpenStreetMap (router.project-osrm.org, профіль "foot").
 *
 * Навіщо це потрібно: `buildTripPlans` (data/localData.ts) підбирає
 * найближчі зупинки та рахує "пішки скільки метрів" по прямій (haversine).
 * По прямій — це оптимістична оцінка: реальний шлях вздовж вулиць,
 * пішохідних переходів, довкола будівель/парків/річки завжди довший,
 * а іноді і зовсім інший маршрут (наприклад, треба обійти квартал чи
 * дійти до найближчого пішохідного переходу через проспект). Ігнорування
 * цього може призвести до того, що "найкоротший" за прямою варіант
 * насправді вимагає довшої пішої прогулянки, ніж інший варіант поруч.
 *
 * Ця утиліта робить реальний запит маршруту по вуличній мережі OSM і
 * повертає точну відстань/час пішки. Використовується як другий,
 * уточнюючий прохід ПІСЛЯ швидкого початкового підбору варіантів —
 * так інтерфейс не чекає мережу, щоб показати хоч щось, а потім тихо
 * підмінює приблизні цифри на точні й, за потреби, переупорядковує
 * варіанти поїздки.
 */

export interface OsrmWalkResult {
  distanceM: number;
  durationS: number;
  /** Геометрія шляху (для майбутньої відрисовки пішохідної ділянки на карті). */
  coordinates: [number, number][];
}

const OSRM_FOOT_BASE = 'https://router.project-osrm.org/route/v1/foot';
const OSRM_DRIVING_BASE = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 3000;

/** Проста оцінка "запасним ходом", якщо OSRM недоступний: пряма відстань,
 *  помножена на типовий коефіцієнт звивистості вуличної мережі міста. */
const STRAIGHT_LINE_CORRECTION_FACTOR = 1.35;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Невеликий in-memory кеш: одні й ті самі пари точок (найпопулярніші
// зупинки) запитуються повторно дуже часто, кеш рятує від зайвих
// мережевих запитів і робить повторні побудови маршруту миттєвими.
const cache = new Map<string, OsrmWalkResult>();
function cacheKey(aLat: number, aLng: number, bLat: number, bLng: number): string {
  return `${aLat.toFixed(5)},${aLng.toFixed(5)}|${bLat.toFixed(5)},${bLng.toFixed(5)}`;
}

/**
 * Реальна пішохідна відстань/час між двома точками по вуличній мережі
 * OpenStreetMap. Ніколи не кидає виняток — при мережевій помилці чи
 * таймауті тихо повертає скориговану оцінку по прямій.
 */
export async function getWalkingRoute(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): Promise<OsrmWalkResult> {
  const key = cacheKey(aLat, aLng, bLat, bLng);
  const cached = cache.get(key);
  if (cached) return cached;

  const straightLineM = haversineM(aLat, aLng, bLat, bLng);
  const fallback: OsrmWalkResult = {
    distanceM: straightLineM * STRAIGHT_LINE_CORRECTION_FACTOR,
    durationS: (straightLineM * STRAIGHT_LINE_CORRECTION_FACTOR) / 1.25, // ~1.25 м/с — середній темп пішохода
    coordinates: [
      [aLng, aLat],
      [bLng, bLat]
    ]
  };

  // Дуже короткі "пересадки на місці" (0 м) не варто ганяти через мережу.
  if (straightLineM < 3) {
    const zero: OsrmWalkResult = { distanceM: 0, durationS: 0, coordinates: fallback.coordinates };
    cache.set(key, zero);
    return zero;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${OSRM_FOOT_BASE}/${aLng},${aLat};${bLng},${bLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallback;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || typeof route.distance !== 'number') return fallback;

    const result: OsrmWalkResult = {
      distanceM: route.distance,
      durationS: route.duration ?? fallback.durationS,
      coordinates: route.geometry?.coordinates ?? fallback.coordinates
    };
    cache.set(key, result);
    return result;
  } catch {
    // Мережа недоступна, таймаут, CORS тощо — не ламаємо побудову маршруту,
    // просто працюємо з відкоригованою оцінкою по прямій.
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

/** Уточнює декілька пішохідних ділянок паралельно (Promise.all), з єдиним
 *  спільним таймаутом — використовується для "другого проходу" по вже
 *  побудованих варіантах поїздки. */
export async function getWalkingRoutesBatch(
  pairs: Array<{ aLat: number; aLng: number; bLat: number; bLng: number }>
): Promise<OsrmWalkResult[]> {
  return Promise.all(pairs.map((p) => getWalkingRoute(p.aLat, p.aLng, p.bLat, p.bLng)));
}

// Окремий кеш для наземного транспорту (профіль driving) — координати ті
// самі, що й для пішоходів, могли б збігатись, тож ключі кешу розділяємо,
// щоб пішохідний і транспортний профіль не переписували один одного.
const drivingCache = new Map<string, [number, number][]>();

/**
 * Реальна вулична траса для ДІЛЯНКИ ТРАНСПОРТУ (не пішохода) між зупинкою
 * посадки і зупинкою висадки — профіль OSRM "driving" (найближчий по духу
 * до руху автобуса/тролейбуса/трамвая по вулицях, коли точної KML-схеми
 * маршруту немає в routeGeometries.json).
 *
 * Це саме фолбек для ~половини маршрутів без офіційної KML-геометрії:
 * без нього карта малювала ламану лінію по самих зупинках (`stopSequence`),
 * що на рідких зупинках виглядає як прямі відрізки "навпростець" через
 * квартали. Ніколи не кидає виняток — при помилці/таймауті повертає `null`,
 * і виклик коду сам вирішує, чим замінити (проміжні зупинки або пряма).
 */
export async function getTransitStreetPath(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): Promise<[number, number][] | null> {
  const key = cacheKey(aLat, aLng, bLat, bLng);
  const cached = drivingCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${OSRM_DRIVING_BASE}/${aLng},${aLat};${bLng},${bLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    const coords = route?.geometry?.coordinates as [number, number][] | undefined;
    if (!coords || coords.length < 2) return null;

    drivingCache.set(key, coords);
    return coords;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Паралельно уточнює вуличну траєкторію для декількох ділянок транспорту
 *  одразу (одна на кожен `leg`, для якого немає точної KML-геометрії). */
export async function getTransitStreetPathsBatch(
  pairs: Array<{ aLat: number; aLng: number; bLat: number; bLng: number }>
): Promise<Array<[number, number][] | null>> {
  return Promise.all(pairs.map((p) => getTransitStreetPath(p.aLat, p.aLng, p.bLat, p.bLng)));
}
