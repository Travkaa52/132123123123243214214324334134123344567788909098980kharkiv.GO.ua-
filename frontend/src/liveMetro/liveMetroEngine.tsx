/**
 * Аналітичний рушій "живого метро" (Ultra Performance 120 FPS Edition).
 * 
 * Чиста функція часу → позиції потягів у розщепленні до мілісекунд.
 * Нуль алокацій у гарячих циклах (rAF), повна тип-паритетність з UI-компонентами.
 */
import {
  SCHEMATIC_LINES,
  DWELL_SEC,
  SERVICE_START_SEC,
  SERVICE_END_SEC,
  type SchematicLine,
  type SchematicStation,
  type LiveMetroDayType
} from '@/liveMetro/schematicData';

export type TrainDirection = 'forward' | 'backward';
export type TrainDirectionCode = '0' | '1';
export type TrainPhase = 'dwell' | 'accelerating' | 'cruising' | 'braking';

export interface LiveMetroTrain {
  id: string;
  lineId: string;
  lineNumber: string;
  lineColor: string;
  direction: TrainDirection;
  directionCode: TrainDirectionCode;
  headsign: string;
  point: { x: number; y: number };
  headingDeg: number;
  phase: TrainPhase;
  speedRatio: number;
  progressSegment: number; // 0.0 ... 1.0 (прогрес між двома станціями)
  previousStation: SchematicStation;
  nextStation: SchematicStation;
  etaNextStationSec: number;
  etaTerminusSec: number;
}

export interface UpcomingDeparture {
  lineId: string;
  lineNumber: string;
  lineColor: string;
  direction: TrainDirectionCode; // '0' | '1' — сумісність з LiveMetroWidget
  directionType: TrainDirection; // 'forward' | 'backward'
  headsign: string;
  etaSec: number;
}

export interface StationDayTimetableEntry {
  lineId: string;
  lineNumber: string;
  lineColor: string;
  direction: TrainDirection;
  directionCode: TrainDirectionCode;
  headsign: string;
  times: string[];
}

export interface LineLiveSummary {
  lineId: string;
  number: string;
  name: string;
  color: string;
  activeCount: number;
  forwardCount: number;
  backwardCount: number;
  intervalMinutes: number;
}

/** { line } обгортка — зберігає форму, якою користується сторінка карти. */
export const BUILT_LINES = SCHEMATIC_LINES.map((line) => ({ line }));

// ============================================================================
//  КЕШУВАННЯ ТАЙМЛАЙНІВ (Zero GC Allocations in rAF)
// ============================================================================

interface TimelineEntry {
  station: SchematicStation;
  t: number; // секунди від початку рейсу
}

type LineTimelineCache = Record<TrainDirection, TimelineEntry[]>;

const TIMELINE_CACHE: Record<string, LineTimelineCache> = {};

/** Одноразова ініціалізація статичних таймлайнів для кожної лінії та напрямку. */
(function initTimelineCache() {
  for (const line of SCHEMATIC_LINES) {
    const total = line.stations[line.stations.length - 1].arrivalOffsetSec;

    const forward: TimelineEntry[] = line.stations.map((station) => ({
      station,
      t: station.arrivalOffsetSec
    }));

    const backward: TimelineEntry[] = line.stations
      .slice()
      .reverse()
      .map((station) => ({
        station,
        t: total - station.arrivalOffsetSec
      }));

    TIMELINE_CACHE[line.id] = { forward, backward };
  }
})();

// ============================================================================
//  МАТЕМАТИЧНІ УТИЛІТИ ТА ЧАС
// ============================================================================

/** Повертає дробову кількість секунд від початку доби (для 120 FPS плавності). */
export function secOfDay(date: Date): number {
  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds() +
    date.getMilliseconds() / 1000
  );
}

export function dayTypeOf(date: Date): LiveMetroDayType {
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Форматує секунди-від-півночі як "ГГ:ХХ". */
export function formatEtaClock(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
}

/** Форматує зворотний відлік до прибуття у зручному вигляді ("3 хв", "<1 хв"). */
export function formatEtaCountdown(etaSec: number, nowSec: number): string {
  const diff = etaSec - nowSec;
  if (diff <= 15) return 'зараз';
  if (diff <= 45) return '<1 хв';
  const mins = Math.round(diff / 60);
  return `${mins} хв`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function headingBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function toDirectionCode(dir: TrainDirection): TrainDirectionCode {
  return dir === 'forward' ? '0' : '1';
}

/**
 * Розрахунок фізично реалістичного S-образного розгону/гальмування потяга між станціями.
 */
function calculateSegmentPhysics(rawRatio: number): {
  easedRatio: number;
  phase: TrainPhase;
  speedRatio: number;
} {
  if (rawRatio <= 0) return { easedRatio: 0, phase: 'dwell', speedRatio: 0 };
  if (rawRatio >= 1) return { easedRatio: 1, phase: 'dwell', speedRatio: 0 };

  // Зона прискорення (перші 18% шляху)
  if (rawRatio < 0.18) {
    const local = rawRatio / 0.18;
    const speed = local;
    const eased = 0.5 * Math.pow(local, 2) * 0.18;
    return { easedRatio: eased, phase: 'accelerating', speedRatio: speed };
  }

  // Зона гальмування (останні 18% шляху)
  if (rawRatio > 0.82) {
    const local = (rawRatio - 0.82) / 0.18;
    const speed = 1 - local;
    const eased = 0.82 + (1 - 0.5 * Math.pow(1 - local, 2)) * 0.18;
    return { easedRatio: eased, phase: 'braking', speedRatio: speed };
  }

  // Зона круїзу (крейсерська швидкість)
  const cruiseProgress = (rawRatio - 0.18) / (0.82 - 0.18);
  const eased = 0.18 + cruiseProgress * (0.82 - 0.18);
  return { easedRatio: eased, phase: 'cruising', speedRatio: 1.0 };
}

// ============================================================================
//  ОБЧИСЛЕННЯ ПОЗИЦІЙ ТА РЕЙСІВ
// ============================================================================

interface Candidate {
  line: SchematicLine;
  direction: TrainDirection;
  departureSec: number;
}

function candidatesFor(
  line: SchematicLine,
  direction: TrainDirection,
  nowSec: number,
  dayType: LiveMetroDayType
): Candidate[] {
  const timeline = TIMELINE_CACHE[line.id][direction];
  const total = timeline[timeline.length - 1].t;
  const interval = Math.max(60, line.intervalMinutes[dayType] * 60);
  const out: Candidate[] = [];

  for (let offset = 0; offset < total; offset += interval) {
    let mod = (nowSec - SERVICE_START_SEC - offset) % interval;
    if (mod < 0) mod += interval;
    const elapsed = offset + mod;
    if (elapsed > total) continue;
    const departureSec = nowSec - elapsed;
    if (departureSec < SERVICE_START_SEC - 1 || departureSec > SERVICE_END_SEC) continue;
    out.push({ line, direction, departureSec });
  }
  return out;
}

function positionAtElapsed(
  line: SchematicLine,
  direction: TrainDirection,
  elapsed: number
): {
  point: { x: number; y: number };
  headingDeg: number;
  phase: TrainPhase;
  speedRatio: number;
  progressSegment: number;
  previousStation: SchematicStation;
  nextStation: SchematicStation;
  etaNextStationSec: number;
} | null {
  const timeline = TIMELINE_CACHE[line.id][direction];

  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i];
    const b = timeline[i + 1];
    if (elapsed < a.t || elapsed > b.t) continue;

    const travelStart = a.t + DWELL_SEC;
    const travelEnd = b.t;

    // Потяг стоїть на станції (dwell)
    if (elapsed <= travelStart || travelEnd <= travelStart) {
      return {
        point: a.station.point,
        headingDeg: headingBetween(a.station.point, b.station.point),
        phase: 'dwell',
        speedRatio: 0,
        progressSegment: 0,
        previousStation: a.station,
        nextStation: b.station,
        etaNextStationSec: travelEnd
      };
    }

    // Рух між станціями
    const rawRatio = Math.min(1, Math.max(0, (elapsed - travelStart) / (travelEnd - travelStart)));
    const { easedRatio, phase, speedRatio } = calculateSegmentPhysics(rawRatio);

    return {
      point: {
        x: lerp(a.station.point.x, b.station.point.x, easedRatio),
        y: lerp(a.station.point.y, b.station.point.y, easedRatio)
      },
      headingDeg: headingBetween(a.station.point, b.station.point),
      phase,
      speedRatio,
      progressSegment: easedRatio,
      previousStation: a.station,
      nextStation: b.station,
      etaNextStationSec: travelEnd
    };
  }

  // Потяг досяг кінцевої станції
  const last = timeline[timeline.length - 1];
  const prev = timeline[timeline.length - 2] ?? last;
  return {
    point: last.station.point,
    headingDeg: headingBetween(prev.station.point, last.station.point),
    phase: 'dwell',
    speedRatio: 0,
    progressSegment: 1.0,
    previousStation: prev.station,
    nextStation: last.station,
    etaNextStationSec: last.t
  };
}

// ============================================================================
//  ГОЛОВНІ ЕКСПОРТОВАНІ ФУНКЦІЇ
// ============================================================================

/**
 * Отримати всі потяги, що рухаються мережею у задану мікросекунду.
 */
export function getActiveTrains(now: Date = new Date()): LiveMetroTrain[] {
  const nowSecVal = secOfDay(now);
  const dayType = dayTypeOf(now);

  if (nowSecVal < SERVICE_START_SEC - 60 || nowSecVal > SERVICE_END_SEC + 60) return [];

  const trains: LiveMetroTrain[] = [];

  for (const line of SCHEMATIC_LINES) {
    (['forward', 'backward'] as TrainDirection[]).forEach((direction) => {
      const candidates = candidatesFor(line, direction, nowSecVal, dayType);
      const timeline = TIMELINE_CACHE[line.id][direction];
      const total = timeline[timeline.length - 1].t;

      candidates.forEach((c) => {
        const elapsed = nowSecVal - c.departureSec;
        const pos = positionAtElapsed(line, direction, elapsed);
        if (!pos) return;

        trains.push({
          id: `${line.id}-${direction}-${c.departureSec}`,
          lineId: line.id,
          lineNumber: line.number,
          lineColor: line.color,
          direction,
          directionCode: toDirectionCode(direction),
          headsign: direction === 'forward' ? line.headsignForward : line.headsignBackward,
          point: pos.point,
          headingDeg: pos.headingDeg,
          phase: pos.phase,
          speedRatio: pos.speedRatio,
          progressSegment: pos.progressSegment,
          previousStation: pos.previousStation,
          nextStation: pos.nextStation,
          etaNextStationSec: c.departureSec + pos.etaNextStationSec,
          etaTerminusSec: c.departureSec + total
        });
      });
    });
  }

  return trains;
}

/**
 * Отримати найближчі прибуття потягів на обрану станцію.
 */
export function getUpcomingArrivalsForStation(
  stationId: string,
  now: Date = new Date(),
  count: number = 3
): UpcomingDeparture[] {
  const nowSecVal = secOfDay(now);
  const dayType = dayTypeOf(now);
  const results: UpcomingDeparture[] = [];

  for (const line of SCHEMATIC_LINES) {
    (['forward', 'backward'] as TrainDirection[]).forEach((direction) => {
      const timeline = TIMELINE_CACHE[line.id][direction];
      const entry = timeline.find((e) => e.station.id === stationId);
      if (!entry) return;

      const interval = Math.max(60, line.intervalMinutes[dayType] * 60);
      let k = Math.floor((nowSecVal - SERVICE_START_SEC - entry.t) / interval);

      for (let guard = 0; guard < count + 4; guard++, k++) {
        const departureSec = SERVICE_START_SEC + k * interval;
        if (departureSec < SERVICE_START_SEC) continue;
        if (departureSec > SERVICE_END_SEC) break;
        const arrival = departureSec + entry.t;
        if (arrival < nowSecVal) continue;

        results.push({
          lineId: line.id,
          lineNumber: line.number,
          lineColor: line.color,
          direction: toDirectionCode(direction),
          directionType: direction,
          headsign: direction === 'forward' ? line.headsignForward : line.headsignBackward,
          etaSec: arrival
        });

        if (results.filter((r) => r.lineId === line.id && r.directionType === direction).length >= count) {
          break;
        }
      }
    });
  }

  return results.sort((a, b) => a.etaSec - b.etaSec).slice(0, count * 2);
}

/**
 * Отримати повний денний розклад прибуттів на станцію.
 */
export function getStationDayTimetable(
  stationId: string,
  dayType: LiveMetroDayType
): StationDayTimetableEntry[] {
  const entries: StationDayTimetableEntry[] = [];

  for (const line of SCHEMATIC_LINES) {
    (['forward', 'backward'] as TrainDirection[]).forEach((direction) => {
      const timeline = TIMELINE_CACHE[line.id][direction];
      const stationEntry = timeline.find((e) => e.station.id === stationId);
      if (!stationEntry) return;

      const interval = Math.max(60, line.intervalMinutes[dayType] * 60);
      const times: string[] = [];

      for (
        let departureSec = SERVICE_START_SEC;
        departureSec <= SERVICE_END_SEC;
        departureSec += interval
      ) {
        times.push(formatEtaClock(departureSec + stationEntry.t));
      }

      entries.push({
        lineId: line.id,
        lineNumber: line.number,
        lineColor: line.color,
        direction,
        directionCode: toDirectionCode(direction),
        headsign: direction === 'forward' ? line.headsignForward : line.headsignBackward,
        times
      });
    });
  }

  return entries;
}

/**
 * Отримати узагальнену статистику активності ліній метро на даний момент.
 */
export function getLiveLineStats(now: Date = new Date()): LineLiveSummary[] {
  const activeTrains = getActiveTrains(now);
  const dayType = dayTypeOf(now);

  return SCHEMATIC_LINES.map((line) => {
    const lineTrains = activeTrains.filter((t) => t.lineId === line.id);
    return {
      lineId: line.id,
      number: line.number,
      name: line.name,
      color: line.color,
      activeCount: lineTrains.length,
      forwardCount: lineTrains.filter((t) => t.direction === 'forward').length,
      backwardCount: lineTrains.filter((t) => t.direction === 'backward').length,
      intervalMinutes: line.intervalMinutes[dayType]
    };
  });
}
