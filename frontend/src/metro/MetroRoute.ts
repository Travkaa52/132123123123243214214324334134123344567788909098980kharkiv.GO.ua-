import {
  bearingDegrees,
  bezierQuadraticPoint,
  bezierQuadraticTangent,
  clamp01,
  easeInOutCubic,
  easeInOutCubicDerivative,
  haversineMeters,
  lerpPoint,
  toDeg
} from '@/metro/geometry';
import { MetroSchedule } from '@/metro/MetroSchedule';
import { MetroStation } from '@/metro/MetroStation';
import type { GeoPoint } from '@/types/transport';
import type { MetroDirection, MetroLineJson, MetroRouteSegment, MetroTrainPhase } from '@/metro/types';

/** Знімок кінематики потяга ВІДНОСНО початку рейсу (без прив'язки до конкретного дня/годинника — цим займається MetroTrain). */
export interface MetroRouteSample {
  position: GeoPoint;
  headingDeg: number;
  speedKmh: number;
  phase: MetroTrainPhase;
  progressRatio: number;
  segmentIndex: number;
  previousStation: MetroStation;
  nextStation: MetroStation;
  /** Офсет (секунди від початку рейсу) прибуття потяга на nextStation. */
  nextStationOffsetSec: number;
}

/** Частка тривалості перегону (від початку руху), яка вважається фазою розгону/гальмування — лише для мітки phase у знімку, на фізику руху не впливає (easing застосовується по всьому перегону). */
const ACCEL_PHASE_FRACTION = 0.18;
const BRAKE_PHASE_FRACTION = 0.82;

/**
 * Напрямок (маршрут) лінії метро: впорядкований список станцій + геометрія
 * перегонів (пряма лінія або квадратична крива Без'є, якщо в даних лінії
 * є контрольна точка) + точна часова розкладка з MetroSchedule.
 *
 * Це єдине місце, де відбувається аналітичний розрахунок позиції потяга —
 * чиста функція `sampleAtElapsed(elapsedSec)`: той самий вхід завжди дає
 * той самий вихід, без сторонніх ефектів, без GPS, без випадковості.
 */
export class MetroRoute {
  readonly direction: MetroDirection;
  readonly headsign: string;
  readonly stations: MetroStation[];
  readonly schedule: MetroSchedule;
  readonly tripDurationSec: number;
  readonly terminalDwellSec: number;

  private readonly segments: MetroRouteSegment[];

  constructor(line: MetroLineJson, stationsForward: MetroStation[], direction: MetroDirection) {
    this.direction = direction;
    this.headsign = direction === 'forward' ? line.headsignForward : line.headsignBackward;
    this.stations = direction === 'forward' ? stationsForward : [...stationsForward].reverse();

    if (this.stations.length < 2) {
      throw new Error(`MetroRoute: лінія "${line.id}" (${direction}) повинна мати щонайменше 2 станції`);
    }

    const scheduleForDirection =
      direction === 'forward'
        ? line.schedule
        : buildReversedSchedule(line.schedule, this.stations);

    this.schedule = new MetroSchedule(line, scheduleForDirection);
    this.tripDurationSec = this.schedule.tripDurationSec;

    this.segments = buildSegments(this.stations, this.schedule, line, direction);
    this.terminalDwellSec = this.segments[this.segments.length - 1].dwellAtArrivalSec;
  }

  /** Повна тривалість "існування" рейсу — рух + стоянка на кінцевій станції перед тим, як потяг зникає з лінії. */
  get totalActiveDurationSec(): number {
    return this.tripDurationSec + this.terminalDwellSec;
  }

  /**
   * Обчислює кінематичний стан потяга через `elapsedSec` секунд після
   * відправлення з першої станції цього напрямку.
   * Викликач (MetroTrain) відповідає за перевірку, що elapsedSec
   * знаходиться в межах [0, totalActiveDurationSec] — тут ми лише клемпимо
   * межі, щоб не впасти на неправильному вводі.
   */
  sampleAtElapsed(elapsedSec: number): MetroRouteSample {
    const clampedElapsed = Math.max(0, Math.min(elapsedSec, this.totalActiveDurationSec));

    let segmentIndex = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const windowEnd = seg.arrivalOffsetSec + seg.dwellAtArrivalSec;
      if (clampedElapsed <= windowEnd || i === this.segments.length - 1) {
        segmentIndex = i;
        break;
      }
    }

    const segment = this.segments[segmentIndex];
    const elapsedInSegment = clampedElapsed - segment.departureOffsetSec;
    const cruiseDurationSec = Math.max(1, segment.arrivalOffsetSec - segment.departureOffsetSec);

    if (elapsedInSegment >= cruiseDurationSec) {
      // Потяг вже прибув на toStation і стоїть (dwell) — незалежно від того,
      // чи це проміжна станція, чи кінцева.
      const heading = headingForSegment(segment);
      return {
        position: segment.toStation.position,
        headingDeg: heading,
        speedKmh: 0,
        phase: 'dwell',
        progressRatio: clamp01(clampedElapsed / this.tripDurationSec),
        segmentIndex,
        previousStation: segment.fromStation,
        nextStation: segment.toStation,
        nextStationOffsetSec: segment.arrivalOffsetSec
      };
    }

    const t = clamp01(elapsedInSegment / cruiseDurationSec);
    const easedT = easeInOutCubic(t);

    const position = segment.controlPoint
      ? bezierQuadraticPoint(segment.fromStation.position, segment.controlPoint, segment.toStation.position, easedT)
      : lerpPoint(segment.fromStation.position, segment.toStation.position, easedT);

    const heading = segment.controlPoint
      ? headingFromTangent(bezierQuadraticTangent(segment.fromStation.position, segment.controlPoint, segment.toStation.position, easedT))
      : headingForSegment(segment);

    // Миттєва швидкість: похідна eased-позиції по реальному часу, помножена
    // на довжину перегону — дає плавний "розгін -> крейсерська -> гальмування"
    // профіль швидкості замість стрибка від 0 до максимуму.
    const easedDerivative = easeInOutCubicDerivative(t);
    const speedMetersPerSec = (segment.distanceMeters * easedDerivative) / cruiseDurationSec;
    const speedKmh = speedMetersPerSec * 3.6;

    const phase: MetroTrainPhase = t < ACCEL_PHASE_FRACTION ? 'accelerating' : t > BRAKE_PHASE_FRACTION ? 'braking' : 'cruising';

    return {
      position,
      headingDeg: heading,
      speedKmh,
      phase,
      progressRatio: clamp01(clampedElapsed / this.tripDurationSec),
      segmentIndex,
      previousStation: segment.fromStation,
      nextStation: segment.toStation,
      nextStationOffsetSec: segment.arrivalOffsetSec
    };
  }
}

function headingForSegment(segment: MetroRouteSegment): number {
  return bearingDegrees(segment.fromStation.position, segment.toStation.position);
}

function headingFromTangent(tangent: GeoPoint): number {
  // Дотична у "географічних" одиницях (lat=Y, lng=X) — переводимо у стандартний азимут (0°=північ, за годинниковою).
  const angle = (toDeg(Math.atan2(tangent.lng, tangent.lat)) + 360) % 360;
  return angle;
}

/**
 * Для зворотного напрямку офіційний розклад (schedule) описує лише прямий
 * рейс. Реконструюємо часову розкладку зворотного рейсу дзеркальним
 * відображенням офсетів відносно тривалості прямого рейсу — це не вигадка
 * "з нуля", а детермінований перерахунок наявних даних (той самий перегін
 * в іншу сторону за той самий час, як і заявлено в TransportRoute.schedule
 * прямого напрямку).
 */
function buildReversedSchedule(
  forwardSchedule: MetroLineJson['schedule'],
  reversedStations: MetroStation[]
): MetroLineJson['schedule'] {
  const tripDurationSec = forwardSchedule[forwardSchedule.length - 1].arrivalOffsetSec;
  const offsetByStopId = new Map(forwardSchedule.map((e) => [e.stopId, e]));

  return reversedStations.map((station) => {
    const forwardEntry = offsetByStopId.get(station.id);
    if (!forwardEntry) {
      throw new Error(`MetroRoute: станція "${station.id}" відсутня у прямому розкладі лінії — дані несумісні`);
    }
    return {
      stopId: station.id,
      arrivalOffsetSec: tripDurationSec - forwardEntry.arrivalOffsetSec,
      dwellSec: forwardEntry.dwellSec
    };
  });
}

function buildSegments(
  stations: MetroStation[],
  schedule: MetroSchedule,
  line: MetroLineJson,
  direction: MetroDirection
): MetroRouteSegment[] {
  const segments: MetroRouteSegment[] = [];

  for (let i = 0; i < stations.length - 1; i++) {
    const fromStation = stations[i];
    const toStation = stations[i + 1];

    const fromTiming = schedule.stationTiming.get(fromStation.id);
    const toTiming = schedule.stationTiming.get(toStation.id);
    if (!fromTiming || !toTiming) {
      throw new Error(
        `MetroRoute: розклад не містить офсету для станції "${!fromTiming ? fromStation.id : toStation.id}" (лінія "${line.id}", напрямок ${direction})`
      );
    }

    const departureOffsetSec = i === 0 ? 0 : fromTiming.arrivalOffsetSec + fromTiming.dwellSec;
    const arrivalOffsetSec = toTiming.arrivalOffsetSec;

    segments.push({
      fromStation,
      toStation,
      controlPoint: findControlPoint(line, fromStation.id, toStation.id),
      departureOffsetSec,
      arrivalOffsetSec,
      dwellAtArrivalSec: toTiming.dwellSec,
      distanceMeters: haversineMeters(fromStation.position, toStation.position)
    });
  }

  return segments;
}

function findControlPoint(line: MetroLineJson, stationAId: string, stationBId: string): GeoPoint | undefined {
  if (!line.curves) return undefined;
  const match = line.curves.find(
    (c) => (c.fromStopId === stationAId && c.toStopId === stationBId) || (c.fromStopId === stationBId && c.toStopId === stationAId)
  );
  return match?.controlPoint;
}
