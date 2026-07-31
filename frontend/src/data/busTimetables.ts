import rawBusSchedules from '@/assets/rozklad ryhy avtobus/all_routes_avtobus.json';
import { parseStopScheduleRows, type RawTableRow, type RouteTimetableData, type RouteTimetableInfo } from '@/data/timetableCommon';

/**
 * Розклад руху автобусів Харкова — ОДИН готовий спільний файл на всі
 * маршрути (assets/rozklad ryhy avtobus/all_routes_avtobus.json,
 * ключ об'єкта = номер маршруту), без окремого файлу під кожен
 * маршрут — так само, як trolleyTimetables.ts підключає тролейбуси.
 */

type RawBusData = Record<string, RawTableRow[]>;

const raw = rawBusSchedules as unknown as RawBusData;

const routeList: RouteTimetableData[] = Object.entries(raw).map(([routeNumber, rows]) => ({
  routeNumber,
  sourceId: routeNumber,
  stations: parseStopScheduleRows(rows)
}));

const byNumber = new Map<string, RouteTimetableData>();
for (const r of routeList) {
  byNumber.set(r.routeNumber, r);
}

export const busTimetables = {
  getByRouteNumber(routeNumber: string): RouteTimetableData | undefined {
    return byNumber.get(String(routeNumber));
  },
  // Спільний файл автобусів не містить метаданих (шлях/депо/рухомий
  // склад) на відміну від тролейбусного та трамвайного джерел.
  getInfoByRouteNumber(_routeNumber: string): RouteTimetableInfo | undefined {
    return undefined;
  },
  hasRoute(routeNumber: string): boolean {
    return byNumber.has(String(routeNumber));
  },
  all(): RouteTimetableData[] {
    return routeList;
  }
};
