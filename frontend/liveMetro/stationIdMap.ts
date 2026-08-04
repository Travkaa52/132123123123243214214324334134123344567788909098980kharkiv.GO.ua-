/**
 * Станції на схемі `pages/LiveMetroPage.tsx` використовують короткі id
 * (наприклад 'kholodna-hora'), а реальні джерела даних —
 * `liveMetro/timetableData.ts` (розклади) та `data/stops.json` /
 * `liveMetro/metroStationsGeo.ts` (геолокація) — використовують канонічний
 * id вигляду `stop-metro-<slug>`. Це відображення з'єднує схему з обома
 * джерелами, а `REAL_TO_SCHEMATIC_ID` — той самий словник у зворотному
 * напрямку, потрібний, коли треба перейти від реального id (наприклад,
 * знайденого як "найближча станція" за GPS-координатами) до короткого id,
 * яким оперує схема на `/metro/live`.
 */
export const TIMETABLE_STATION_ID: Record<string, string> = {
  'kholodna-hora': 'stop-metro-holodna-gora',
  vokzalna: 'stop-metro-vokzalna',
  'tsentralnyi-rynok': 'stop-metro-tsentralnyi-rynok',
  'maidan-konstytutsii': 'stop-metro-maidan-konstytutsii',
  levada: 'stop-metro-levada',
  sportyvna: 'stop-metro-sportyvna',
  zavodska: 'stop-metro-zavodska',
  turboatom: 'stop-metro-turboatom',
  'palats-sportu': 'stop-metro-palats-sportu',
  armiiska: 'stop-metro-armiiska',
  'imeni-maselskoho': 'stop-metro-imeni-o-s-maselskogo',
  'traktornyi-zavod': 'stop-metro-traktornyi-zavod',
  industrialna: 'stop-metro-industrialna',
  saltivska: 'stop-metro-saltivska',
  studentska: 'stop-metro-studentska',
  'akademika-pavlova': 'stop-metro-akademika-pavlova',
  'akademika-barabashova': 'stop-metro-akademika-barabashova',
  kyivska: 'stop-metro-kyivska',
  'yaroslava-mudroho': 'stop-metro-iaroslava-mudrogo',
  universytet: 'stop-metro-universytet',
  'istorychnyi-muzei': 'stop-metro-istorychnyi-muzei',
  peremoha: 'stop-metro-peremoga',
  oleksiivska: 'stop-metro-oleksiivska',
  '23-serpnia': 'stop-metro-23-serpnia',
  'botanichnyi-sad': 'stop-metro-botanichnyi-sad',
  naukova: 'stop-metro-naukova',
  derzhprom: 'stop-metro-derzhprom',
  'arkhitektora-beketova': 'stop-metro-arhitektora-beketova',
  'zakhysnykiv-ukrainy': 'stop-metro-zahysnykiv-ukrainy',
  metrobudivnykiv: 'stop-metro-metrobudivnykiv',
};

/** schematicStationId (короткий id зі схеми) -> stop-metro-<slug> (канонічний id). */
export function realStationId(schematicStationId: string): string {
  return TIMETABLE_STATION_ID[schematicStationId] ?? schematicStationId;
}

/** stop-metro-<slug> (канонічний id) -> schematicStationId (короткий id зі схеми). */
export const REAL_TO_SCHEMATIC_ID: Record<string, string> = Object.fromEntries(
  Object.entries(TIMETABLE_STATION_ID).map(([schematicId, realId]) => [realId, schematicId])
);

/** stop-metro-<slug> -> короткий id зі схеми, з фолбеком на сам вхідний id, якщо збігу немає. */
export function schematicStationId(realId: string): string {
  return REAL_TO_SCHEMATIC_ID[realId] ?? realId;
}
