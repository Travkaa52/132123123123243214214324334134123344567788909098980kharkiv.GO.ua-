import rawSchedules from '@/assets/rozklad ryhy trolley/kharkov_trolley.json';
import rawInfo from '@/assets/rozklad ryhy trolley/kharkov_trolley_info.json';

export interface StationTimetable {
  station: string;
  workdays: string[];
  weekends: string[];
}

export interface TrolleyRouteTimetable {
  routeNumber: string;
  sourceId: string;
  stations: StationTimetable[];
}

export interface TrolleyRouteInfo {
  routeNumber: string;
  routeUrl?: string;
  path?: string;
  depot?: string;
  rollingStock?: string;
  notes?: string;
}

interface RawStationEntry {
  workdays?: unknown;
  weekends?: unknown;
}

interface RawRouteEntry {
  route_number: string;
  source_id: string;
  schedules: Record<string, RawStationEntry>;
}

interface RawInfoEntry {
  route_number: string;
  route_url?: string;
  path?: string;
  depot?: string;
  rolling_stock?: string;
  notes?: string;
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

function asTimeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && TIME_RE.test(v));
}

function normalizeRoute(entry: RawRouteEntry): TrolleyRouteTimetable {
  const stations: StationTimetable[] = [];

  for (const [stationName, val] of Object.entries(entry.schedules || {})) {
    // Джерело даних інколи має "сирі" артефакти парсингу, де ключем є час
    // замість назви зупинки — такі записи пропускаємо.
    if (TIME_RE.test(stationName.trim())) continue;

    const workdays = asTimeArray(val?.workdays);
    const weekends = asTimeArray(val?.weekends);
    if (workdays.length === 0 && weekends.length === 0) continue;

    stations.push({ station: stationName.trim(), workdays, weekends });
  }

  return {
    routeNumber: entry.route_number,
    sourceId: entry.source_id,
    stations,
  };
}

const routeList = (rawSchedules as unknown as RawRouteEntry[]).map(normalizeRoute);
const infoList = rawInfo as unknown as RawInfoEntry[];

const byNumber = new Map<string, TrolleyRouteTimetable>();
for (const r of routeList) {
  byNumber.set(r.routeNumber, r);
}

const infoByNumber = new Map<string, TrolleyRouteInfo>();
for (const i of infoList) {
  infoByNumber.set(i.route_number, {
    routeNumber: i.route_number,
    routeUrl: i.route_url,
    path: i.path,
    depot: i.depot,
    rollingStock: i.rolling_stock,
    notes: i.notes,
  });
}

export const trolleyTimetables = {
  getByRouteNumber(routeNumber: string): TrolleyRouteTimetable | undefined {
    return byNumber.get(String(routeNumber));
  },
  getInfoByRouteNumber(routeNumber: string): TrolleyRouteInfo | undefined {
    return infoByNumber.get(String(routeNumber));
  },
  hasRoute(routeNumber: string): boolean {
    return byNumber.has(String(routeNumber));
  },
  all(): TrolleyRouteTimetable[] {
    return routeList;
  },
};
