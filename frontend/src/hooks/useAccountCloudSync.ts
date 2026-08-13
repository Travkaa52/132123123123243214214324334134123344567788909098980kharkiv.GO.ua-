import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useReminderStore } from '@/store/useReminderStore';
import { pullAccountSnapshot, pushAccountSnapshot } from '@/lib/accountSync';
import type { SearchHistoryEntry } from '@/types/transport';

function mergeUnique<T>(primary: T[], secondary: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of primary) map.set(keyFn(item), item);
  for (const item of secondary) if (!map.has(keyFn(item))) map.set(keyFn(item), item);
  return Array.from(map.values());
}

const PUSH_DEBOUNCE_MS = 1500;

/**
 * Двонаправлена синхронізація обраного/історії/налаштувань/нагадувань з
 * Firestore, поки до профілю прив'язано email/Google акаунт (firebaseUid).
 *
 *  1. Одразу після прив'язки/входу — підтягує хмарний знімок і зливає його
 *     з тим, що вже є на цьому пристрої (нічого не губиться в обидва боки).
 *     Саме це дозволяє відкрити той самий акаунт у Telegram Mini App і
 *     потім у встановленій PWA (чи навпаки) й побачити ті самі дані.
 *  2. Поки акаунт прив'язаний — будь-яка локальна зміна (нова закладка,
 *     новий пункт історії, зміна теми, нове нагадування) з невеликою
 *     затримкою (debounce) пишеться назад у Firestore, щоб інші пристрої
 *     з тим самим акаунтом теж змогли підхопити зміну при наступному вході.
 *
 * Монтується один раз у App.tsx (як useThemeSync/useDepartureReminder).
 */
export function useAccountCloudSync() {
  const firebaseUid = useAuthStore((s) => s.profile?.firebaseUid);
  const pulledForUid = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseUid || pulledForUid.current === firebaseUid) return;
    pulledForUid.current = firebaseUid;

    let cancelled = false;

    (async () => {
      const snapshot = await pullAccountSnapshot(firebaseUid);
      if (!snapshot || cancelled) return;

      if (snapshot.favorites) {
        const cloud = snapshot.favorites;
        useFavoritesStore.setState((state) => ({
          stops: mergeUnique(state.stops, cloud.stops, (s) => s.stopId),
          routes: mergeUnique(state.routes, cloud.routes, (r) => r.routeId)
        }));
      }

      if (snapshot.history) {
        const cloudHistory = snapshot.history;
        useHistoryStore.setState((state) => {
          const merged = mergeUnique<SearchHistoryEntry>(state.entries, cloudHistory, (e) => e.id);
          merged.sort((a, b) => (a.searchedAt < b.searchedAt ? 1 : -1));
          return { entries: merged.slice(0, 30) };
        });
      }

      if (snapshot.settings) {
        useSettingsStore.setState((state) => ({ ...state, ...snapshot.settings }));
      }

      if (snapshot.reminders) {
        const cloudReminders = snapshot.reminders;
        useReminderStore.setState((state) => ({
          reminders: mergeUnique(state.reminders, cloudReminders, (r) => r.id)
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUid]);

  useEffect(() => {
    if (!firebaseUid) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const schedulePush = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        const { theme, mapStyle, units, language, visibleTransportKinds, showStopsOnMap, is3DMode, delayNotificationsEnabled } =
          useSettingsStore.getState();
        void pushAccountSnapshot(firebaseUid, {
          favorites: {
            stops: useFavoritesStore.getState().stops,
            routes: useFavoritesStore.getState().routes
          },
          history: useHistoryStore.getState().entries,
          settings: { theme, mapStyle, units, language, visibleTransportKinds, showStopsOnMap, is3DMode, delayNotificationsEnabled },
          reminders: useReminderStore.getState().reminders
        });
      }, PUSH_DEBOUNCE_MS);
    };

    const unsubFavorites = useFavoritesStore.subscribe(schedulePush);
    const unsubHistory = useHistoryStore.subscribe(schedulePush);
    const unsubSettings = useSettingsStore.subscribe(schedulePush);
    const unsubReminders = useReminderStore.subscribe(schedulePush);

    // Початковий пуш одразу після прив'язки акаунту (щоб хмара не була
    // порожньою до першої наступної зміни).
    schedulePush();

    return () => {
      if (timeout) clearTimeout(timeout);
      unsubFavorites();
      unsubHistory();
      unsubSettings();
      unsubReminders();
    };
  }, [firebaseUid]);
}
