/**
 * Схематичні дані Харківського метрополітену — координати станцій, лінії,
 * пересадочні вузли та розклад руху. Всі координати та підписи точнісінько
 * відтворюють офіційну схему Тимофія Білецького (v5.1.1).
 *
 * ВАЖЛИВО: `id` кожної станції тут навмисно узгоджений з ключами станцій у
 * `data/stops.json` (реальна геолокація) та `liveMetro/timetableData.ts`
 * (реальні графіки відправлень з табло станцій). Це дозволяє напряму
 * з'єднувати схему з живими даними без додаткового мапінгу id.
 */

export type LiveMetroDayType = 'weekday' | 'weekend';

/** Скільки секунд потяг стоїть на станції з відкритими дверима. */
export const DWELL_SEC = 25;

export interface SchematicPoint {
  x: number;
  y: number;
}

export interface SchematicStation {
  id: string;
  name: string;
  nameEn: string;
  point: SchematicPoint;
  /** Зміщення підпису назви станції (x, y). */
  labelOffset?: { x?: number; y?: number };
  /** Час прибуття від початкової станції лінії, сек. */
  arrivalOffsetSec: number;
  /** id станцій-пересадок. */
  interchangeWith?: string[];
}

export interface SchematicLine {
  id: string;
  number: '1' | '2' | '3';
  name: string;
  nameEn: string;
  color: string;
  stations: SchematicStation[];
  intervalMinutes: Record<LiveMetroDayType, number>;
  firstDepartureForward: Record<LiveMetroDayType, string>;
  firstDepartureBackward: Record<LiveMetroDayType, string>;
  lastDeparture: string;
  headsignForward: string;
  headsignBackward: string;
}

const st = (
  id: string,
  name: string,
  nameEn: string,
  x: number,
  y: number,
  arrivalOffsetSec: number,
  interchangeWith?: string[],
  labelOffset?: { x?: number; y?: number }
): SchematicStation => ({
  id: `stop-metro-${id}`,
  name,
  nameEn,
  point: { x, y },
  arrivalOffsetSec,
  interchangeWith,
  labelOffset
});

export const LINE_RED = 'route-metro-1';
export const LINE_BLUE = 'route-metro-2';
export const LINE_GREEN = 'route-metro-3';

/** Лінія 1 — Холодногірсько-Заводська (червона). */
const redStations: SchematicStation[] = [
  st('holodna-gora', 'Холодна гора', 'Kholodna Hora', 120, 480, 0, undefined, { x: -85, y: -12 }),
  st('vokzalna', 'Вокзальна', 'Vokzalna', 230, 480, 110, undefined, { x: 0, y: -22 }),
  st('tsentralnyi-rynok', 'Центральний ринок', 'Tsentralnyi Rynok', 340, 480, 230, undefined, { x: 0, y: 28 }),
  st('maidan-konstytutsii', 'Майдан Конституції', 'Maidan Konstytutsiinoi', 430, 550, 380, ['stop-metro-istorychnyi-muzei'], { x: -110, y: 4 }),
  st('levada', 'Левада', 'Levada', 480, 630, 490, undefined, { x: -100, y: 4 }),
  st('sportyvna', 'Спортивна', 'Sportyvna', 540, 710, 590, ['stop-metro-metrobudivnykiv'], { x: -10, y: -22 }),
  st('zavodska', 'Заводська', 'Zavodska', 630, 800, 710, undefined, { x: 95, y: 4 }),
  st('turboatom', 'Турбоатом', 'Turboatom', 690, 860, 830, undefined, { x: 75, y: 4 }),
  st('palats-sportu', 'Палац Спорту', 'Palats Sportu', 750, 920, 950, undefined, { x: 80, y: 4 }),
  st('armiiska', 'Армійська', 'Armiiska', 810, 980, 1070, undefined, { x: 70, y: 4 }),
  st('imeni-o-s-maselskogo', 'Імені О.С. Масельського', 'Imeni O.S. Maselskoho', 910, 1010, 1190, undefined, { x: 0, y: 28 }),
  st('traktornyi-zavod', 'Тракторний завод', 'Traktornyi Zavod', 1010, 1010, 1310, undefined, { x: 0, y: 28 }),
  st('industrialna', 'Індустріальна', 'Industrialna', 1110, 1010, 1430, undefined, { x: 0, y: 28 })
];

/** Лінія 2 — Салтівська (синя). */
const blueStations: SchematicStation[] = [
  st('saltivska', 'Салтівська', 'Saltivska', 880, 110, 0, undefined, { x: 75, y: 4 }),
  st('studentska', 'Студентська', 'Studentska', 830, 170, 120, undefined, { x: 70, y: 4 }),
  st('akademika-pavlova', 'Академіка Павлова', 'Akademika Pavlova', 780, 230, 240, undefined, { x: 90, y: 4 }),
  st('akademika-barabashova', 'Академіка Барабашова', 'Akademika Barabashova', 730, 290, 360, undefined, { x: 100, y: 4 }),
  st('kyivska', 'Київська', 'Kyivska', 680, 350, 480, undefined, { x: 60, y: 4 }),
  st('iaroslava-mudrogo', 'Ярослава Мудрого', 'Yaroslava Mudroho', 630, 410, 600, undefined, { x: 70, y: 4 }),
  st('universytet', 'Університет', 'Universytet', 550, 440, 720, ['stop-metro-derzhprom'], { x: 0, y: 28 }),
  st('istorychnyi-muzei', 'Історичний музей', 'Istorychnyi Muzei', 490, 530, 840, ['stop-metro-maidan-konstytutsii'], { x: 85, y: 4 })
];

/** Лінія 3 — Олексіївська (зелена). */
const greenStations: SchematicStation[] = [
  st('peremoga', 'Перемога', 'Peremoha', 330, 110, 0, undefined, { x: -65, y: 4 }),
  st('oleksiivska', 'Олексіївська', 'Oleksiivska', 370, 170, 120, undefined, { x: -75, y: 4 }),
  st('23-serpnia', '23 Серпня', '23 Serpnya', 410, 230, 240, undefined, { x: -65, y: 4 }),
  st('botanichnyi-sad', 'Ботанічний сад', 'Botanichnyi Sad', 450, 290, 360, undefined, { x: -80, y: 4 }),
  st('naukova', 'Наукова', 'Naukova', 490, 350, 480, undefined, { x: -60, y: 4 }),
  st('derzhprom', 'Держпром', 'Derzhprom', 510, 440, 600, ['stop-metro-universytet'], { x: -55, y: -18 }),
  st('arhitektora-beketova', 'Архітектора Бекетова', 'Arkhitektora Beketova', 590, 520, 730, undefined, { x: 100, y: 4 }),
  st('zahysnykiv-ukrainy', 'Захисників України', 'Zakhysnykiv Ukrainy', 570, 620, 850, undefined, { x: 95, y: 4 }),
  st('metrobudivnykiv', 'Метробудівників', 'Metrobudivnykiv', 510, 700, 970, ['stop-metro-sportyvna'], { x: -10, y: 28 })
];

export const SCHEMATIC_LINES: SchematicLine[] = [
  {
    id: LINE_RED,
    number: '1',
    name: 'Холодногірсько-Заводська лінія',
    nameEn: 'Kholodnohirsko-Zavodska line',
    color: '#D92B27',
    stations: redStations,
    intervalMinutes: { weekday: 5, weekend: 8 },
    firstDepartureForward: { weekday: '05:30', weekend: '06:00' },
    firstDepartureBackward: { weekday: '05:40', weekend: '06:10' },
    lastDeparture: '23:50',
    headsignForward: redStations[redStations.length - 1].name,
    headsignBackward: redStations[0].name
  },
  {
    id: LINE_BLUE,
    number: '2',
    name: 'Салтівська лінія',
    nameEn: 'Saltivska line',
    color: '#0072BC',
    stations: blueStations,
    intervalMinutes: { weekday: 5, weekend: 8 },
    firstDepartureForward: { weekday: '05:30', weekend: '06:00' },
    firstDepartureBackward: { weekday: '05:40', weekend: '06:10' },
    lastDeparture: '23:50',
    headsignForward: blueStations[blueStations.length - 1].name,
    headsignBackward: blueStations[0].name
  },
  {
    id: LINE_GREEN,
    number: '3',
    name: 'Олексіївська лінія',
    nameEn: 'Oleksiyivska line',
    color: '#009640',
    stations: greenStations,
    intervalMinutes: { weekday: 6, weekend: 9 },
    firstDepartureForward: { weekday: '05:30', weekend: '06:00' },
    firstDepartureBackward: { weekday: '05:40', weekend: '06:10' },
    lastDeparture: '23:50',
    headsignForward: greenStations[greenStations.length - 1].name,
    headsignBackward: greenStations[0].name
  }
];

export const SERVICE_START_SEC = 5 * 3600 + 30 * 60; // 05:30
export const SERVICE_END_SEC = 24 * 3600;            // 24:00
