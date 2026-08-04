import { localStops } from '@/data/localData';
import type { Stop } from '@/types/transport';

/**
 * Без бекенду: дані генеруються з реальної геометрії маршрутів (src/data/routeGeometries.json) у localData.ts.
 * Інтерфейс навмисно лишився async (Promise), щоб сторінки з existing
 * loading/error станами не потребували переписування.
 */
export const stopsApi = {
  search: (query: string): Promise<Stop[]> => Promise.resolve(localStops.search(query)),
  getById: (id: string): Promise<Stop | undefined> => Promise.resolve(localStops.getById(id)),
  getNearby: (lat: number, lng: number, radiusM = 700): Promise<Stop[]> =>
    Promise.resolve(localStops.getNearby(lat, lng, radiusM)),
  getArrivals: (stopId: string) => Promise.resolve(localStops.getArrivals(stopId))
};
