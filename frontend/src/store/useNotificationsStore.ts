import { create } from 'zustand';
import { fetchNotifications, type NotificationItem } from '@/api/notifications';

interface NotificationsState {
  items: NotificationItem[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  /** Скільки повідомлень користувач вже переглянув (для бейджа "нових" на дзвіночку). */
  lastSeenCount: number;
  fetchNotifications: () => Promise<void>;
  markAllSeen: () => void;
}

const MIN_REFRESH_INTERVAL_MS = 30_000;

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,
  lastSeenCount: 0,

  fetchNotifications: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading) return;
    if (lastFetchedAt && Date.now() - lastFetchedAt < MIN_REFRESH_INTERVAL_MS) return;

    set({ isLoading: true, error: null });
    try {
      const items = await fetchNotifications();
      if (items === null) {
        // Бекенд не налаштований (немає VITE_API_BASE_URL) або запит не вдався —
        // це не помилка користувача, просто немає що показати.
        set({ items: [], isLoading: false, lastFetchedAt: Date.now() });
        return;
      }
      set({ items, isLoading: false, lastFetchedAt: Date.now() });
    } catch {
      set({ error: 'Не вдалося завантажити сповіщення', isLoading: false, lastFetchedAt: Date.now() });
    }
  },

  markAllSeen: () => set({ lastSeenCount: get().items.length })
}));
