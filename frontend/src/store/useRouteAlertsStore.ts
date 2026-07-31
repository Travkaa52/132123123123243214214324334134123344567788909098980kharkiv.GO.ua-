import { create } from 'zustand';
import { fetchRouteAlerts, type RouteAlert } from '@/lib/routeAlerts';

interface RouteAlertsState {
  alerts: RouteAlert[];
  lastFetchedAt: number;
  isPolling: boolean;
  refresh: () => Promise<void>;
  startPolling: () => void;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Спільний стор активних оголошень про затримку — щоб не робити окремий
 * fetch на кожній картці маршруту. Опитується раз на хвилину, поки
 * застосунок відкритий; дані публічні (без прив'язки до конкретного
 * користувача), тому кешування між сторінками безпечне.
 */
export const useRouteAlertsStore = create<RouteAlertsState>((set, get) => ({
  alerts: [],
  lastFetchedAt: 0,
  isPolling: false,
  refresh: async () => {
    const alerts = await fetchRouteAlerts();
    set({ alerts, lastFetchedAt: Date.now() });
  },
  startPolling: () => {
    if (get().isPolling) return;
    set({ isPolling: true });
    void get().refresh();
    setInterval(() => {
      void get().refresh();
    }, POLL_INTERVAL_MS);
  }
}));
