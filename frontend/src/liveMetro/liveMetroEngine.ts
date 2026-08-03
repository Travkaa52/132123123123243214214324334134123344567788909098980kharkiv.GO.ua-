import { DWELL_SEC, SCHEMATIC_LINES, type LiveMetroDayType, type SchematicLine, type SchematicPoint, type SchematicStation } from '@/liveMetro/schematicData';
import { TIMETABLES } from '@/liveMetro/timetableData';

export type LiveMetroDirection = 'forward' | 'backward';
export type LiveMetroPhase = 'dwell' | 'accelerating' | 'cruising' | 'braking';

/** "HH:MM" -> секунди від півночі. */
export function timeToSec(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error(`liveMetroEngine: некоректний час "${time}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

export function secOfDay(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
}

export function dayTypeOf(date: Date): LiveMetroDayType {
  const d = date.getDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Плавний розгін/гальмування: повільний старт, швидка середина, повільне завершення. */
function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function easeInOutCubicDerivative(t: number): number {
  const c = clamp01(t);
  if (c < 0.5) return 12 * c * c;
  const u = -2 * c + 2;
  return 3 * u * u;
}

function lerpPoint(a: SchematicPoint, b: SchematicPoint, t: number): SchematicPoint {
  const c = clamp01(t);
  return { x: a.x + (b.x - a.x) * c, y: a.y + (b.y - a.y) * c };
}

function distance(a: SchematicPoint, b: SchematicPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function bearingDeg(a: SchematicPoint, b: SchematicPoint): number {
  // 0° = вгору (північ схеми), за годинниковою стрілкою — узгоджено з обертанням спрайту.
  const angle = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export interface DirectionRoute {
  direction: LiveMetroDirection;
  headsign: string;
  stations: SchematicStation[];
  /** Час прибуття на станцію i (від початку рейсу), секунд — уже переорієнтовано під цей напрямок. */
  arrivalOffsetSec: number[];
  tripDurationSec: number;
  totalActiveDurationSec: number;
  firstDepartureSec: number;
}

export interface LiveMetroTrain {
  id: string;
  lineId: string;
  lineNumber: string;
  lineName: string;
  lineColor: string;
  direction: LiveMetroDirection;
  headsign: string;
  point: SchematicPoint;
  headingDeg: number;
  speedRatio: number; // 0..1 умовна швидкість (для UI/анімації), 1 = крейсерська
  phase: LiveMetroPhase;
  progressRatio: number;
  previousStation: SchematicStation;
  nextStation: SchematicStation;
  etaNextStationSec: number;
  etaTerminusSec: number;
  departureAtSec: number;
}

function buildDirectionRoute(line: SchematicLine, direction: LiveMetroDirection): DirectionRoute {
  const forward = direction === 'forward';
  const stations = forward ? line.stations : [...line.stations].reverse();
  const tripDurationSec = line.stations[line.stations.length - 1].arrivalOffsetSec;

  const arrivalOffsetSec = forward
    ? line.stations.map((s) => s.arrivalOffsetSec)
    : [...line.stations].reverse().map((s) => tripDurationSec - s.arrivalOffsetSec);

  const headsign = forward ? line.headsignForward : line.headsignBackward;
  const firstDepartureSec = timeToSec(forward ? line.firstDepartureForward.weekday : line.firstDepartureBackward.weekday);

  return {
    direction,
    headsign,
    stations,
    arrivalOffsetSec,
    tripDurationSec,
    totalActiveDurationSec: tripDurationSec + DWELL_SEC,
    firstDepartureSec
  };
}

interface BuiltLine {
  line: SchematicLine;
  forward: DirectionRoute;
  backward: DirectionRoute;
}

export const BUILT_LINES: BuiltLine[] = SCHEMATIC_LINES.map((line) => ({
  line,
  forward: buildDirectionRoute(line, 'forward'),
  backward: buildDirectionRoute(line, 'backward')
}));

const MIN_HEADWAY_SEC = 60;

/** Реальні відправлення з першої станції напрямку (за фактичним графіком станції), якщо є в TIMETABLES. */
function realDeparturesFromTimetable(line: SchematicLine, direction: LiveMetroDirection, dayType: LiveMetroDayType): number[] | null {
  const stations = direction === 'forward' ? line.stations : [...line.stations].reverse();
  const originId = stations[0].id;
  const entry = TIMETABLES[dayType]?.[originId]?.[line.id];
  const times = entry?.[direction];
  if (!times || times.length === 0) return null;
  return times.map(timeToSec).sort((a, b) => a - b);
}

/** Детермінований перелік часу відправлень за добу для напрямку. Реальний графік станції — пріоритетно, інакше рівномірний інтервал. */
function buildDailyDepartures(line: SchematicLine, direction: LiveMetroDirection, dayType: LiveMetroDayType): number[] {
  const real = realDeparturesFromTimetable(line, direction, dayType);
  if (real) return real;

  const firstDepartureStr = direction === 'forward' ? line.firstDepartureForward[dayType] : line.firstDepartureBackward[dayType];
  const firstSec = timeToSec(firstDepartureStr);
  const lastSec = timeToSec(line.lastDeparture);
  const headwaySec = Math.max(MIN_HEADWAY_SEC, Math.round(line.intervalMinutes[dayType] * 60));

  const departures: number[] = [];
  let cursor = firstSec;
  let safety = 0;
  const maxIterations = Math.ceil((lastSec - firstSec) / MIN_HEADWAY_SEC) + 2;
  while (cursor <= lastSec && safety <= maxIterations) {
    departures.push(cursor);
    cursor += headwaySec;
    safety += 1;
  }
  return departures;
}

/** Кеш денних розкладів по (lineId+direction+dayType) — рахуємо один раз, не на кожен кадр. */
const departuresCache = new Map<string, number[]>();
function getDailyDepartures(line: SchematicLine, direction: LiveMetroDirection, dayType: LiveMetroDayType): number[] {
  const key = `${line.id}:${direction}:${dayType}`;
  let cached = departuresCache.get(key);
  if (!cached) {
    cached = buildDailyDepartures(line, direction, dayType);
    departuresCache.set(key, cached);
  }
  return cached;
}

function sampleTrainAt(route: DirectionRoute, elapsedSec: number): {
  point: SchematicPoint;
  headingDeg: number;
  speedRatio: number;
  phase: LiveMetroPhase;
  progressRatio: number;
  segmentIndex: number;
  nextStationOffsetSec: number;
} {
  const clamped = Math.max(0, Math.min(elapsedSec, route.totalActiveDurationSec));

  let segmentIndex = 0;
  for (let i = 0; i < route.stations.length - 1; i++) {
    const departureOffset = i === 0 ? 0 : route.arrivalOffsetSec[i] + DWELL_SEC;
    const arrivalOffset = route.arrivalOffsetSec[i + 1];
    const windowEnd = arrivalOffset + DWELL_SEC;
    segmentIndex = i;
    if (clamped <= windowEnd || i === route.stations.length - 2) break;
    void departureOffset;
  }

  const fromStation = route.stations[segmentIndex];
  const toStation = route.stations[segmentIndex + 1];
  const departureOffsetSec = segmentIndex === 0 ? 0 : route.arrivalOffsetSec[segmentIndex] + DWELL_SEC;
  const arrivalOffsetSec = route.arrivalOffsetSec[segmentIndex + 1];
  const cruiseDurationSec = Math.max(1, arrivalOffsetSec - departureOffsetSec);
  const elapsedInSegment = clamped - departureOffsetSec;

  if (elapsedInSegment >= cruiseDurationSec) {
    return {
      point: toStation.point,
      headingDeg: bearingDeg(fromStation.point, toStation.point),
      speedRatio: 0,
      phase: 'dwell',
      progressRatio: clamp01(clamped / route.tripDurationSec),
      segmentIndex,
      nextStationOffsetSec: arrivalOffsetSec
    };
  }

  const t = clamp01(elapsedInSegment / cruiseDurationSec);
  const easedT = easeInOutCubic(t);
  const point = lerpPoint(fromStation.point, toStation.point, easedT);
  const headingDeg = bearingDeg(fromStation.point, toStation.point);

  const easedDerivative = easeInOutCubicDerivative(t);
  const dist = distance(fromStation.point, toStation.point);
  // Умовна швидкість, нормована на "типову" крейсерську похідну ~2.0 — лише для UI (0..~1+).
  const speedRatio = Math.min(1.4, (dist * easedDerivative) / cruiseDurationSec / 6);

  const phase: LiveMetroPhase = t < 0.18 ? 'accelerating' : t > 0.82 ? 'braking' : 'cruising';

  return {
    point,
    headingDeg,
    speedRatio,
    phase,
    progressRatio: clamp01(clamped / route.tripDurationSec),
    segmentIndex,
    nextStationOffsetSec: arrivalOffsetSec
  };
}

/**
 * ЗБЕРЕЖЕНО ДЛЯ СУМІСНОСТІ з кодом, який очікує "секунди від півночі" (наприклад,
 * для прив'язки локальної точки на схемі до конкретного сегмента маршруту).
 * Раніше ця функція вночі штучно "закільцьовувала" час, щоб потяги ніколи не
 * зникали з карти — тепер поїзди повинні реально зникати, коли метро не працює,
 * тож функція просто повертає справжній час доби без жодних підмін.
 */
export function effectiveOperatingSec(date: Date): number {
  return secOfDay(date);
}

/** Опівночі (00:00:00 за локальним часом) заданого дня, зі зсувом у добах, у секундах з епохи. */
function dayStartAbsSec(date: Date, dayOffset: number): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, 0, 0, 0, 0);
  return d.getTime() / 1000;
}

function dayTypeOfAbsDay(dayStartSec: number): LiveMetroDayType {
  const d = new Date(dayStartSec * 1000).getDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

/**
 * Усі активні потяги (обидва напрямки, усі лінії) на момент `date`.
 *
 * Час рахується у безперервних секундах з епохи (а не "секундах від півночі
 * поточного дня") — це дає дві важливі речі:
 *  1) потяг, що виїхав, наприклад, о 23:50, і закінчує рейс вже після
 *     півночі, коректно "доїжджає" до кінцевої, а не зникає/телепортується
 *     через перехід через 00:00;
 *  2) коли реальний час знаходиться поза годинами роботи метро (глибока
 *     ніч), жодних активних відправлень немає — і ця функція чесно повертає
 *     ПОРОЖНІЙ список, тобто на карті просто немає потягів, поки метро не
 *     відкриється за розкладом (а не фейкова їзда по колу, як було раніше).
 */
export function getActiveTrains(date: Date): LiveMetroTrain[] {
  const nowAbsSec = date.getTime() / 1000;
  const trains: LiveMetroTrain[] = [];

  // Перевіряємо "сьогодні" й "вчора": рейс, що відправився пізно ввечері
  // напередодні, може ще бути в дорозі вже після півночі.
  for (const dayOffset of [0, -1]) {
    const dayStartSec = dayStartAbsSec(date, dayOffset);
    const dayType = dayTypeOfAbsDay(dayStartSec);

    for (const { line, forward, backward } of BUILT_LINES) {
      for (const route of [forward, backward]) {
        const departures = getDailyDepartures(line, route.direction, dayType);
        for (const departureSecOfDay of departures) {
          const departureAbsSec = dayStartSec + departureSecOfDay;
          const elapsed = nowAbsSec - departureAbsSec;
          if (elapsed < 0 || elapsed > route.totalActiveDurationSec) continue;

          const sample = sampleTrainAt(route, elapsed);
          trains.push({
            id: `${line.id}-${route.direction}-${Math.round(departureAbsSec)}`,
            lineId: line.id,
            lineNumber: line.number,
            lineName: line.name,
            lineColor: line.color,
            direction: route.direction,
            headsign: route.headsign,
            point: sample.point,
            headingDeg: sample.headingDeg,
            speedRatio: sample.speedRatio,
            phase: sample.phase,
            progressRatio: sample.progressRatio,
            previousStation: route.stations[sample.segmentIndex],
            nextStation: route.stations[sample.segmentIndex + 1],
            etaNextStationSec: departureSecOfDay + sample.nextStationOffsetSec,
            etaTerminusSec: departureSecOfDay + route.tripDurationSec,
            departureAtSec: departureSecOfDay
          });
        }
      }
    }
  }

  return trains;
}

/**
 * Чи працює метро прямо зараз — тобто чи є хоч один потяг на лінії.
 * Зручний прапорець для UI (наприклад, банер "Метро зараз не працює: 00:32–05:30").
 */
export function isMetroOperatingNow(date: Date): boolean {
  return getActiveTrains(date).length > 0;
}

/** Час найближчого відкриття метро (перше відправлення) від моменту `date`, якщо метро зараз закрите. Секунди від півночі поточного/наступного дня. */
export function nextMetroOpeningLabel(date: Date): string | null {
  if (isMetroOperatingNow(date)) return null;
  const nowSec = secOfDay(date);
  const dayType = dayTypeOf(date);
  let earliestFirst = Infinity;
  for (const { line } of BUILT_LINES) {
    earliestFirst = Math.min(earliestFirst, timeToSec(line.firstDepartureForward[dayType]), timeToSec(line.firstDepartureBackward[dayType]));
  }
  // Якщо зараз пізня ніч до півночі й перше відправлення вже "завтра" (менше за nowSec), просто показуємо його час.
  void nowSec;
  return formatEtaClock(earliestFirst);
}

export interface UpcomingDeparture {
  lineId: string;
  lineNumber: string;
  lineColor: string;
  direction: LiveMetroDirection;
  headsign: string;
  etaSec: number;
}

/** Найближчі прибуття (обидва напрямки, усі лінії, що проходять через станцію) на конкретну станцію. */
export function getUpcomingArrivalsForStation(stationId: string, date: Date, limitPerDirection = 3): UpcomingDeparture[] {
  const nowSec = secOfDay(date);
  const dayType = dayTypeOf(date);
  const results: UpcomingDeparture[] = [];

  for (const { line, forward, backward } of BUILT_LINES) {
    for (const route of [forward, backward]) {
      const stationIndex = route.stations.findIndex((s) => s.id === stationId);
      if (stationIndex === -1) continue;

      // Пріоритет — реальний графік саме цієї станції (найточніший), інакше — розрахунок від відправлень лінії.
      const realTimes = TIMETABLES[dayType]?.[stationId]?.[line.id]?.[route.direction];
      let candidateEtas: number[];
      if (realTimes && realTimes.length > 0) {
        candidateEtas = realTimes.map(timeToSec);
      } else {
        const arrivalOffset = route.arrivalOffsetSec[stationIndex];
        const departures = getDailyDepartures(line, route.direction, dayType);
        candidateEtas = departures.map((departureAtSec) => departureAtSec + arrivalOffset);
      }

      const upcoming = candidateEtas
        .filter((etaSec) => etaSec >= nowSec)
        .sort((a, b) => a - b)
        .slice(0, limitPerDirection);

      for (const etaSec of upcoming) {
        results.push({
          lineId: line.id,
          lineNumber: line.number,
          lineColor: line.color,
          direction: route.direction,
          headsign: route.headsign,
          etaSec
        });
      }
    }
  }

  return results.sort((a, b) => a.etaSec - b.etaSec);
}

export interface StationDayTimetableEntry {
  lineId: string;
  lineNumber: string;
  lineColor: string;
  direction: LiveMetroDirection;
  headsign: string;
  times: string[];
}

/** Повний графік відправлень (усі лінії/напрямки) для станції на конкретний день — для показу таблиці «Графік». */
export function getStationDayTimetable(stationId: string, dayType: LiveMetroDayType): StationDayTimetableEntry[] {
  const result: StationDayTimetableEntry[] = [];
  const perDay = TIMETABLES[dayType]?.[stationId];
  if (!perDay) return result;

  for (const { line } of BUILT_LINES) {
    const entry = perDay[line.id];
    if (!entry) continue;
    if (entry.forward.length) {
      result.push({
        lineId: line.id,
        lineNumber: line.number,
        lineColor: line.color,
        direction: 'forward',
        headsign: line.headsignForward,
        times: entry.forward
      });
    }
    if (entry.backward.length) {
      result.push({
        lineId: line.id,
        lineNumber: line.number,
        lineColor: line.color,
        direction: 'backward',
        headsign: line.headsignBackward,
        times: entry.backward
      });
    }
  }
  return result;
}

export function formatEtaClock(etaSec: number): string {
  const wrapped = ((etaSec % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatEtaCountdown(etaSec: number, nowSec: number): string {
  const diff = Math.round(etaSec - nowSec);
  if (diff <= 0) return 'зараз';
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m <= 0) return `${s} с`;
  return `${m} хв ${s} с`;
}
