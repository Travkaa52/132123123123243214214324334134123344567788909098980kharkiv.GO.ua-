import rawTramInfo from '@/assets/rozklad ryhy tramway/kharkov_tram_structured.json';
import { parseStopScheduleRows, type RawTableRow, type RouteTimetableData, type RouteTimetableInfo } from '@/data/timetableCommon';

/**
 * Розклад руху трамваїв Харкова — готові файли по кожній лінії
 * (assets/rozklad ryhy tramway/kharkov_transport_city_routes_*.json)
 * підключаються ОДНИМ модулем через import.meta.glob, без написання
 * окремого .ts-файлу на кожен маршрут вручну. Метадані маршруту
 * (шлях, депо, рухомий склад) — зі спільного kharkov_tram_structured.json.
 */

const scheduleModules = import.meta.glob('@/assets/rozklad ryhy tramway/kharkov_transport_city_routes_*.json', {
  eager: true
}) as Record<string, { default: RawTableRow[] }>;

interface RawInfoEntry {
  route_number: string;
  route_url?: string;
  path?: string;
  depot?: string;
  rolling_stock?: string;
  notes?: string;
}

const infoList = rawTramInfo as unknown as RawInfoEntry[];

// file_id (число з посилання .../city_routes/<id>/) -> сирі рядки розкладу цієї лінії.
const rowsByFileId = new Map<string, RawTableRow[]>();
for (const [path, mod] of Object.entries(scheduleModules)) {
  const match = path.match(/kharkov_transport_city_routes_(\d+)\.json$/);
  if (!match) continue;
  rowsByFileId.set(match[1], mod.default);
}

function extractFileId(routeUrl?: string): string | undefined {
  return routeUrl?.match(/city_routes\/(\d+)/)?.[1];
}

const usedFileIds = new Set<string>();
const routeList: RouteTimetableData[] = [];
const infoByNumber = new Map<string, RouteTimetableInfo>();
const unmatchedInfo: RawInfoEntry[] = [];

// Крок 1: пряме зіставлення по id з route_url маршруту.
for (const info of infoList) {
  infoByNumber.set(info.route_number, {
    routeNumber: info.route_number,
    routeUrl: info.route_url,
    path: info.path,
    depot: info.depot,
    rollingStock: info.rolling_stock,
    notes: info.notes
  });

  const fileId = extractFileId(info.route_url);
  if (fileId && rowsByFileId.has(fileId)) {
    usedFileIds.add(fileId);
    routeList.push({
      routeNumber: info.route_number,
      sourceId: fileId,
      stations: parseStopScheduleRows(rowsByFileId.get(fileId))
    });
  } else {
    unmatchedInfo.push(info);
  }
}

// Крок 2: файли розкладу, що лишились без прямого id-збігу (сайт-джерело
// іноді видає розклад під іншим id сторінки, ніж посилання на маршрут),
// зіставляються з маршрутами без пари по зростанню id — так само, як
// вони йдуть у першоджерелі.
const leftoverFileIds = Array.from(rowsByFileId.keys())
  .filter((id) => !usedFileIds.has(id))
  .sort((a, b) => Number(a) - Number(b));

unmatchedInfo
  .sort((a, b) => Number(extractFileId(a.route_url) ?? 0) - Number(extractFileId(b.route_url) ?? 0))
  .forEach((info, idx) => {
    const fileId = leftoverFileIds[idx];
    if (!fileId) return;
    routeList.push({
      routeNumber: info.route_number,
      sourceId: fileId,
      stations: parseStopScheduleRows(rowsByFileId.get(fileId))
    });
  });

const byNumber = new Map<string, RouteTimetableData>();
for (const r of routeList) {
  byNumber.set(r.routeNumber, r);
}

export const tramTimetables = {
  getByRouteNumber(routeNumber: string): RouteTimetableData | undefined {
    return byNumber.get(String(routeNumber));
  },
  getInfoByRouteNumber(routeNumber: string): RouteTimetableInfo | undefined {
    return infoByNumber.get(String(routeNumber));
  },
  hasRoute(routeNumber: string): boolean {
    return byNumber.has(String(routeNumber));
  },
  all(): RouteTimetableData[] {
    return routeList;
  }
};
