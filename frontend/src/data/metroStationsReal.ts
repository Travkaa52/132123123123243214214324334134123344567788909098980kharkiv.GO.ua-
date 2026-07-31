import type { StopItem } from './localData';

/**
 * Станції Харківського метрополітену, розшифровані з офіційного KML
 * ("Харьковское метро на карте Google.kml", assets/marshryt transporty kharkiv/).
 * Координати — оригінальні з KML (WGS84), назви перекладені з російської на
 * українську мову. Три лінії:
 *  - Холодногірсько-заводська (червона)
 *  - Салтівська (зелена)
 *  - Олексіївська (синя)
 */

export interface MetroStationItem {
  id: string;
  name: string;
  line: 'kholodnohirsko-zavodska' | 'saltivska' | 'oleksiivska';
  lineColor: string;
  position: { lat: number; lng: number };
}

export const METRO_LINE_COLORS: Record<MetroStationItem['line'], string> = {
  'kholodnohirsko-zavodska': '#FF5252',
  saltivska: '#0F9D58',
  oleksiivska: '#3949AB'
};

export const METRO_LINE_ROUTE_IDS: Record<MetroStationItem['line'], string> = {
  'kholodnohirsko-zavodska': 'metro-line-1',
  saltivska: 'metro-line-2',
  oleksiivska: 'metro-line-3'
};

const METRO_LINE_LABELS: Record<MetroStationItem['line'], string> = {
  'kholodnohirsko-zavodska': 'Холодногірсько-заводська лінія',
  saltivska: 'Салтівська лінія',
  oleksiivska: 'Олексіївська лінія'
};

export const metroStations: MetroStationItem[] = [
  // Холодногірсько-заводська лінія
  { id: 'metro-holodna-hora', name: 'Холодна гора', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9828767, lng: 36.1825322 } },
  { id: 'metro-pivdennyi-vokzal', name: 'Південний вокзал', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9896959, lng: 36.2066842 } },
  { id: 'metro-tsentralnyi-rynok', name: 'Центральний ринок', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9927954, lng: 36.2205001 } },
  { id: 'metro-maidan-konstytutsii', name: 'Майдан Конституції', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9918717, lng: 36.2317259 } },
  { id: 'metro-levada', name: 'Левада', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9807886, lng: 36.2428692 } },
  { id: 'metro-sportyvna', name: 'Спортивна', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9792942, lng: 36.2611107 } },
  { id: 'metro-zavodska', name: 'Заводська', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9757064, lng: 36.2811092 } },
  { id: 'metro-turboatom', name: 'Турбоатом', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9721184, lng: 36.3019661 } },
  { id: 'metro-palats-sportu', name: 'Палац Спорту', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9661158, lng: 36.3211403 } },
  { id: 'metro-armiiska', name: 'Армійська', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9618092, lng: 36.3428555 } },
  { id: 'metro-maselskoho', name: 'Маселського', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9582527, lng: 36.3599048 } },
  { id: 'metro-traktornyi-zavod', name: 'Тракторний завод', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9526753, lng: 36.3787017 } },
  { id: 'metro-industrialna', name: 'Індустріальна', line: 'kholodnohirsko-zavodska', lineColor: METRO_LINE_COLORS['kholodnohirsko-zavodska'], position: { lat: 49.9465449, lng: 36.3980136 } },

  // Салтівська лінія
  { id: 'metro-istorychnyi-muzei', name: 'Історичний музей', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 49.992822, lng: 36.2318923 } },
  { id: 'metro-universytet', name: 'Університет', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.0042702, lng: 36.2343384 } },
  { id: 'metro-yaroslava-mudroho', name: 'Ярослава Мудрого', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.0035733, lng: 36.2484136 } },
  { id: 'metro-kyivska', name: 'Київська', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.0011576, lng: 36.268997 } },
  { id: 'metro-akademika-barabashova', name: 'Академіка Барабашова', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.002287, lng: 36.3025895 } },
  { id: 'metro-akademika-pavlova', name: 'Академіка Павлова', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.0095186, lng: 36.319042 } },
  { id: 'metro-studentska', name: 'Студентська', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.017867, lng: 36.3292322 } },
  { id: 'metro-saltivska', name: 'Салтівська', line: 'saltivska', lineColor: METRO_LINE_COLORS.saltivska, position: { lat: 50.0250723, lng: 36.3357554 } },

  // Олексіївська лінія
  { id: 'metro-metrobudivnykiv', name: 'Метробудівників', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 49.9782028, lng: 36.2625342 } },
  { id: 'metro-zakhysnykiv-ukrainy', name: 'Захисників України', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 49.9886889, lng: 36.2649375 } },
  { id: 'metro-arkhitektora-beketova', name: 'Архітектора Бекетова', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 49.9982701, lng: 36.2406166 } },
  { id: 'metro-derzhprom', name: 'Держпром', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0052766, lng: 36.2328061 } },
  { id: 'metro-naukova', name: 'Наукова', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0127232, lng: 36.2265404 } },
  { id: 'metro-botanichnyi-sad', name: 'Ботанічний сад', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0254075, lng: 36.2234505 } },
  { id: 'metro-23-serpnya', name: '23 Серпня', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0354144, lng: 36.2196739 } },
  { id: 'metro-oleksiivska', name: 'Олексіївська', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0502937, lng: 36.2065045 } },
  { id: 'metro-peremoha', name: 'Перемога', line: 'oleksiivska', lineColor: METRO_LINE_COLORS.oleksiivska, position: { lat: 50.0595656, lng: 36.2018227 } }
];

/**
 * Реальні пересадочні вузли метрополітену (визначені за геометрією KML —
 * станції різних ліній, платформи яких з'єднані підземним переходом на
 * відстані до ~200м одна від одної):
 *  - Майдан Конституції (Л1) ↔ Історичний музей (Л2)
 *  - Спортивна (Л1) ↔ Метробудівників (Л3)
 *  - Університет (Л2) ↔ Держпром (Л3)
 */
export const METRO_INTERCHANGES: Array<[string, string]> = [
  ['metro-maidan-konstytutsii', 'metro-istorychnyi-muzei'],
  ['metro-sportyvna', 'metro-metrobudivnykiv'],
  ['metro-universytet', 'metro-derzhprom']
];

/**
 * Маршрути-лінії метро у форматі, сумісному з `RouteItem` — по одному на
 * кожну лінію, зупинки у порядку проходження лінії. Дозволяє переюзати
 * існуючий алгоритм побудови поїздки (buildTripOptions/buildTripPlans)
 * без окремої гілки логіки для метро: лінія метро для роутера — це просто
 * ще один "маршрут" зі своїми зупинками.
 */
export const metroRoutesData = (Object.keys(METRO_LINE_ROUTE_IDS) as MetroStationItem['line'][]).map((line) => {
  const lineStations = metroStations.filter((s) => s.line === line);
  return {
    id: METRO_LINE_ROUTE_IDS[line],
    kind: 'metro' as const,
    number: 'M',
    name: METRO_LINE_LABELS[line],
    color: METRO_LINE_COLORS[line],
    stopIds: lineStations.map((s) => s.id),
    headsignForward: lineStations[lineStations.length - 1].name,
    headsignBackward: lineStations[0].name,
    schedule: [] as unknown[],
    firstDeparture: '05:30',
    lastDeparture: '23:40',
    intervalMinutes: 4
  };
});

/**
 * Станції метро у форматі `StopItem`, щоб їх можна було підключити до
 * спільного масиву зупинок (пошук, "Звідси"/"Куди", модалка зупинки,
 * побудова поїздки з пересадками). `routeIds` містить id лінії метро,
 * на якій стоїть станція — так само, як у наземних зупинок, це дозволяє
 * роутеру знаходити метро як пряму ділянку поїздки чи пересадку.
 */
export const metroStopsData: StopItem[] = metroStations.map((station) => ({
  id: station.id,
  name: station.name,
  kinds: ['metro'],
  position: station.position,
  routeIds: [METRO_LINE_ROUTE_IDS[station.line]]
}));
