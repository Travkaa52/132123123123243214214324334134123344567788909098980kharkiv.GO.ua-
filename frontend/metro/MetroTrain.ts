import { MetroRoute } from '@/metro/MetroRoute';
import type { MetroTrainSnapshot } from '@/metro/types';

export interface MetroTrainContext {
  lineId: string;
  lineNumber: string;
  lineName: string;
  lineColor: string;
}

/**
 * Один конкретний рейс потяга: лінія + напрямок (MetroRoute) + момент
 * відправлення з першої станції (departureAtSec, секунд від півночі).
 *
 * MetroTrain НЕ зберігає мутабельний стан позиції — кожен виклик
 * getSnapshot(nowSec) наново обчислює точну позицію аналітично через
 * MetroRoute.sampleAtElapsed(). Це принципово: два виклики з однаковим
 * nowSec завжди дають однаковий результат, незалежно від того, скільки
 * разів і як часто його викликали раніше (жодного накопичення похибки
 * чи "дрейфу" стану, характерного для GPS-трекінгу).
 */
export class MetroTrain {
  readonly id: string;
  readonly route: MetroRoute;
  readonly departureAtSec: number;
  private readonly context: MetroTrainContext;

  constructor(route: MetroRoute, departureAtSec: number, context: MetroTrainContext) {
    this.route = route;
    this.departureAtSec = departureAtSec;
    this.context = context;
    // Детермінований id: та сама лінія + напрямок + час відправлення завжди
    // дають той самий id рейсу. Ніякого Math.random()/Date.now() тут немає.
    this.id = `${context.lineId}-${route.direction}-${departureAtSec}`;
  }

  /** Чи існує цей потяг на лінії в момент nowSec (виїхав, ще не завершив стоянку на кінцевій). */
  isActiveAt(nowSec: number): boolean {
    const elapsed = nowSec - this.departureAtSec;
    return elapsed >= 0 && elapsed <= this.route.totalActiveDurationSec;
  }

  /** Повертає повний знімок стану потяга на момент nowSec (секунд від півночі). Викликач має заздалегідь перевірити isActiveAt. */
  getSnapshot(nowSec: number): MetroTrainSnapshot {
    const elapsedSec = nowSec - this.departureAtSec;
    const sample = this.route.sampleAtElapsed(elapsedSec);

    return {
      id: this.id,
      lineId: this.context.lineId,
      lineNumber: this.context.lineNumber,
      lineName: this.context.lineName,
      lineColor: this.context.lineColor,
      direction: this.route.direction,
      headsign: this.route.headsign,
      position: sample.position,
      headingDeg: sample.headingDeg,
      speedKmh: sample.speedKmh,
      phase: sample.phase,
      progressRatio: sample.progressRatio,
      previousStation: sample.previousStation,
      nextStation: sample.nextStation,
      etaNextStationSec: this.departureAtSec + sample.nextStationOffsetSec,
      etaTerminusSec: this.departureAtSec + this.route.tripDurationSec,
      departureAtSec: this.departureAtSec
    };
  }
}
