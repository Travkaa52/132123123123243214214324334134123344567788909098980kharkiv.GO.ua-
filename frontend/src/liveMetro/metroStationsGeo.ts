/**
 * Точні геокоординати станцій Харківського метрополітену — розшифровані
 * напряму з офіційного файлу:
 *   src/assets/marshryt transporty kharkiv/Харьковское метро на карте Google.kml
 *
 * Це джерело координат (WGS84) для розрахунку "найближчої станції метро"
 * на головному екрані (LiveMetroWidget) — навмисно окремо від
 * data/stops.json (там координати округлені до 5 знаків і використовуються
 * для іншої підсистеми маршрутизації), щоб відстань до користувача
 * рахувалась з максимально точних вихідних даних.
 *
 * Ключ — schematic-id станції (`stop-metro-<slug>`), той самий, яким
 * оперують `liveMetro/schematicData.ts` і `liveMetro/liveMetroEngine.ts` —
 * тому значення з цієї мапи можна підставляти напряму без додаткового
 * перетворення id.
 */

export interface MetroStationGeo {
  lat: number;
  lng: number;
}

export const METRO_STATION_GEO: Record<string, MetroStationGeo> = {
  // Лінія 1 — Холодногірсько-заводська (червона)
  'stop-metro-holodna-gora': { lat: 49.9828767, lng: 36.1825322 },
  'stop-metro-vokzalna': { lat: 49.9896959, lng: 36.2066842 },
  'stop-metro-tsentralnyi-rynok': { lat: 49.9927954, lng: 36.2205001 },
  'stop-metro-maidan-konstytutsii': { lat: 49.9918717, lng: 36.2317259 },
  'stop-metro-levada': { lat: 49.9807886, lng: 36.2428692 },
  'stop-metro-sportyvna': { lat: 49.9792942, lng: 36.2611107 },
  'stop-metro-zavodska': { lat: 49.9757064, lng: 36.2811092 },
  'stop-metro-turboatom': { lat: 49.9721184, lng: 36.3019661 },
  'stop-metro-palats-sportu': { lat: 49.9661158, lng: 36.3211403 },
  'stop-metro-armiiska': { lat: 49.9618092, lng: 36.3428555 },
  'stop-metro-imeni-o-s-maselskogo': { lat: 49.9582527, lng: 36.3599048 },
  'stop-metro-traktornyi-zavod': { lat: 49.9526753, lng: 36.3787017 },
  'stop-metro-industrialna': { lat: 49.9465449, lng: 36.3980136 },

  // Лінія 2 — Салтівська (зелена)
  'stop-metro-istorychnyi-muzei': { lat: 49.992822, lng: 36.2318923 },
  'stop-metro-universytet': { lat: 50.0042702, lng: 36.2343384 },
  'stop-metro-iaroslava-mudrogo': { lat: 50.0035733, lng: 36.2484136 },
  'stop-metro-kyivska': { lat: 50.0011576, lng: 36.268997 },
  'stop-metro-akademika-barabashova': { lat: 50.002287, lng: 36.3025895 },
  'stop-metro-akademika-pavlova': { lat: 50.0095186, lng: 36.319042 },
  'stop-metro-studentska': { lat: 50.017867, lng: 36.3292322 },
  'stop-metro-saltivska': { lat: 50.0250723, lng: 36.3357554 },

  // Лінія 3 — Олексіївська (синя)
  'stop-metro-metrobudivnykiv': { lat: 49.9782028, lng: 36.2625342 },
  'stop-metro-zahysnykiv-ukrainy': { lat: 49.9886889, lng: 36.2649375 },
  'stop-metro-arhitektora-beketova': { lat: 49.9982701, lng: 36.2406166 },
  'stop-metro-derzhprom': { lat: 50.0052766, lng: 36.2328061 },
  'stop-metro-naukova': { lat: 50.0127232, lng: 36.2265404 },
  'stop-metro-botanichnyi-sad': { lat: 50.0254075, lng: 36.2234505 },
  'stop-metro-23-serpnia': { lat: 50.0354144, lng: 36.2196739 },
  'stop-metro-oleksiivska': { lat: 50.0502937, lng: 36.2065045 },
  'stop-metro-peremoga': { lat: 50.0595656, lng: 36.2018227 }
};

/** Гаверсинова відстань (метри) між двома точками WGS84. */
export function haversineMeters(a: MetroStationGeo, b: MetroStationGeo): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
