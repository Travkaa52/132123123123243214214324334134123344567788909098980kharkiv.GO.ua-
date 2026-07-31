import type { GeoPoint, TransportRoute } from '@/types/transport';
import type { MetroStation } from '@/metro/MetroStation';

/**
 * Напрямок руху вздовж лінії метро.
 * forward  — від першої станції stopIds до останньої (headsignForward).
 * backward — у зворотному порядку (headsignBackward).
 */
export type MetroDirection = 'forward' | 'backward';

/** Тип доби для розкладу: будній день (Пн-Пт) чи вихідний (Сб-Нд) — впливає лише на базовий інтервал руху. */
export type MetroDayType = 'weekday' | 'weekend';

/** Фаза руху потяга на поточному перегоні/зупинці — використовується і для рендеру, і для розрахунку швидкості. */
export type MetroTrainPhase = 'dwell' | 'accelerating' | 'cruising' | 'braking';

/**
 * "Сирі" дані станції — беруться з stops.json (@see Stop). Тут навмисно
 * лишається лише те, що потрібно движку симуляції, без UI-полів.
 */
export interface MetroStationData {
  id: string;
  name: string;
  position: GeoPoint;
  isAccessible?: boolean;
}

/**
 * Розширення TransportRoute (routes.json) для метро. Усі нові поля —
 * ОПЦІОНАЛЬНІ надбудови над існуючою схемою даних: якщо їх немає в JSON,
 * движок використовує розумні детерміновані значення за замовчуванням
 * (не випадкові — константи), тож існуючі дані продовжують працювати
 * без міграції.
 */
export interface MetroLineScheduleEntry {
  stopId: string;
  /** Секунди від відправлення з першої станції рейсу до прибуття на цю станцію. */
  arrivalOffsetSec: number;
  /**
   * Час стоянки на станції, секунд. Якщо не задано в даних — MetroSchedule
   * використовує DEFAULT_DWELL_SEC (константа, не випадкове число).
   */
  dwellSec?: number;
}

/**
 * Опціональна контрольна точка кривої Без'є для перегону between stopA -> stopB
 * (плавний вигин колії замість прямої лінії). Якщо для перегону немає запису —
 * MetroRoute використовує пряму лінію (lerpPoint), нічого не вигадуючи.
 */
export interface MetroSegmentCurve {
  fromStopId: string;
  toStopId: string;
  controlPoint: GeoPoint;
}

export interface MetroLineJson extends TransportRoute {
  kind: 'metro';
  /** Перевизначення розкладу з опціональним dwellSec на станцію. Якщо відсутнє — використовується TransportRoute.schedule. */
  schedule: MetroLineScheduleEntry[];
  /** Опціональні контрольні точки для плавних вигинів колії (Bezier). */
  curves?: MetroSegmentCurve[];
  /**
   * Опціональний точний перелік часу відправлень (якщо в реальному розкладі
   * рейси не рівномірні). Якщо задано — MetroSchedule ігнорує будь-які
   * інтервали (weekday/weekend/пікові) і використовує ЛИШЕ цей список. Формат "HH:MM".
   */
  explicitDepartures?: string[];
  /**
   * Інтервал руху у будній день (Пн-Пт), хвилин. Якщо не задано —
   * використовується базове поле `intervalMinutes`.
   */
  intervalMinutesWeekday?: number;
  /**
   * Інтервал руху у вихідний день (Сб-Нд), хвилин. Якщо не задано —
   * використовується базове поле `intervalMinutes`.
   */
  intervalMinutesWeekend?: number;
  /**
   * Інтервал руху може відрізнятись у різні періоди доби (напр. годинапік
   * частіше). Якщо задано — має пріоритет над одним сталим intervalMinutes
   * (застосовується поверх weekday-розкладу; у вихідні пікові періоди
   * зазвичай не діють, тому вони застосовуються лише до weekday-варіанту).
   * Періоди не повинні перетинатись; поза заданими періодами використовується
   * intervalMinutesWeekday/intervalMinutes.
   */
  peakIntervals?: { fromTime: string; toTime: string; intervalMinutes: number }[];
}

/** Один сегмент маршруту (перегін між сусідніми станціями) з готовою геометрією та часовою розкладкою. */
export interface MetroRouteSegment {
  fromStation: MetroStation;
  toStation: MetroStation;
  /** Контрольна точка Без'є для цього перегону, якщо задана в даних лінії. */
  controlPoint?: GeoPoint;
  /** Секунда відправлення з fromStation (від початку рейсу). */
  departureOffsetSec: number;
  /** Секунда прибуття на toStation (від початку рейсу), ДО стоянки на toStation. */
  arrivalOffsetSec: number;
  /** Тривалість стоянки на toStation, секунд. */
  dwellAtArrivalSec: number;
  distanceMeters: number;
}

/** Публічний, готовий до рендеру знімок стану одного потяга в конкретний момент часу. */
export interface MetroTrainSnapshot {
  /** Стабільний id рейсу: детермінований з id лінії, напрямку й часу відправлення — НЕ випадковий. */
  id: string;
  lineId: string;
  lineNumber: string;
  lineName: string;
  lineColor: string;
  direction: MetroDirection;
  headsign: string;
  position: GeoPoint;
  headingDeg: number;
  speedKmh: number;
  phase: MetroTrainPhase;
  /** Частка пройденого шляху за весь рейс, 0..1. */
  progressRatio: number;
  previousStation: MetroStationData;
  nextStation: MetroStationData;
  /** Розрахунковий час прибуття на наступну станцію, секунд від півночі. */
  etaNextStationSec: number;
  /** Розрахунковий час прибуття на кінцеву станцію рейсу, секунд від півночі. */
  etaTerminusSec: number;
  /** Час відправлення цього рейсу з початкової станції, секунд від півночі. */
  departureAtSec: number;
}
