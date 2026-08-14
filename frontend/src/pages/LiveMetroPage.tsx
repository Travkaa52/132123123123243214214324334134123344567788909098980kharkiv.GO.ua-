import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  X,
  Clock,
  CalendarDays,
  Info,
  TrainFront,
  ArrowLeftRight,
  MapPin,
  Navigation,
  DoorOpen,
} from 'lucide-react';
import { getStationPhoto } from '@/data/stationPhotos';
import { TIMETABLES } from '@/liveMetro/timetableData';
import { realStationId, schematicStationId } from '@/liveMetro/stationIdMap';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { getMetroDirectionSprite } from '@/config/metroDirectionSprites';
import {
  getActiveTrains as getSharedActiveTrains,
  effectiveOperatingSec,
  nextMetroOpeningLabel
} from '@/liveMetro/liveMetroEngine';
import { DWELL_SEC as SHARED_DWELL_SEC } from '@/liveMetro/schematicData';
import stopsData from '@/data/stops.json';

// =============================================================================
// РЕАЛЬНА ФІЗИКА РУХУ ПОЇЗДА (ЕЖ3)
// =============================================================================
// Харківський метрополітен експлуатує вагони типу Еж3, конструктивна
// максимальна швидкість яких — 83 км/год. Швидкість на кожному перегоні
// рахується з реальної геовідстані між станціями (data/stops.json) та
// реального часу перегону з розкладу, після чого обмежується (clamp) цією
// фізичною межею — і використовується як для індикатора км/год, так і для
// плавного (не лінійного) профілю розгін→крейсер→гальмування на схемі.
const MAX_TRAIN_SPEED_KMH = 83;

const REAL_STATION_POS: Record<string, { lat: number; lng: number }> = {};
for (const stop of stopsData as Array<{ id: string; position: { lat: number; lng: number } }>) {
  if (stop.id.startsWith('stop-metro-')) REAL_STATION_POS[stop.id] = stop.position;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Симетричний easing розгін/гальмування (кубічний) — плавний профіль швидкості замість стрибка. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Похідна easeInOutCubic по t — використовується для миттєвої швидкості. */
function easeInOutCubicDerivative(t: number): number {
  return t < 0.5 ? 12 * t * t : 6 * Math.pow(-2 * t + 2, 2);
}

/** Реальна дистанція (метри) перегону між двома станціями схеми, за їхніми справжніми геокоординатами. */
function segmentDistanceMeters(fromId: string, toId: string): number {
  const a = REAL_STATION_POS[realStationId(fromId)];
  const b = REAL_STATION_POS[realStationId(toId)];
  if (!a || !b) return 1500; // запасне значення — типова довжина перегону в Харкові, якщо станцію не знайдено
  return haversineMeters(a, b);
}

export { getStationPhoto };

// =============================================================================
// ЗВʼЯЗОК ЗІ СПРАВЖНІМИ ДАНИМИ
// =============================================================================
// Станції на цій схемі використовують короткі id (наприклад 'kholodna-hora'),
// а реальні джерела даних — `liveMetro/timetableData.ts` (розклади, розібрані
// з фотографій табло на станціях) і `data/stops.json` (реальна геолокація) —
// використовують канонічний id вигляду `stop-metro-<slug>`. Це відображення
// з'єднує схему з обома джерелами один раз, а не мапить кожен виклик окремо.

/** "HH:MM" -> секунди від півночі. */
function timeStrToSec(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

// =============================================================================
// ТИПИ ДАНИХ
// =============================================================================

export type LiveMetroDayType = 'weekday' | 'weekend';

export interface SchematicPoint {
  x: number;
  y: number;
}

export interface SchematicStation {
  id: string;
  name: string;
  nameEn: string;
  point: SchematicPoint;
  labelOffset?: { x: number; y: number };
  interchangeWith?: string[];
  lineId: string;
  opened: string;
  type: 'deep' | 'shallow' | 'single-vault' | 'pylon';
  description?: string;
  /** Відомі виходи зі станції — орієнтири на поверхні (вулиці, установи,
   *  зупинки наземного транспорту), куди веде вихід/виходи з вестибюля.
   *  Дані по кожному конкретному вестибюлю (їх нумерація) офіційно не
   *  публікуються Харківським метрополітеном, тому тут — перелік реальних
   *  орієнтирів біля станції, а не вигадані номери виходів. */
  exits?: string[];
}

export interface SchematicLine {
  id: string;
  number: number;
  name: string;
  nameEn: string;
  color: string;
  stations: SchematicStation[];
}

export interface LiveMetroTrain {
  id: string;
  lineId: string;
  lineNumber: number;
  lineColor: string;
  /** Напрямок руху: 'forward' — до останньої станції списку лінії, 'backward' — до першої. */
  direction: 'forward' | 'backward';
  headsign: string;
  point: SchematicPoint;
  headingDeg: number;
  speedRatio: number;
  speedKmh: number;
  phase: 'moving' | 'dwell';
  previousStation: SchematicStation;
  nextStation: SchematicStation;
  etaNextStationSec: number;
  progress: number;
}

export interface StationDayTimetableEntry {
  lineId: string;
  lineNumber: number;
  lineColor: string;
  headsign: string;
  direction: string;
  times: string[];
}

// =============================================================================
// КОНСТАНТИ
// =============================================================================

const VIEW_W = 1500;
const VIEW_H = 900;
const MIN_SCALE = 0.35;
const MAX_SCALE = 5.0;

export const LINE_COLORS: Record<string, string> = {
  'route-metro-1': '#D92B27',
  'route-metro-2': '#0072BC',
  'route-metro-3': '#009640',
};

export const LINE_NUMBERS: Record<string, number> = {
  'route-metro-1': 1,
  'route-metro-2': 2,
  'route-metro-3': 3,
};

// =============================================================================
// СТАНЦІЇ ЛІНІЇ 1 — Холодногірсько-Заводська (Червона)
// =============================================================================

const LINE1_STATIONS: SchematicStation[] = [
  {
    id: 'kholodna-hora',
    name: 'Холодна Гора',
    nameEn: 'Kholodna Hora',
    point: { x: 412, y: 377 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'single-vault',
    description: 'Північно-західний термінал. Вихід до ж/м Холодна Гора.',
    exits: ['Житловий масив Холодна Гора', 'Кінцева зупинка наземного транспорту'],
  },
  {
    id: 'vokzalna',
    name: 'Вокзальна',
    nameEn: 'Vokzalna',
    point: { x: 492, y: 377 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Інтегрована в Центральний залізничний вокзал Харків-Пасажирський.',
    exits: ['Центральний залізничний вокзал Харків-Пасажирський', 'Привокзальна площа'],
  },
  {
    id: 'tsentralnyi-rynok',
    name: 'Центральний ринок',
    nameEn: 'Tsentralnyi Rynok',
    point: { x: 571, y: 377 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Центральний ринок, торговий район.',
    exits: ['Центральний ринок'],
  },
  {
    id: 'maidan-konstytutsii',
    name: 'Майдан Конституції',
    nameEn: 'Maidan Konstytutsii',
    point: { x: 636, y: 428 },
    labelOffset: { x: -16, y: -14 },
    interchangeWith: ['istorychnyi-muzei'],
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Центр міста. Пересадка на Салтівську лінію (Історичний музей).',
    exits: ['Майдан Конституції', 'Пересадочний вузол на Історичний музей (М2)'],
  },
  {
    id: 'levada',
    name: 'Левада',
    nameEn: 'Levada',
    point: { x: 672, y: 486 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Вихід до залізничної станції Харків-Левада.',
    exits: ['Залізнична станція Харків-Левада'],
  },
  {
    id: 'sportyvna',
    name: 'Спортивна',
    nameEn: 'Sportyvna',
    point: { x: 716, y: 543 },
    labelOffset: { x: 16, y: -14 },
    interchangeWith: ['metrobudivnykiv'],
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Пересадка на Олексіївську лінію (Метробудівників).',
    exits: ['Стадіон «Металіст»', 'Пересадочний вузол на Метробудівників (М3)'],
  },
  {
    id: 'zavodska',
    name: 'Заводська',
    nameEn: 'Zavodska',
    point: { x: 781, y: 608 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Безпосередньо біля залізничної станції Харків-Слобідський.',
    exits: ['Залізнична станція Харків-Слобідський'],
  },
  {
    id: 'turboatom',
    name: 'Турбоатом',
    nameEn: 'Turboatom',
    point: { x: 824, y: 652 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1975-08-23',
    type: 'deep',
    description: 'Колишня назва — Московський проспект (до 2019).',
    exits: ['Завод «Турбоатом»', 'Московський проспект'],
  },
  {
    id: 'palats-sportu',
    name: 'Палац Спорту',
    nameEn: 'Palats Sportu',
    point: { x: 868, y: 695 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1978-05-11',
    type: 'shallow',
    description: 'Палац спорту, житловий масив.',
    exits: ['Палац спорту', 'Житловий масив'],
  },
  {
    id: 'armiiska',
    name: 'Армійська',
    nameEn: 'Armiiska',
    point: { x: 911, y: 738 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1978-05-11',
    type: 'shallow',
    description: 'Колишня назва — Радянської армії (до 2016).',
    exits: ['Житловий масив вздовж Московського проспекту'],
  },
  {
    id: 'imeni-maselskoho',
    name: 'Імені О.С. Масельського',
    nameEn: 'Imeni O.S. Maselskoho',
    point: { x: 983, y: 760 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1978-05-11',
    type: 'shallow',
    description: 'Колишня назва — Індустріальна (до 2004).',
    exits: ['Промислова зона Індустріального району'],
  },
  {
    id: 'traktornyi-zavod',
    name: 'Тракторний завод',
    nameEn: 'Traktornyi Zavod',
    point: { x: 1055, y: 760 },
    labelOffset: { x: 0, y: -18 },
    lineId: 'route-metro-1',
    opened: '1978-05-11',
    type: 'single-vault',
    description: 'Вихід до Харківського тракторного заводу.',
    exits: ['Харківський тракторний завод'],
  },
  {
    id: 'industrialna',
    name: 'Індустріальна',
    nameEn: 'Industrialna',
    point: { x: 1128, y: 760 },
    labelOffset: { x: 10, y: -18 },
    lineId: 'route-metro-1',
    opened: '1978-05-11',
    type: 'shallow',
    description: 'Південно-східний термінал. Колишня назва — Пролетарська (до 2016).',
    exits: ['Житловий масив Олексіївка/Індустріальний район', 'Кінцева зупинка наземного транспорту'],
  },
];

// =============================================================================
// СТАНЦІЇ ЛІНІЇ 2 — Салтівська (Синя)
// =============================================================================

const LINE2_STATIONS: SchematicStation[] = [
  {
    id: 'saltivska',
    name: 'Салтівська',
    nameEn: 'Saltivska',
    point: { x: 961, y: 110 },
    labelOffset: { x: 0, y: -20 },
    lineId: 'route-metro-2',
    opened: '1986-10-26',
    type: 'shallow',
    description: 'Північно-східний термінал. Колишня назва — Героїв Праці (до 2024).',
    exits: ['Житловий масив Салтівка', 'Кінцева зупинка наземного транспорту'],
  },
  {
    id: 'studentska',
    name: 'Студентська',
    nameEn: 'Studentska',
    point: { x: 925, y: 153 },
    labelOffset: { x: 16, y: -14 },
    lineId: 'route-metro-2',
    opened: '1986-10-26',
    type: 'shallow',
    description: 'Університетський район.',
    exits: ['Студентське містечко'],
  },
  {
    id: 'akademika-pavlova',
    name: 'Академіка Павлова',
    nameEn: 'Akademika Pavlova',
    point: { x: 889, y: 197 },
    labelOffset: { x: 16, y: -14 },
    lineId: 'route-metro-2',
    opened: '1986-10-26',
    type: 'single-vault',
    description: 'Імені Івана Павлова, фізіолога.',
    exits: ['Вулиця Академіка Павлова'],
  },
  {
    id: 'akademika-barabashova',
    name: 'Академіка Барабашова',
    nameEn: 'Akademika Barabashova',
    point: { x: 853, y: 240 },
    labelOffset: { x: 16, y: -14 },
    lineId: 'route-metro-2',
    opened: '1984-08-11',
    type: 'shallow',
    description: 'Ринок Барабашова — найбільший в Україні.',
    exits: ['Ринок «Барабашова»'],
  },
  {
    id: 'kyivska',
    name: 'Київська',
    nameEn: 'Kyivska',
    point: { x: 817, y: 283 },
    labelOffset: { x: 16, y: -14 },
    lineId: 'route-metro-2',
    opened: '1984-08-11',
    type: 'single-vault',
    description: 'Автобусний хаб у напрямку Києва.',
    exits: ['Автостанція у напрямку Києва'],
  },
  {
    id: 'yaroslava-mudroho',
    name: 'Ярослава Мудрого',
    nameEn: 'Yaroslava Mudroho',
    point: { x: 781, y: 327 },
    labelOffset: { x: 16, y: -14 },
    lineId: 'route-metro-2',
    opened: '1984-08-11',
    type: 'pylon',
    description: 'Колишня назва — Пушкінська (до 2024). Глибина ~35 м.',
    exits: ['Вулиця Ярослава Мудрого (колишня Пушкінська)'],
  },
  {
    id: 'universytet',
    name: 'Університет',
    nameEn: 'Universytet',
    point: { x: 723, y: 348 },
    labelOffset: { x: 18, y: 4 },
    interchangeWith: ['derzhprom'],
    lineId: 'route-metro-2',
    opened: '1984-08-11',
    type: 'shallow',
    description: 'Національний університет ім. Каразіна. Пересадка на M3 (Держпром).',
    exits: ['Харківський національний університет ім. В.Н. Каразіна', 'Пересадочний вузол на Держпром (М3)'],
  },
  {
    id: 'istorychnyi-muzei',
    name: 'Історичний музей',
    nameEn: 'Istorychnyi Muzei',
    point: { x: 680, y: 413 },
    labelOffset: { x: 0, y: 22 },
    interchangeWith: ['maidan-konstytutsii'],
    lineId: 'route-metro-2',
    opened: '1984-08-11',
    type: 'deep',
    description: 'Історичний музей. Пересадка на M1 (Майдан Конституції).',
    exits: ['Харківський історичний музей', 'Пересадочний вузол на Майдан Конституції (М1)'],
  },
];

// =============================================================================
// СТАНЦІЇ ЛІНІЇ 3 — Олексіївська (Зелена)
// =============================================================================

const LINE3_STATIONS: SchematicStation[] = [
  {
    id: 'peremoha',
    name: 'Перемога',
    nameEn: 'Peremoha',
    point: { x: 564, y: 110 },
    labelOffset: { x: 0, y: -20 },
    lineId: 'route-metro-3',
    opened: '2016-08-19',
    type: 'shallow',
    description: 'Північний термінал. Відкрита у 2016 році.',
    exits: ['Житловий масив на півночі Олексіївської лінії', 'Кінцева зупинка наземного транспорту'],
  },
  {
    id: 'oleksiivska',
    name: 'Олексіївська',
    nameEn: 'Oleksiivska',
    point: { x: 593, y: 153 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-3',
    opened: '2010-12-21',
    type: 'shallow',
    description: 'Житловий масив Олексіївка.',
    exits: ['Житловий масив Олексіївка'],
  },
  {
    id: '23-serpnia',
    name: '23 Серпня',
    nameEn: '23 Serpnia',
    point: { x: 622, y: 197 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-3',
    opened: '2004-08-21',
    type: 'shallow',
    description: 'День визволення Харкова (23 серпня).',
    exits: ['Проспект на честь визволення Харкова'],
  },
  {
    id: 'botanichnyi-sad',
    name: 'Ботанічний сад',
    nameEn: 'Botanichnyi Sad',
    point: { x: 651, y: 240 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-3',
    opened: '2004-08-21',
    type: 'shallow',
    description: 'Національний ботанічний сад.',
    exits: ['Національний ботанічний сад ХНУ'],
  },
  {
    id: 'naukova',
    name: 'Наукова',
    nameEn: 'Naukova',
    point: { x: 680, y: 283 },
    labelOffset: { x: -16, y: -14 },
    lineId: 'route-metro-3',
    opened: '1995-05-06',
    type: 'shallow',
    description: 'Проспект Науки, науковий район.',
    exits: ['Проспект Науки'],
  },
  {
    id: 'derzhprom',
    name: 'Держпром',
    nameEn: 'Derzhprom',
    point: { x: 694, y: 348 },
    labelOffset: { x: -18, y: 4 },
    interchangeWith: ['universytet'],
    lineId: 'route-metro-3',
    opened: '1995-05-06',
    type: 'shallow',
    description: 'Площа Свободи — одна з найбільших у світі. Пересадка на M2 (Університет).',
    exits: ['Площа Свободи', 'Будівля Держпрому', 'Пересадочний вузол на Університет (М2)'],
  },
  {
    id: 'arkhitektora-beketova',
    name: 'Архітектора Бекетова',
    nameEn: 'Arkhitektora Beketova',
    point: { x: 752, y: 406 },
    labelOffset: { x: 16, y: 14 },
    lineId: 'route-metro-3',
    opened: '1995-05-06',
    type: 'shallow',
    description: 'Музей образотворчих мистецтв. Найкоротша ділянка між станціями (до Держпрома).',
    exits: ['Харківський художній музей'],
  },
  {
    id: 'zakhysnykiv-ukrainy',
    name: 'Захисників України',
    nameEn: 'Zakhysnykiv Ukrainy',
    point: { x: 738, y: 478 },
    labelOffset: { x: 16, y: 14 },
    lineId: 'route-metro-3',
    opened: '1995-05-06',
    type: 'shallow',
    description: 'Колишня назва — Проспект Гагаріна (до 2022).',
    exits: ['Вулиця Захисників України (колишній проспект Гагаріна)'],
  },
  {
    id: 'metrobudivnykiv',
    name: 'Метробудівників',
    nameEn: 'Metrobudivnykiv',
    point: { x: 694, y: 536 },
    labelOffset: { x: 0, y: 22 },
    interchangeWith: ['sportyvna'],
    lineId: 'route-metro-3',
    opened: '1995-05-06',
    type: 'shallow',
    description: 'Південний термінал. Пересадка на M1 (Спортивна).',
    exits: ['Південний житловий масив', 'Пересадочний вузол на Спортивна (М1)'],
  },
];

// =============================================================================
// ЛІНІЇ
// =============================================================================

export const BUILT_LINES: { line: SchematicLine }[] = [
  {
    line: {
      id: 'route-metro-1',
      number: 1,
      name: 'Холодногірсько-Заводська лінія',
      nameEn: 'Kholodnohirsko-Zavodska line',
      color: LINE_COLORS['route-metro-1'],
      stations: LINE1_STATIONS,
    },
  },
  {
    line: {
      id: 'route-metro-2',
      number: 2,
      name: 'Салтівська лінія',
      nameEn: 'Saltivska line',
      color: LINE_COLORS['route-metro-2'],
      stations: LINE2_STATIONS,
    },
  },
  {
    line: {
      id: 'route-metro-3',
      number: 3,
      name: 'Олексіївська лінія',
      nameEn: 'Oleksiivska line',
      color: LINE_COLORS['route-metro-3'],
      stations: LINE3_STATIONS,
    },
  },
];

/**
 * Плаский індекс усіх станцій схеми за коротким id ('kholodna-hora', 'saltivska', ...).
 * Потрібен, щоб перекласти потяг, порахований спільним рушієм руху
 * (`@/liveMetro/liveMetroEngine`, працює з канонічними id `stop-metro-<slug>`),
 * на координати ЦІЄЇ схеми (тут — власна система координат VIEW_W×VIEW_H,
 * відмінна від `@/liveMetro/schematicData`).
 */
const ALL_LOCAL_STATIONS: Record<string, SchematicStation> = Object.fromEntries(
  [...LINE1_STATIONS, ...LINE2_STATIONS, ...LINE3_STATIONS].map((s) => [s.id, s])
);

// =============================================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// =============================================================================

export function dayTypeOf(date: Date): LiveMetroDayType {
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

export function secOfDay(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function formatEtaClock(etaSec: number): string {
  const h = Math.floor(etaSec / 3600);
  const m = Math.floor((etaSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatEtaCountdown(etaSec: number, nowSec: number): string {
  const diff = Math.max(0, etaSec - nowSec);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m === 0) return `${s}с`;
  return `${m}хв ${s}с`;
}

function lerpPoint(a: SchematicPoint, b: SchematicPoint, t: number): SchematicPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function angleBetween(a: SchematicPoint, b: SchematicPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

// =============================================================================
// ГЕНЕРАЦІЯ РОЗКЛАДУ
// =============================================================================

/**
 * Реальний графік станції (обидва напрямки, усі лінії, що через неї проходять) —
 * бере фактичні відправлення з `TIMETABLES` (розібрані з фото табло на станціях),
 * а не згенеровані значення. Якщо для станції немає розібраних даних (не мало б
 * траплятись — дані є по всіх 30 станціях), напрямок просто не показується.
 */
export function getStationDayTimetable(
  stationId: string,
  dayType: LiveMetroDayType
): StationDayTimetableEntry[] {
  const result: StationDayTimetableEntry[] = [];
  const realId = realStationId(stationId);
  const perStation = TIMETABLES[dayType]?.[realId];
  if (!perStation) return result;

  for (const { line } of BUILT_LINES) {
    const idx = line.stations.findIndex((s) => s.id === stationId);
    if (idx === -1) continue;

    const entry = perStation[line.id];
    if (!entry) continue;

    const lineNumber = LINE_NUMBERS[line.id];
    const lineColor = LINE_COLORS[line.id];

    if (entry.forward.length) {
      result.push({
        lineId: line.id,
        lineNumber,
        lineColor,
        headsign: line.stations[line.stations.length - 1].name,
        direction: line.stations[line.stations.length - 1].nameEn,
        times: entry.forward,
      });
    }
    if (entry.backward.length) {
      result.push({
        lineId: line.id,
        lineNumber,
        lineColor,
        headsign: line.stations[0].name,
        direction: line.stations[0].nameEn,
        times: entry.backward,
      });
    }
  }

  return result;
}

// =============================================================================
// ПОЇЗДИ У РЕАЛЬНОМУ ЧАСІ
// =============================================================================

/**
 * Найближчі прибуття на станцію — з реального графіка цієї станції
 * (`TIMETABLES`), а не з випадкової генерації.
 */
export function getUpcomingArrivalsForStation(
  stationId: string,
  _date: Date,
  limit: number
): Array<{
  lineId: string;
  lineNumber: number;
  lineColor: string;
  headsign: string;
  etaSec: number;
}> {
  const nowSec = secOfDay(new Date());
  const realId = realStationId(stationId);
  const perStation = TIMETABLES[dayTypeOf(new Date())]?.[realId];
  const arrivals: Array<{ lineId: string; lineNumber: number; lineColor: string; headsign: string; etaSec: number }> = [];

  if (perStation) {
    for (const { line } of BUILT_LINES) {
      const idx = line.stations.findIndex((s) => s.id === stationId);
      if (idx === -1) continue;
      const entry = perStation[line.id];
      if (!entry) continue;

      for (const t of entry.forward) {
        const eta = timeStrToSec(t);
        if (eta > nowSec && eta < nowSec + 3600) {
          arrivals.push({
            lineId: line.id,
            lineNumber: LINE_NUMBERS[line.id],
            lineColor: LINE_COLORS[line.id],
            headsign: line.stations[line.stations.length - 1].name,
            etaSec: eta,
          });
        }
      }
      for (const t of entry.backward) {
        const eta = timeStrToSec(t);
        if (eta > nowSec && eta < nowSec + 3600) {
          arrivals.push({
            lineId: line.id,
            lineNumber: LINE_NUMBERS[line.id],
            lineColor: LINE_COLORS[line.id],
            headsign: line.stations[0].name,
            etaSec: eta,
          });
        }
      }
    }
  }

  return arrivals.sort((a, b) => a.etaSec - b.etaSec).slice(0, limit);
}

// =============================================================================
// ХУК: useLiveMetroTrains — рух рахує спільний рушій @/liveMetro/liveMetroEngine
// (реальні відправлення з TIMETABLES, де вони є, і рівномірний інтервал-фолбек,
// де їх нема) — а тут лише перекладаємо його результат у координати ЦІЄЇ схеми.
// =============================================================================

/**
 * Перекладає один потяг зі спільного рушія (координати/id зі `@/liveMetro/schematicData`)
 * у координати локальної схеми `/metro/live` (LINE1_STATIONS/LINE2_STATIONS/LINE3_STATIONS).
 * Повертає null, якщо для якоїсь зі станцій перегону немає відповідника в локальній
 * схемі (не мало б траплятись — усі 30 станцій змасковані в stationIdMap.ts).
 */
function mapSharedTrainToLocal(
  t: ReturnType<typeof getSharedActiveTrains>[number],
  effectiveNowSec: number
): LiveMetroTrain | null {
  const localFrom = ALL_LOCAL_STATIONS[schematicStationId(t.previousStation.id)];
  const localTo = ALL_LOCAL_STATIONS[schematicStationId(t.nextStation.id)];
  if (!localFrom || !localTo) return null;

  // Межі поточного перегону у секундах ВІД ПОЧАТКУ РЕЙСУ (як у sampleTrainAt рушія):
  // на першій станції рейс стартує одразу (0с), на решті — після стоянки (DWELL_SEC).
  const isFirstSegment = t.previousStation.arrivalOffsetSec === 0;
  const segStartRel = isFirstSegment ? 0 : t.previousStation.arrivalOffsetSec + SHARED_DWELL_SEC;
  const segEndRel = t.nextStation.arrivalOffsetSec;
  const segDurRel = Math.max(1, segEndRel - segStartRel);

  const elapsedTripSec = effectiveNowSec - t.departureAtSec;
  const rawProgress = Math.min(1, Math.max(0, (elapsedTripSec - segStartRel) / segDurRel));
  const isDwell = t.phase === 'dwell';

  const easedT = easeInOutCubic(rawProgress);
  const point = isDwell ? localTo.point : lerpPoint(localFrom.point, localTo.point, easedT);
  const heading = angleBetween(localFrom.point, localTo.point);

  const distanceMeters = segmentDistanceMeters(localFrom.id, localTo.id);
  const instSpeedMps = isDwell ? 0 : (distanceMeters * easeInOutCubicDerivative(rawProgress)) / segDurRel;
  const speedKmh = Math.min(MAX_TRAIN_SPEED_KMH, instSpeedMps * 3.6);

  return {
    id: t.id,
    lineId: t.lineId,
    lineNumber: LINE_NUMBERS[t.lineId],
    lineColor: LINE_COLORS[t.lineId],
    direction: t.direction,
    headsign: t.headsign,
    point,
    headingDeg: heading,
    speedRatio: t.speedRatio,
    speedKmh: isDwell ? 0 : Math.round(speedKmh),
    phase: isDwell ? 'dwell' : 'moving',
    previousStation: localFrom,
    nextStation: localTo,
    etaNextStationSec: t.etaNextStationSec,
    progress: t.progressRatio,
  };
}

function computeActiveTrains(now: Date): LiveMetroTrain[] {
  const effectiveNowSec = effectiveOperatingSec(now);
  const trains: LiveMetroTrain[] = [];
  for (const t of getSharedActiveTrains(now)) {
    const mapped = mapSharedTrainToLocal(t, effectiveNowSec);
    if (mapped) trains.push(mapped);
  }
  return trains;
}

export function useLiveMetroTrains(): LiveMetroTrain[] {
  const [trains, setTrains] = useState<LiveMetroTrain[]>(() => computeActiveTrains(new Date()));

  useEffect(() => {
    let rafId = 0;
    let lastUpdate = 0;
    // ~12 кадрів/с — достатньо плавно для ока, і не перевантажує рендер SVG.
    const FRAME_INTERVAL_MS = 80;

    const tick = (ts: number) => {
      if (ts - lastUpdate >= FRAME_INTERVAL_MS) {
        lastUpdate = ts;
        setTrains(computeActiveTrains(new Date()));
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return trains;
}

// =============================================================================
// ФОТО СТАНЦІЙ — реальні фото з src/assets/stancia (не Wikimedia-заглушки)
// =============================================================================

/** Префіксує шлях у /public базовим шляхом збірки (важливо для GitHub Pages, де base ≠ "/"). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalizedBase}${path}`;
}

// =============================================================================
// КОМПОНЕНТИ
// =============================================================================

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export const TRAIN_SPRITES: Record<string, string> = {
  'route-metro-1': assetUrl('/sprites/metro-red-line.jpg'),
  'route-metro-2': assetUrl('/sprites/metro-blue-line.jpg'),
  'route-metro-3': assetUrl('/sprites/metro-green-line.jpg'),
};

export function LiveMetroPage() {
  const trains = useLiveMetroTrains();
  const [searchParams, setSearchParams] = useSearchParams();
  // Дозволяє відкривати конкретну станцію (і одразу її розклад) прямим
  // посиланням виду /metro/live?station=<id>&tab=timetable — саме так на
  // цю сторінку веде "Найближча станція" з LiveMetroWidget та HomePage.
  // Захоплюємо початкові значення query-параметрів один раз: нижче ми
  // одразу прибираємо їх з URL, тому читати searchParams напряму в рендері
  // після монтування вже не можна.
  const initialDeepLinkRef = useRef({
    stationId: searchParams.get('station'),
    tab: searchParams.get('tab') as 'arrivals' | 'timetable' | 'exits' | 'info' | null
  });
  const deepLinkedStationId = searchParams.get('station');
  const [transform, setTransform] = useState<Transform>({ x: 60, y: 30, scale: 0.9 });
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(initialDeepLinkRef.current.stationId);
  const [dayType, setDayType] = useState<LiveMetroDayType>(() => dayTypeOf(new Date()));
  const [nowSec, setNowSec] = useState<number>(() => secOfDay(new Date()));
  const [showLegend, setShowLegend] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  // Дозволяє вмикати/вимикати відображення окремих ліній на схемі —
  // за замовчуванням показані всі. За замовчуванням містить id усіх
  // ліній (заповнюється нижче через BUILT_LINES).
  const [visibleLineIds, setVisibleLineIds] = useState<Set<string>>(
    () => new Set(BUILT_LINES.map(({ line }) => line.id))
  );
  const toggleLineVisibility = useCallback((lineId: string) => {
    setVisibleLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        // Не дозволяємо сховати геть усі лінії — хоч одна лишається видимою.
        if (next.size > 1) next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  // Якщо параметри в URL змінюються (наприклад, повторний перехід з
  // головної сторінки на іншу станцію), синхронізуємо вибір станції.
  useEffect(() => {
    if (deepLinkedStationId) setSelectedStationId(deepLinkedStationId);
  }, [deepLinkedStationId]);

  // Одразу після відкриття конкретної станції за deep-лінком прибираємо
  // параметри з URL, щоб закриття картки (onClose) та подальша навігація
  // по схемі поводились природно, без "залипання" на старій станції.
  useEffect(() => {
    if (deepLinkedStationId) {
      const next = new URLSearchParams(searchParams);
      next.delete('station');
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Батчимо оновлення transform у requestAnimationFrame: без цього кожен
  // "pointermove" одразу викликав setState, і на екранах/тачпадах зі
  // швидкістю опитування 120–240 Гц React ре-рендерив частіше, ніж встигав
  // намалювати кадр — звідси ривки замість плавного руху. rAF-петля сама
  // підлаштовується під частоту оновлення дисплея (60/120 Гц), тож рух
  // виходить плавним на будь-якому екрані.
  const pendingTransformRef = useRef<Transform | null>(null);
  const transformRafRef = useRef<number | null>(null);
  const scheduleTransform = useCallback((updater: Transform | ((t: Transform) => Transform)) => {
    const base = pendingTransformRef.current ?? transformRef.current;
    const next = typeof updater === 'function' ? (updater as (t: Transform) => Transform)(base) : updater;
    pendingTransformRef.current = next;
    if (transformRafRef.current !== null) return;
    transformRafRef.current = requestAnimationFrame(() => {
      transformRafRef.current = null;
      if (pendingTransformRef.current) {
        setTransform(pendingTransformRef.current);
        pendingTransformRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (transformRafRef.current !== null) cancelAnimationFrame(transformRafRef.current);
    };
  }, []);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  // pinchState тепер утримує ще й екранну середину жесту та поточний зсув (x, y) на момент старту —
  // це потрібно, щоб масштабування відбувалось відносно точки між пальцями, а не відносно (0,0).
  const pinchState = useRef<{ distance: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null>(null);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Safari (iOS) генерує окремі gesturestart/gesturechange/gestureend поза
  // Pointer Events API — саме вони, а не touch-action, іноді викликають
  // "стрибок" нативного масштабу сторінки поверх нашого зуму схеми.
  // Слухачі не-пасивні й безумовно гасять дефолт, поки палець над картою.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const blockGesture = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', blockGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', blockGesture as EventListener, { passive: false });
    el.addEventListener('touchmove', blockGesture as EventListener, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', blockGesture as EventListener);
      el.removeEventListener('gesturechange', blockGesture as EventListener);
      el.removeEventListener('touchmove', blockGesture as EventListener);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowSec(secOfDay(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedTrain = useMemo(
    () => trains.find((t) => t.id === selectedTrainId) ?? null,
    [trains, selectedTrainId]
  );

  const allStations = useMemo(() => {
    const map = new Map<string, SchematicStation>();
    for (const { line } of BUILT_LINES) {
      for (const station of line.stations) {
        if (!map.has(station.id)) map.set(station.id, station);
      }
    }
    return Array.from(map.values());
  }, []);

  const interchangePairs = useMemo(() => {
    const renderedPairs = new Set<string>();
    const pairs: Array<{ id: string; s1: SchematicStation; s2: SchematicStation }> = [];

    for (const { line } of BUILT_LINES) {
      for (const station of line.stations) {
        if (!station.interchangeWith?.length) continue;
        for (const otherId of station.interchangeWith) {
          const other = allStations.find((o) => o.id === otherId);
          if (!other) continue;
          const pairKey = [station.id, otherId].sort().join('--');
          if (renderedPairs.has(pairKey)) continue;
          renderedPairs.add(pairKey);
          pairs.push({ id: pairKey, s1: station, s2: other });
        }
      }
    }
    return pairs;
  }, [allStations]);

  // Лінії, станції яких зараз показуються на схемі (з урахуванням тумблерів).
  const visibleBuiltLines = useMemo(
    () => BUILT_LINES.filter(({ line }) => visibleLineIds.has(line.id)),
    [visibleLineIds]
  );
  const visibleInterchangePairs = useMemo(
    () => interchangePairs.filter((p) => visibleLineIds.has(p.s1.lineId) && visibleLineIds.has(p.s2.lineId)),
    [interchangePairs, visibleLineIds]
  );
  const visibleTrains = useMemo(
    () => trains.filter((t) => visibleLineIds.has(t.lineId)),
    [trains, visibleLineIds]
  );

  // Час першого потяга — показуємо в банері, коли метро зараз не працює (нема жодного потяга на схемі).
  const metroOpensAt = useMemo(() => {
    if (trains.length > 0) return null;
    return nextMetroOpeningLabel(new Date());
  }, [trains.length]);

  const selectedStation = selectedStationId
    ? allStations.find((s) => s.id === selectedStationId) ?? null
    : null;

  const stationArrivals = useMemo(() => {
    if (!selectedStationId) return [];
    return getUpcomingArrivalsForStation(selectedStationId, new Date(), 4);
  }, [selectedStationId, trains, nowSec]);

  const stationTimetable = useMemo(() => {
    if (!selectedStationId) return [];
    return getStationDayTimetable(selectedStationId, dayType);
  }, [selectedStationId, dayType]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const currentTransform = transformRef.current;
    if (activePointers.current.size === 1) {
      isDraggingRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, tx: currentTransform.x, ty: currentTransform.y };
    } else if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
      pinchState.current = { distance: dist, scale: currentTransform.scale, midX, midY, tx: currentTransform.x, ty: currentTransform.y };
      // Скидаємо однопальцевий drag, щоб не «стрибав» transform у момент постановки другого пальця.
      isDraggingRef.current = false;
      dragStartRef.current = null;
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 2 && pinchState.current) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / (pinchState.current.distance || 1);
      const { scale: startScale, midX, midY, tx, ty } = pinchState.current;
      const newScale = clampScale(startScale * ratio);
      // Утримуємо нерухомою точку схеми, що була між пальцями на старті жесту —
      // саме тому масштабування раніше «зʼїжджало» в кут замість зуму в місці пальців.
      const scaleRatio = newScale / startScale;
      scheduleTransform({
        x: midX - (midX - tx) * scaleRatio,
        y: midY - (midY - ty) * scaleRatio,
        scale: newScale
      });
      isDraggingRef.current = true;
      return;
    }
    const drag = dragStartRef.current;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) {
        isDraggingRef.current = true;
        scheduleTransform((t) => ({ ...t, x: drag.tx + dx, y: drag.ty + dy }));
      }
    }
  }, [scheduleTransform]);

  const endPointer = useCallback((e: PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size === 0) dragStartRef.current = null;
    if (activePointers.current.size < 2) pinchState.current = null;
  }, []);

  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    setTransform((t) => {
      const newScale = clampScale(t.scale * (1 + delta));
      const scaleRatio = newScale / t.scale;
      return {
        x: mouseX - (mouseX - t.x) * scaleRatio,
        y: mouseY - (mouseY - t.y) * scaleRatio,
        scale: newScale,
      };
    });
  }, []);

  const resetView = () => setTransform({ x: 60, y: 30, scale: 0.9 });

  const handleStationSelect = useCallback((stationId: string) => {
    if (isDraggingRef.current) return;
    setSelectedStationId((prev) => (prev === stationId ? null : stationId));
    setSelectedTrainId(null);
  }, []);

  const handleTrainSelect = useCallback((trainId: string) => {
    if (isDraggingRef.current) return;
    setSelectedTrainId((prev) => (prev === trainId ? null : trainId));
    setSelectedStationId(null);
  }, []);

  const currentTime = useMemo(() => {
    return new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [nowSec]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      {/* Компактна верхня панель — оптимізована під мобільні екрани, з кнопкою "назад" замість повного PageHeader */}
      <div
        className="flex items-center justify-between gap-2 border-b border-white/10 bg-ink/95 px-3 backdrop-blur-xl"
        style={{ paddingTop: 'max(0.6rem, env(safe-area-inset-top))', paddingBottom: '0.6rem' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="Назад"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-white/90">Живе метро</span>
            <span className="truncate text-[10px] text-white/40">30 станцій · 38.1 км · 3 лінії</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] font-mono text-mint sm:block">
            {currentTime}
          </div>
          <div className="flex overflow-hidden rounded-full border border-ink-border bg-white/5">
            <button
              type="button"
              onClick={() => setDayType('weekday')}
              className={[
                'px-2.5 py-1.5 text-[11px] font-medium transition-all',
                dayType === 'weekday' ? 'bg-mint text-ink font-bold' : 'bg-transparent text-white/60 hover:text-white/90',
              ].join(' ')}
            >
              Будній
            </button>
            <button
              type="button"
              onClick={() => setDayType('weekend')}
              className={[
                'px-2.5 py-1.5 text-[11px] font-medium transition-all',
                dayType === 'weekend' ? 'bg-mint text-ink font-bold' : 'bg-transparent text-white/60 hover:text-white/90',
              ].join(' ')}
            >
              Вихідний
            </button>
          </div>
        </div>
      </div>

      {/* Контейнер карти — розтягнутий на весь доступний екран, без відступів і заокруглень */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-bg touch-none"
        // Інлайн-стиль дублює touch-none навмисно: на деяких Android WebView
        // (особливо в Telegram Mini App) сама CSS-властивість touch-action не
        // застосовується, якщо контейнер отримав її лише через клас Tailwind
        // до першого repaint — інлайн-стиль гарантовано має найвищий пріоритет
        // і застосовується одразу, тому нативний пінч-зум сторінки більше не
        // конфліктує з нашим власним масштабуванням схеми.
        style={{ touchAction: 'none', overscrollBehavior: 'contain', WebkitUserSelect: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onWheel={onWheel}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isDraggingRef.current) {
            setSelectedTrainId(null);
            setSelectedStationId(null);
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-mint/20 border-t-mint" />
              <span className="text-sm text-ink-muted">Завантаження схеми...</span>
            </div>
          </div>
        )}

        {!isLoading && visibleTrains.length === 0 && (
          <div
            className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/10 bg-surface-raised/95 px-4 py-2 text-xs font-semibold text-ink-muted shadow-xl backdrop-blur-sm"
            style={{ marginTop: 'env(safe-area-inset-top)' }}
          >
            <span aria-hidden="true">🌙</span>
            <span>
              Метро зараз не працює
              {metroOpensAt ? ` · перший потяг о ${metroOpensAt}` : ''}
            </span>
          </div>
        )}

        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-full w-full select-none"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <defs>
            <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-surface))" />
              <stop offset="100%" stopColor="rgb(var(--color-bg))" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="stationGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Фонова сітка */}
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgb(var(--color-border))" strokeWidth="0.5" strokeOpacity={0.35} />
          </pattern>
          <rect width={VIEW_W} height={VIEW_H} fill="url(#grid)" opacity={0.3} />

          {/* Заголовок */}
          <g transform="translate(60, 70)">
            <image href={assetUrl('/icons/kharkiv-metro-logo.png')} x={-6} y={-40} width={48} height={40} preserveAspectRatio="xMidYMid meet" />
            <text x={64} y={-5} className="font-display font-extrabold" fontSize={32} fill="rgb(var(--color-text))">Харківський метрополітен</text>
            <text x={64} y={18} className="font-sans font-medium" fontSize={16} fill="rgb(var(--color-text-muted))" fillOpacity={0.65}>Kharkiv subway system · 30 stations · 38.1 km</text>
          </g>

          {/* Лінії метро */}
          {visibleBuiltLines.map(({ line }) => (
            <LineTracks key={line.id} line={line} />
          ))}

          {/* Пересадочні гантелі */}
          {visibleInterchangePairs.map((p) => (
            <InterchangeCapsule key={p.id} s1={p.s1} s2={p.s2} />
          ))}

          {/* Маркери станцій */}
          {visibleBuiltLines.map(({ line }) =>
            line.stations.map((station) => (
              <StationMarker
                key={`${line.id}-${station.id}`}
                station={station}
                color={line.color}
                selected={selectedStationId === station.id}
                onClick={() => handleStationSelect(station.id)}
              />
            ))
          )}

          {/* Поїзди */}
          {visibleTrains.map((train) => (
            <TrainMarker
              key={train.id}
              train={train}
              selected={selectedTrainId === train.id}
              onClick={() => handleTrainSelect(train.id)}
            />
          ))}
        </svg>

        {/* Кнопки зума */}
        <div className="absolute right-3 top-3 flex flex-col gap-2" style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <ZoomButton label="+" onClick={() => setTransform((t) => ({ ...t, scale: clampScale(t.scale * 1.25) }))} />
          <ZoomButton label="−" onClick={() => setTransform((t) => ({ ...t, scale: clampScale(t.scale / 1.25) }))} />
          <ZoomButton label="⟲" onClick={resetView} small />
          <ZoomButton label="ⓘ" onClick={() => setShowLegend((v) => !v)} small />
        </div>

        {/* Умовні позначення — фіксований HTML-оверлей у лівому нижньому куті.
            На відміну від старої версії (яка малювалась усередині <svg> і тому
            "їхала" разом зі схемою під час пану/зуму й губилась за межами екрана),
            цей блок завжди лишається на місці незалежно від transform карти.
            Кожен рядок — це також тумблер: тап вмикає/вимикає показ лінії на схемі. */}
        {showLegend && !selectedTrain && !selectedStation && (
          <div
            className="absolute bottom-3 left-3 z-20 w-[min(78vw,260px)] rounded-2xl border border-border/10 bg-surface-raised/95 p-3 shadow-2xl backdrop-blur-sm"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex flex-col gap-1">
              {BUILT_LINES.map(({ line }) => {
                const isVisible = visibleLineIds.has(line.id);
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => toggleLineVisibility(line.id)}
                    className="flex items-center gap-2.5 rounded-xl p-1 text-left transition-opacity active:scale-[0.98]"
                    style={{ opacity: isVisible ? 1 : 0.4 }}
                    aria-pressed={isVisible}
                    aria-label={`${isVisible ? 'Сховати' : 'Показати'} ${line.name}`}
                  >
                    <span
                      className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-white"
                      style={{ backgroundColor: isVisible ? line.color : 'rgb(var(--color-text-muted))' }}
                    >
                      {line.number}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[11px] font-bold text-ink-text">{line.name}</div>
                      <div className="truncate text-[9.5px] text-ink-muted opacity-70">{line.nameEn} · {line.stations.length} ст.</div>
                    </div>
                    <div
                      className="flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors"
                      style={{ backgroundColor: isVisible ? line.color : 'rgb(var(--color-border))' }}
                    >
                      <div
                        className="h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                        style={{ transform: isVisible ? 'translateX(0.75rem)' : 'translateX(0)' }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 border-t border-border/10 pt-2">
              <div className="text-[11px] font-bold text-ink-text">Працює з 5:30 до 24:00</div>
              <div className="text-[9.5px] text-ink-muted opacity-70">metro.kharkiv.ua · 0-800-505-685</div>
            </div>
          </div>
        )}

      </div>

      {/* Картки інформації — навмисно ПОЗА контейнером карти (не його нащадки в DOM):
          контейнер карти має touch-action: none і власний нативний touchmove-блокер
          для пінч-зуму, і якщо картку рендерити всередині, браузер поширює цю
          заборону на скрол і всередині картки — розклад переставав гортатись
          пальцем на мобільних. Винесення сюди повертає нативний скрол/свайп. */}
      {selectedTrain && <TrainInfoCard train={selectedTrain} onClose={() => setSelectedTrainId(null)} />}
      {selectedStation && (
        <StationInfoCard
          key={selectedStation.id}
          station={selectedStation}
          arrivals={stationArrivals}
          timetable={stationTimetable}
          dayType={dayType}
          nowSec={nowSec}
          initialTab={
            initialDeepLinkRef.current.stationId === selectedStation.id
              ? initialDeepLinkRef.current.tab ?? undefined
              : undefined
          }
          onClose={() => setSelectedStationId(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// ПІДКОМПОНЕНТИ
// =============================================================================

function LineTracks({ line }: { line: SchematicLine }) {
  const stations = line.stations;
  if (!stations.length) return null;

  // Генеруємо path для лінії
  let d = '';
  stations.forEach((s, i) => {
    d += `${i === 0 ? 'M' : 'L'} ${s.point.x} ${s.point.y} `;
  });

  const first = stations[0].point;
  const last = stations[stations.length - 1].point;

  return (
    <g>
      {/* Тінь лінії */}
      <path d={d} fill="none" stroke="#000000" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />
      {/* Основна лінія */}
      <path d={d} fill="none" stroke={line.color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      {/* Внутрішня лінія */}
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} />

      {/* Заглушки на кінцевих станціях */}
      {line.id === 'route-metro-1' && (
        <>
          <line x1={first.x} y1={first.y - 10} x2={first.x} y2={first.y + 10} stroke={line.color} strokeWidth={7} strokeLinecap="round" />
          <line x1={last.x} y1={last.y - 10} x2={last.x} y2={last.y + 10} stroke={line.color} strokeWidth={7} strokeLinecap="round" />
        </>
      )}
      {line.id === 'route-metro-2' && (
        <line x1={first.x - 10} y1={first.y} x2={first.x + 10} y2={first.y} stroke={line.color} strokeWidth={7} strokeLinecap="round" />
      )}
      {line.id === 'route-metro-3' && (
        <>
          <line x1={first.x} y1={first.y - 10} x2={first.x} y2={first.y + 10} stroke={line.color} strokeWidth={7} strokeLinecap="round" />
          <line x1={last.x} y1={last.y - 10} x2={last.x} y2={last.y + 10} stroke={line.color} strokeWidth={7} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function InterchangeCapsule({ s1, s2 }: { s1: SchematicStation; s2: SchematicStation }) {
  const dx = s2.point.x - s1.point.x;
  const dy = s2.point.y - s1.point.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <g transform={`translate(${s1.point.x}, ${s1.point.y}) rotate(${angle})`}>
      <rect x={-10} y={-13} width={dist + 20} height={26} rx={13} fill="#FFFFFF" stroke="#111827" strokeWidth={4} />
      <rect x={-6} y={-9} width={dist + 12} height={18} rx={9} fill="none" stroke="#E5E7EB" strokeWidth={1} />
    </g>
  );
}

function StationMarker({
  station,
  color,
  selected,
  onClick,
}: {
  station: SchematicStation;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const isInterchange = !!station.interchangeWith?.length;
  const offsetX = station.labelOffset?.x ?? 0;
  const offsetY = station.labelOffset?.y ?? -18;

  const textAnchor = offsetX > 10 ? 'start' : offsetX < -10 ? 'end' : 'middle';
  // Пересадочні станції — більший логотип-бейдж, звичайні — компактний, але завжди чіткий.
  const logoSize = isInterchange ? 22 : 16;

  // Виносна лінія-«вус» до підпису — так само, як на офіційній схемі Т. Білецького:
  // від краю станції коротка діагональ під 45°, потім рівний горизонтальний
  // відрізок, що доводить до початку тексту з назвою станції.
  const innerR = logoSize / 2 + 4;
  const signX = offsetX >= 0 ? 1 : offsetX < 0 ? -1 : 0;
  const dirX = signX === 0 ? 0 : signX;
  const dirY = offsetY >= 0 ? 1 : -1;
  const leaderStart = { x: dirX * innerR * 0.75, y: dirY * innerR * 0.75 };
  const vertRun = Math.abs(offsetY - leaderStart.y);
  const bend = { x: leaderStart.x + dirX * vertRun, y: offsetY };
  const gap = 6;
  const flatEndX = offsetX - dirX * gap;
  const needsFlatSegment = dirX === 0 || Math.abs(flatEndX - leaderStart.x) > Math.abs(bend.x - leaderStart.x);
  const leaderPoints = needsFlatSegment
    ? `${leaderStart.x},${leaderStart.y} ${bend.x},${bend.y} ${flatEndX},${offsetY}`
    : `${leaderStart.x},${leaderStart.y} ${flatEndX},${offsetY}`;

  return (
    <g
      transform={`translate(${station.point.x}, ${station.point.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer"
    >
      {/* Прозора зона для тапа — збільшена, щоб влучати пальцем було легше на будь-якому зумі */}
      <circle r={30} fill="transparent" />

      {/* Виносна лінія-«вус» від станції до підпису назви */}
      <polyline
        points={leaderPoints}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Світіння при виборі */}
      {selected && (
        <circle r={isInterchange ? 20 : 16} fill="none" stroke="rgb(var(--color-gold))" strokeWidth={3} opacity={0.8}>
          <animate attributeName="r" values={`${isInterchange ? 18 : 14};${isInterchange ? 24 : 19};${isInterchange ? 18 : 14}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Біла підкладка під логотипом — щоб станція завжди читалась поверх ліній і фону */}
      <circle r={logoSize / 2 + 3.5} fill="#FFFFFF" stroke={color} strokeWidth={isInterchange ? 3.5 : 2.5} />

      {/* Логотип Харківського метрополітену на місці кожної станції */}
      <image
        href={assetUrl('/icons/kharkiv-metro-logo.png')}
        x={-logoSize / 2}
        y={-logoSize / 2}
        width={logoSize}
        height={logoSize}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Підпис */}
      <g transform={`translate(${offsetX}, ${offsetY})`} className="pointer-events-none select-none">
        <text
          x={0} y={0}
          textAnchor={textAnchor}
          className="font-display font-extrabold"
          fontSize={13}
          fill="rgb(var(--color-text))"
          style={{ paintOrder: 'stroke', stroke: 'rgb(var(--color-bg))', strokeWidth: 4, strokeLinejoin: 'round' }}
        >
          {station.name}
        </text>
        <text
          x={0} y={13}
          textAnchor={textAnchor}
          className="font-sans font-medium"
          fontSize={9.5}
          fill="rgb(var(--color-text-muted))"
          style={{ paintOrder: 'stroke', stroke: 'rgb(var(--color-bg))', strokeWidth: 3, strokeLinejoin: 'round' }}
        >
          {station.nameEn}
        </text>
      </g>
    </g>
  );
}

function TrainMarker({
  train,
  selected,
  onClick,
}: {
  train: LiveMetroTrain;
  selected: boolean;
  onClick: () => void;
}) {
  // Спершу пробуємо спрайт, підібраний за лінією (кольором) І напрямком руху
  // (наприклад, потяг червоної лінії, що прямує до Індустріальної, отримує
  // metro-red-line-indystrialna.png). Якщо для лінії нема напрямкових
  // спрайтів — фолбек на єдиний спрайт лінії, а потім на червону лінію.
  const spriteSrc =
    getMetroDirectionSprite(train.lineId, train.direction) ??
    TRAIN_SPRITES[train.lineId] ??
    assetUrl('/sprites/metro-red-line.jpg');
  const isDwell = train.phase === 'dwell';
  const facingLeft = train.headingDeg > 90 && train.headingDeg < 270;
  const size = selected ? 36 : 28;

  return (
    <g
      transform={`translate(${train.point.x}, ${train.point.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer"
    >
      {/* Прозора зона для тапа */}
      <circle r={28} fill="transparent" />

      {/* Світіння при виборі */}
      {selected && (
        <circle r={size / 2 + 8} fill="none" stroke="rgb(var(--color-gold))" strokeWidth={2.5} opacity={0.6}>
          <animate attributeName="r" values={`${size / 2 + 4};${size / 2 + 10};${size / 2 + 4}`} dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      <image
        href={spriteSrc}
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
        transform={facingLeft ? 'scale(-1,1)' : undefined}
        opacity={isDwell ? 0.8 : 1}
      />

      {/* Індикатор зупинки */}
      {isDwell && (
        <circle r={size / 2 + 5} fill="none" stroke="rgb(var(--color-gold))" strokeWidth={2} opacity={0.5}>
          <animate attributeName="r" values={`${size / 2 + 3};${size / 2 + 8};${size / 2 + 3}`} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Напрямок */}
      <text
        y={size / 2 + 14}
        textAnchor="middle"
        fontSize={8}
        fill="#FFFFFF"
        opacity={0.8}
        style={{ paintOrder: 'stroke', stroke: '#0B120F', strokeWidth: 2 }}
      >
        {train.headsign}
      </text>
    </g>
  );
}

function ZoomButton({ label, onClick, small }: { label: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center justify-center rounded-full border border-black/10 bg-ink-surface/90 font-display font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-white hover:text-ink',
        small ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-xl',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function TrainInfoCard({ train, onClose }: { train: LiveMetroTrain; onClose: () => void }) {
  const nowSec = secOfDay(new Date());
  const speedKmh = train.speedKmh;

  return (
    <InfoCardShell onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-sm"
          style={{ backgroundColor: train.lineColor }}
        >
          {train.lineNumber}
        </span>
        <div className="min-w-0">
          <span className="block font-display text-base font-extrabold leading-tight text-ink-text">
            Поїзд лінії {train.lineNumber}
          </span>
          <span className="text-[11.5px] text-ink-muted opacity-70">→ {train.headsign}</span>
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2">
        <InfoRow label={<><Navigation className="h-3.5 w-3.5 opacity-60" />Поточна станція</>}>
          {train.phase === 'dwell' ? train.nextStation.name : train.previousStation.name}
        </InfoRow>
        <InfoRow label={<><MapPin className="h-3.5 w-3.5 opacity-60" />Наступна станція</>}>
          {train.nextStation.name}
        </InfoRow>
        <InfoRow label={<><TrainFront className="h-3.5 w-3.5 opacity-60" />Статус руху</>}>
          {train.phase === 'dwell' ? (
            <span className="flex items-center gap-1 text-gold-light">
              <DoorOpen className="h-3.5 w-3.5" />
              зупинка · двері відкриті
            </span>
          ) : (
            <span>у дорозі · ≈ {speedKmh} км/год</span>
          )}
        </InfoRow>
        <div className="flex items-center justify-between rounded-xl bg-mint/10 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-ink-muted opacity-80">
            <Clock className="h-3.5 w-3.5 opacity-70" />
            Прибуття на {train.nextStation.name}
          </span>
          <span className="font-bold text-mint">
            {formatEtaClock(train.etaNextStationSec)} · {formatEtaCountdown(train.etaNextStationSec, nowSec)}
          </span>
        </div>
      </div>
    </InfoCardShell>
  );
}

function StationInfoCard({
  station,
  arrivals,
  timetable,
  dayType,
  nowSec,
  initialTab,
  onClose,
}: {
  station: SchematicStation;
  arrivals: ReturnType<typeof getUpcomingArrivalsForStation>;
  timetable: StationDayTimetableEntry[];
  dayType: LiveMetroDayType;
  nowSec: number;
  initialTab?: 'arrivals' | 'timetable' | 'exits' | 'info';
  onClose: () => void;
}) {
  const photo = getStationPhoto(station.id);
  const [showFullTimetable, setShowFullTimetable] = useState(initialTab === 'timetable');
  const [activeTab, setActiveTab] = useState<'arrivals' | 'timetable' | 'exits' | 'info'>(initialTab ?? 'arrivals');

  const line = BUILT_LINES.find((l) => l.line.id === station.lineId)?.line;

  // Обране прив'язується до канонічного id зупинки (`stop-metro-<slug>`),
  // спільного зі списком зупинок і роутером поїздок — так одна й та сама
  // станція є "улюбленою" і тут, і в списку "Найближчі зупинки"/пошуку.
  const canonicalStopId = realStationId(station.id);
  const isFavorite = useFavoritesStore((s) => s.isStopFavorite(canonicalStopId));
  const addFavoriteStop = useFavoritesStore((s) => s.addStop);
  const removeFavoriteStop = useFavoritesStore((s) => s.removeStop);

  return (
    <InfoCardShell onClose={onClose}>
      {/* Шапка з фото на всю ширину картки — фото "перетікає" з-під ручки картки,
          назва станції лежить на плавному градієнті поверх фото. */}
      <div className="-mx-4 -mt-1">
        <div className="relative h-40 w-full overflow-hidden">
          {photo ? (
            <img
              src={photo}
              alt={station.name}
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${line?.color ?? '#1b1f1d'}55, rgb(var(--color-surface-raised)))` }}
            >
              <TrainFront className="h-12 w-12 opacity-30" style={{ color: line?.color }} />
            </div>
          )}
          {/* Градієнт для читабельності підпису поверх фото */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgb(var(--color-surface-raised)) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }}
          />
          <div
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: line?.color }}
          />

          <div className="absolute inset-x-4 bottom-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow"
                style={{ backgroundColor: line?.color }}
              >
                {line?.number}
              </span>
              {station.interchangeWith?.length ? (
                <span className="flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold-light backdrop-blur">
                  <ArrowLeftRight className="h-2.5 w-2.5" />
                  Пересадка
                </span>
              ) : null}
              <FavoriteButton
                active={isFavorite}
                onToggle={() => (isFavorite ? removeFavoriteStop(canonicalStopId) : addFavoriteStop(canonicalStopId))}
                label={isFavorite ? 'Прибрати станцію з обраних' : 'Додати станцію в обрані'}
                className="ml-auto -mr-1 -mt-1 bg-black/25 backdrop-blur"
              />
            </div>
            <h2 className="mt-1.5 font-display text-xl font-extrabold leading-tight text-white drop-shadow-sm">
              {station.name}
            </h2>
            <p className="text-[11.5px] font-medium text-white/75">{station.nameEn}</p>
          </div>
        </div>
      </div>

      {station.interchangeWith?.length ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
          {station.interchangeWith.map((id) => ALL_STATIONS_MAP.get(id)?.name).filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {station.description && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted opacity-80">{station.description}</p>
      )}

      {/* Таби — сегментований перемикач у стилі "pill" */}
      <div className="sticky top-0 z-[1] mt-3.5 -mx-1 flex gap-1 rounded-2xl bg-surface-soft p-1">
        {(
          [
            { key: 'arrivals', label: 'Прибуття', icon: Clock },
            { key: 'timetable', label: 'Розклад', icon: CalendarDays },
            { key: 'exits', label: 'Виходи', icon: DoorOpen },
            { key: 'info', label: 'Інфо', icon: Info },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold transition-all duration-200',
                active
                  ? 'bg-surface-raised text-ink-text shadow-sm'
                  : 'text-ink-muted opacity-70 hover:opacity-100',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Контент табів */}
      <div className="mt-3 animate-fade-in">
        {activeTab === 'arrivals' && (
          <div className="flex flex-col gap-2">
            {arrivals.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock className="h-7 w-7 text-ink-muted opacity-30" />
                <p className="text-[12.5px] text-ink-muted opacity-60">Найближчим часом потягів немає</p>
              </div>
            )}
            {arrivals.map((a, i) => (
              <div
                key={`${a.lineId}-${a.headsign}-${i}`}
                className="flex items-center justify-between rounded-2xl border border-border/8 bg-surface-soft px-3.5 py-2.5 text-[12.5px] transition-colors hover:bg-surface"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: a.lineColor }}
                  >
                    {a.lineNumber}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink-text">→ {a.headsign}</span>
                    <span className="text-[10.5px] text-ink-muted opacity-60">{formatEtaClock(a.etaSec)}</span>
                  </div>
                </div>
                <span className="min-w-[54px] rounded-full bg-mint/10 px-2.5 py-1 text-right text-[12px] font-bold text-mint">
                  {formatEtaCountdown(a.etaSec, nowSec)}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'timetable' && timetable.length > 0 && (
          <div>
            <div className="mb-2.5 flex items-center justify-between text-[11.5px]">
              <span className="flex items-center gap-1.5 font-medium text-ink-muted opacity-80">
                <CalendarDays className="h-3.5 w-3.5" />
                {dayType === 'weekday' ? 'Будній день' : 'Вихідний день'}
              </span>
              <button
                type="button"
                onClick={() => setShowFullTimetable((v) => !v)}
                className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink-text"
              >
                {showFullTimetable ? '▲ Згорнути' : '▼ Розгорнути все'}
              </button>
            </div>
            <div className={`flex flex-col gap-3 transition-all ${showFullTimetable ? '' : 'max-h-36 overflow-hidden'}`}>
              {timetable.map((entry, i) => (
                <TimetableBlock key={`${entry.lineId}-${entry.direction}-${i}`} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'exits' && (
          <div className="flex flex-col gap-2">
            {station.exits && station.exits.length > 0 ? (
              station.exits.map((exit, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-2xl border border-border/8 bg-surface-soft px-3.5 py-2.5 text-[12.5px]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest/15 text-forest">
                    <DoorOpen className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium text-ink-text">{exit}</span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <DoorOpen className="h-7 w-7 text-ink-muted opacity-30" />
                <p className="text-[12.5px] text-ink-muted opacity-60">Дані про виходи уточнюються</p>
              </div>
            )}
            <p className="px-1 text-[10.5px] leading-relaxed text-ink-muted opacity-50">
              Нумерація конкретних вестибюлів офіційно не публікується метрополітеном — тут орієнтири на поверхні,
              куди веде вихід(и) зі станції.
            </p>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="flex flex-col gap-2 text-[12.5px]">
            <InfoRow label="Тип станції">
              {station.type === 'deep' && 'Глибокого закладення'}
              {station.type === 'shallow' && 'Мілкого закладення'}
              {station.type === 'single-vault' && 'Односклепінна'}
              {station.type === 'pylon' && 'Колонна'}
            </InfoRow>
            <InfoRow label="Дата відкриття">{station.opened}</InfoRow>
            <InfoRow label="Лінія">
              <span className="flex items-center gap-1.5" style={{ color: line?.color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line?.color }} />
                {line?.number} — {line?.name}
              </span>
            </InfoRow>
            {station.interchangeWith && station.interchangeWith.length > 0 && (
              <InfoRow label="Пересадка на">
                <span className="text-gold-light">
                  {station.interchangeWith.map((id) => {
                    const s = ALL_STATIONS_MAP.get(id);
                    const l = BUILT_LINES.find((bl) => bl.line.id === s?.lineId)?.line;
                    return l ? `${l.number} лінію` : '';
                  }).filter(Boolean).join(', ')}
                </span>
              </InfoRow>
            )}
          </div>
        )}
      </div>
    </InfoCardShell>
  );
}

function InfoRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-soft px-3.5 py-2.5">
      <span className="flex items-center gap-1.5 text-ink-muted opacity-70">{label}</span>
      <span className="font-medium text-ink-text">{children}</span>
    </div>
  );
}

function TimetableBlock({ entry }: { entry: StationDayTimetableEntry }) {
  return (
    <div className="rounded-2xl border border-border/8 bg-surface-soft p-3">
      <div className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-ink-text">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.lineColor }} />
        <span>{entry.lineNumber}</span>
        <span className="text-ink-muted opacity-50">→</span>
        <span>{entry.headsign}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entry.times.map((t, i) => (
          <span key={i} className="rounded-lg bg-surface px-1.5 py-0.5 text-[10.5px] tabular-nums text-ink-muted opacity-80">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoCardShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const dragRef = useRef<{ startY: number; currentY: number; dragging: boolean }>({
    startY: 0,
    currentY: 0,
    dragging: false,
  });
  const sheetRef = useRef<HTMLDivElement>(null);

  // Плавне закриття: спершу програємо анімацію "вниз", і лише потім
  // розмонтовуємо картку — замість миттєвого зникнення.
  const closeAnimated = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, currentY: e.clientY, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.currentY = e.clientY;
    const dy = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = 'none';
  };

  const onHandlePointerUp = () => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    dragRef.current.dragging = false;
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (dy > 80) {
      closeAnimated();
    }
  };

  return (
    <>
      {/* Затемнення фону — плавно проявляється разом із карткою й закриває її по тапу */}
      <div
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 ${
          closing ? 'opacity-0' : 'animate-fade-in opacity-100'
        }`}
        onClick={closeAnimated}
        aria-hidden="true"
      />

      {/* Сама картка — виїжджає знизу екрана плавним cubic-bezier переходом */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={[
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[84vh] flex-col overflow-hidden',
          'rounded-t-[28px] border-t border-border/10 bg-surface-raised shadow-glass-lg',
          closing ? 'translate-y-full transition-transform duration-200 ease-in' : 'animate-sheet-up',
        ].join(' ')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Ручка для перетягування вниз — закриває картку жестом */}
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-ink-muted/25" />
        </div>

        <button
          type="button"
          onClick={closeAnimated}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/80 text-ink-muted shadow-sm backdrop-blur transition-colors hover:bg-surface hover:text-ink-text"
          aria-label="Закрити"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="overflow-y-auto overscroll-contain px-4 pb-5">{children}</div>
      </div>
    </>
  );
}

// Карта всіх станцій для швидкого доступу
const ALL_STATIONS_MAP = new Map<string, SchematicStation>();
for (const { line } of BUILT_LINES) {
  for (const station of line.stations) {
    if (!ALL_STATIONS_MAP.has(station.id)) {
      ALL_STATIONS_MAP.set(station.id, station);
    }
  }
}
