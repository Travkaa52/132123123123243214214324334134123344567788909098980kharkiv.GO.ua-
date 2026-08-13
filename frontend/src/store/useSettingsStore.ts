import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import type { AppSettings } from '@/types/user';
import type { TransportKind } from '@/types/transport';

const ALL_KINDS: TransportKind[] = ['metro', 'tram', 'trolleybus', 'bus'];

interface SettingsState extends AppSettings {
  setTheme: (theme: AppSettings['theme']) => void;
  setMapStyle: (style: AppSettings['mapStyle']) => void;
  setLanguage: (lang: AppSettings['language']) => void;
  setUnits: (units: AppSettings['units']) => void;
  togglePushNotifications: () => void;
  setDelayNotificationsEnabled: (enabled: boolean) => void;
  /** Очищає всі локальні кеші застосунку (обране/історію не чіпає — тільки службові дані). */
  clearCache: () => Promise<void>;
  /** Панель керування шарами карти: увімкнути/вимкнути показ виду транспорту. */
  toggleTransportKind: (kind: TransportKind) => void;
  /** Показати всі види транспорту одночасно. */
  showAllTransportKinds: () => void;
  toggleStopsOnMap: () => void;
  toggle3DMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      mapStyle: 'night',
      units: 'metric',
      pushNotificationsEnabled: false,
      delayNotificationsEnabled: false,
      language: 'uk',
      visibleTransportKinds: ALL_KINDS,
      showStopsOnMap: true,
      is3DMode: true,
      // Зміна теми одразу підлаштовує стиль карти (день/ніч) — так перемикач
      // теми в Налаштуваннях виглядає як єдина, цілісна дія, а не два окремих
      // перемикачі, які треба узгоджувати вручну.
      setTheme: (theme) =>
        set({
          theme,
          mapStyle:
            theme === 'light' ||
            (theme === 'auto' &&
              typeof window !== 'undefined' &&
              window.matchMedia?.('(prefers-color-scheme: dark)').matches === false)
              ? 'day'
              : 'night'
        }),
      setMapStyle: (mapStyle) => set({ mapStyle }),
      setLanguage: (language) => set({ language }),
      setUnits: (units) => set({ units }),
      togglePushNotifications: () => set((state) => ({ pushNotificationsEnabled: !state.pushNotificationsEnabled })),
      setDelayNotificationsEnabled: (enabled) => set({ delayNotificationsEnabled: enabled }),
      clearCache: async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }
        } catch {
          // ignore — Cache API може бути недоступний поза Service Worker контекстом
        }
      },
      toggleTransportKind: (kind) =>
        set((state) => {
          const isVisible = state.visibleTransportKinds.includes(kind);
          const next = isVisible
            ? state.visibleTransportKinds.filter((k) => k !== kind)
            : [...state.visibleTransportKinds, kind];
          // Хоча б один вид транспорту завжди лишається увімкненим.
          return next.length > 0 ? { visibleTransportKinds: next } : state;
        }),
      showAllTransportKinds: () => set({ visibleTransportKinds: ALL_KINDS }),
      toggleStopsOnMap: () => set((state) => ({ showStopsOnMap: !state.showStopsOnMap })),
      toggle3DMode: () => set((state) => ({ is3DMode: !state.is3DMode }))
    }),
    { name: 'kharkivgo-settings', storage: safeStorage }
  )
);
