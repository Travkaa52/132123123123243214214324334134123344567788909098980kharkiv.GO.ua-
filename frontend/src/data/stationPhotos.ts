/**
 * Фото станцій метро (assets/stancia/**) — зіставлення з id станції,
 * яким користуються schematicData.ts / stops.json ("stop-metro-<slug>").
 *
 * Назви файлів у репозиторії трохи розходяться з транслітерацією id
 * (наприклад, kholodna-hora.jpg ↔ id stop-metro-holodna-gora), тож
 * зіставлення зроблено явним словником, а не автоматичним збігом рядків.
 */

const photoModules = import.meta.glob('@/assets/stancia/**/*.jpg', {
  eager: true,
  import: 'default'
}) as Record<string, string>;

function findPhoto(fileSlug: string): string | undefined {
  const match = Object.entries(photoModules).find(([path]) => path.includes(`/${fileSlug}_`));
  return match?.[1];
}

/** stop-id (без префіксу "stop-metro-") → назва файла (без суфікса розміру). */
const STATION_FILE_SLUGS: Record<string, string> = {
  // Лінія 1 (червона)
  'holodna-gora': 'kholodna-hora',
  vokzalna: 'vokzalna',
  'tsentralnyi-rynok': 'tsentralnyi-rynok',
  'maidan-konstytutsii': 'maidan-konstytutsii',
  levada: 'levada',
  sportyvna: 'sportyvna',
  zavodska: 'zavodska',
  turboatom: 'turboatom',
  'palats-sportu': 'palats-sportu',
  armiiska: 'armiiska',
  'imeni-o-s-maselskogo': 'imeni-o-s-maselskoho',
  'traktornyi-zavod': 'traktornyi-zavod',
  industrialna: 'industrialna',

  // Лінія 2 (синя)
  saltivska: 'saltivska',
  studentska: 'studentska',
  'akademika-pavlova': 'akademika-pavlova',
  'akademika-barabashova': 'akademika-barabashova',
  kyivska: 'kyivska',
  'iaroslava-mudrogo': 'jaroslava-mudrogo',
  universytet: 'universytet',
  'istorychnyi-muzei': 'istorychnyi-muzei',

  // Лінія 3 (зелена)
  peremoga: 'peremoha',
  oleksiivska: 'oleksiivska',
  '23-serpnia': '23-serpnia',
  'botanichnyi-sad': 'botanichnyi-sad',
  naukova: 'naukova',
  derzhprom: 'derzhprom',
  'arhitektora-beketova': 'arkhitektora-beketova',
  'zahysnykiv-ukrainy': 'zakhysnykiv-ukrainy',
  metrobudivnykiv: 'metrobudivnykiv'
};

/** Повертає URL фото станції за її повним id ("stop-metro-<slug>"), якщо є. */
export function getStationPhoto(stationId: string): string | undefined {
  const slug = stationId.replace(/^stop-metro-/, '');
  const fileSlug = STATION_FILE_SLUGS[slug];
  if (!fileSlug) return undefined;
  return findPhoto(fileSlug);
}
