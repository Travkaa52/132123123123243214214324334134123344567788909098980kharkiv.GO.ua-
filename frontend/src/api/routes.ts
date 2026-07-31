import { localRoutes } from '@/data/localData';
import type { TransportKind, TransportRoute } from '@/types/transport';

/**
 * Без бекенду: дані генеруються з реальної геометрії маршрутів (src/data/routeGeometries.json) у localData.ts.
 */
export const routesApi = {
  search: (query: string): Promise<TransportRoute[]> => Promise.resolve(localRoutes.search(query)),
  getById: (id: string): Promise<TransportRoute | undefined> => Promise.resolve(localRoutes.getById(id)),
  getByKind: (kind: TransportKind): Promise<TransportRoute[]> => Promise.resolve(localRoutes.getByKind(kind)),
  buildTrip: (fromLat: number, fromLng: number, toLat: number, toLng: number) =>
    localRoutes.buildTrip(fromLat, fromLng, toLat, toLng)
};
