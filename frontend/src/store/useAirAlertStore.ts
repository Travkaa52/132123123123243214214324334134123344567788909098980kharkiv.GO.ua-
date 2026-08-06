import { create } from 'zustand';
import { fetchAirAlertStatus } from '@/lib/airAlert';

interface AirAlertState {
  isAlert: boolean;
  changedAt: string | null;
  lastFetchedAt: number;
  isPolling: boolean;
  refresh: () => Promise<void>;
  startPolling: () => void;
}

// Тривоги міняються швидко (часто менш ніж за хвилину), тож опитуємо
// частіше, ніж інші фонові дані застосунку — раз на 30 секунд.
const POLL_INTERVAL_MS = 30_000;

/**
 * Спільний стор статусу повітряної тривоги для Харкова — щоб не робити
 * окремий fetch на кожній сторінці (Карта/Головна/Маршрути), які всі
 * показують той самий банер. Опитується раз на 30с, поки застосунок
 * відкритий.
 */
export const useAirAlertStore = create<AirAlertState>((set, get) => ({
  isAlert: false,
  changedAt: null,
  lastFetchedAt: 0,
  isPolling: false,
  refresh: async () => {
    const status = await fetchAirAlertStatus();
    if (status === null) return; // мережева помилка — лишаємо попередній стан
    set({ isAlert: status.isAlert, changedAt: status.changedAt, lastFetchedAt: Date.now() });
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
