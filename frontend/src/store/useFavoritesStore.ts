import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import { apiClient, isBackendAvailable } from '@/api/client';
import type { FavoriteRoute, FavoriteStop } from '@/types/transport';

interface FavoritesState {
  stops: FavoriteStop[];
  routes: FavoriteRoute[];
  addStop: (stopId: string) => void;
  removeStop: (stopId: string) => void;
  addRoute: (routeId: string) => void;
  removeRoute: (routeId: string) => void;
  isStopFavorite: (stopId: string) => boolean;
  isRouteFavorite: (routeId: string) => boolean;
  /** Підтягує обране з бекенду (якщо доступний) і зливає його з локальним. Викликається один раз при старті. */
  syncFromServer: () => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      stops: [],
      routes: [],
      addStop: (stopId) => {
        set((state) => ({
          stops: state.stops.some((s) => s.stopId === stopId)
            ? state.stops
            : [...state.stops, { stopId, addedAt: new Date().toISOString() }]
        }));
        if (isBackendAvailable()) void apiClient.post('/api/favorites', { kind: 'stop', itemId: stopId });
      },
      removeStop: (stopId) => {
        set((state) => ({ stops: state.stops.filter((s) => s.stopId !== stopId) }));
        if (isBackendAvailable()) void apiClient.delete(`/api/favorites/stop/${encodeURIComponent(stopId)}`);
      },
      addRoute: (routeId) => {
        set((state) => ({
          routes: state.routes.some((r) => r.routeId === routeId)
            ? state.routes
            : [...state.routes, { routeId, addedAt: new Date().toISOString() }]
        }));
        if (isBackendAvailable()) void apiClient.post('/api/favorites', { kind: 'route', itemId: routeId });
      },
      removeRoute: (routeId) => {
        set((state) => ({ routes: state.routes.filter((r) => r.routeId !== routeId) }));
        if (isBackendAvailable()) void apiClient.delete(`/api/favorites/route/${encodeURIComponent(routeId)}`);
      },
      isStopFavorite: (stopId) => get().stops.some((s) => s.stopId === stopId),
      isRouteFavorite: (routeId) => get().routes.some((r) => r.routeId === routeId),
      syncFromServer: async () => {
        if (!isBackendAvailable()) return;
        const result = await apiClient.get<{
          favorites: { kind: 'stop' | 'route'; itemId: string; addedAt: string }[];
        }>('/api/favorites');
        if (!result) return;

        set((state) => {
          const mergedStops = new Map(state.stops.map((s) => [s.stopId, s]));
          const mergedRoutes = new Map(state.routes.map((r) => [r.routeId, r]));

          for (const fav of result.favorites) {
            if (fav.kind === 'stop' && !mergedStops.has(fav.itemId)) {
              mergedStops.set(fav.itemId, { stopId: fav.itemId, addedAt: fav.addedAt });
            }
            if (fav.kind === 'route' && !mergedRoutes.has(fav.itemId)) {
              mergedRoutes.set(fav.itemId, { routeId: fav.itemId, addedAt: fav.addedAt });
            }
          }

          return { stops: [...mergedStops.values()], routes: [...mergedRoutes.values()] };
        });
      }
    }),
    {
      name: 'kharkivgo-favorites',
      storage: safeStorage,
      partialize: (state) => ({ stops: state.stops, routes: state.routes })
    }
  )
);
