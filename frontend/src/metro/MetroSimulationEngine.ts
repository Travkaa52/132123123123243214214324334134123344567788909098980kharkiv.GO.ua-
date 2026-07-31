import { secondsSinceMidnight } from '@/metro/geometry';
import { MetroLine, type MetroStationLookup } from '@/metro/MetroLine';
import type { MetroDayType, MetroLineJson, MetroTrainSnapshot } from '@/metro/types';
import type { TransportRoute } from '@/types/transport';

export interface MetroSimulationEngineOptions {
  /** Усі маршрути (routes.json) — движок сам відфільтрує kind === 'metro'. */
  routes: TransportRoute[];
  /** Пошук станції за id (зазвичай localStops.getById). */
  stationLookup: MetroStationLookup;
}

/** Будній день (Пн-Пт) чи вихідний (Сб-Нд) за календарем — саме дата, а не випадковість чи припущення, визначає тип доби. */
function dayTypeOf(date: Date): MetroDayType {
  const day = date.getDay(); // 0 = неділя, 6 = субота
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

/**
 * Головний рушій симуляції Харківського метрополітену.
 *
 * Принципи роботи (без винятків):
 *  1. Жодного GPS — єдиний вхід рушія це "яка зараз секунда доби" (Date).
 *  2. Жодної випадковості — той самий момент часу завжди дає той самий
 *     набір потягів у тих самих координатах.
 *  3. Розклад НЕ генерується "на льоту": він один раз читається з
 *     routes.json при побудові MetroLine і далі лише фільтрується за часом.
 *  4. Потяг існує на лінії, лише якщо станом на поточний момент він уже
 *     виїхав за розкладом і ще не завершив стоянку на кінцевій станції.
 *
 * Використання:
 *   const engine = new MetroSimulationEngine({ routes, stationLookup });
 *   const trains = engine.getSnapshotAt(new Date());
 */
export class MetroSimulationEngine {
  readonly lines: MetroLine[];

  constructor(options: MetroSimulationEngineOptions) {
    const metroLines = options.routes.filter((r): r is MetroLineJson => r.kind === 'metro');

    if (metroLines.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('MetroSimulationEngine: у routes.json не знайдено жодного маршруту kind="metro".');
    }

    this.lines = metroLines.map((line) => new MetroLine(line, options.stationLookup));
  }

  /** Знімки всіх активних потягів на конкретний момент часу (Date — локальний час пристрою користувача). */
  getSnapshotAt(date: Date): MetroTrainSnapshot[] {
    const nowSec = secondsSinceMidnight(date);
    const dayType = dayTypeOf(date);
    const snapshots: MetroTrainSnapshot[] = [];

    for (const line of this.lines) {
      for (const train of line.getActiveTrains(nowSec, dayType)) {
        snapshots.push(train.getSnapshot(nowSec));
      }
    }

    return snapshots;
  }

  /** Знайти лінію за id (наприклад, для панелі керування шарами чи деталей маршруту). */
  getLineById(lineId: string): MetroLine | undefined {
    return this.lines.find((l) => l.id === lineId);
  }
}
