import { useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { syncSubscribedRoutes } from '@/lib/pushSubscription';

/**
 * Сповіщення про затримки надсилаються по маршрутах, які користувач додав
 * в обране (Favorites) — окремого екрана вибору маршрутів не заводимо, щоб
 * не дублювати вже наявний інтерфейс. Цей хук лише тримає список routeIds
 * у Firestore (pushSubscriptions/{uid}.routes) синхронним з обраним, поки
 * перемикач "Сповіщення про затримки" увімкнений; сам перемикач і перше
 * увімкнення підписки — у SettingsPage.
 */
export function useDelayNotificationsSync() {
  const enabled = useSettingsStore((s) => s.delayNotificationsEnabled);
  const routeIds = useFavoritesStore((s) => s.routes.map((r) => r.routeId).join(','));

  useEffect(() => {
    if (!enabled) return;
    void syncSubscribedRoutes(routeIds ? routeIds.split(',') : []);
  }, [enabled, routeIds]);
}
