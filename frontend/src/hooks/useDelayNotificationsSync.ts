import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { enableDelayPushSubscription, hasActivePushSubscription, syncSubscribedRoutes } from '@/lib/pushSubscription';

/**
 * Сповіщення про затримки надсилаються по маршрутах, які користувач додав
 * в обране (Favorites) — окремого екрана вибору маршрутів не заводимо, щоб
 * не дублювати вже наявний інтерфейс. Цей хук тримає список routeIds
 * у Firestore (pushSubscriptions/{uid}.routes) синхронним з обраним, поки
 * перемикач "Сповіщення про затримки" увімкнений.
 *
 * Раніше тут викликався лише syncSubscribedRoutes(), який МОВЧКИ нічого не
 * робить, якщо в Firestore ще немає документа з fcmToken. Через це
 * перемикач міг лишатись "увімкненим" (значення delayNotificationsEnabled —
 * звичайне поле localStorage/налаштувань, яке також підтягується з
 * хмарного знімка іншого пристрою через useAccountCloudSync), а реальної
 * підписки з FCM-токеном для цього браузера так ніколи й не з'являлось —
 * саме це і є "підписка є, а в Firebase її нема". Тепер хук спершу
 * перевіряє, чи є РЕАЛЬНА підписка для цього пристрою, і якщо ні —
 * намагається її створити (без запиту дозволу, якщо його раніше не
 * надавали — щоб не показувати системний діалог поза жестом користувача;
 * якщо дозволу нема чи створити не вдалось, перемикач чесно вимикається,
 * щоб UI не брехав користувачу).
 */
export function useDelayNotificationsSync() {
  const enabled = useSettingsStore((s) => s.delayNotificationsEnabled);
  const setEnabled = useSettingsStore((s) => s.setDelayNotificationsEnabled);
  const routeIds = useFavoritesStore((s) => s.routes.map((r) => r.routeId).join(','));
  const repairAttempted = useRef(false);

  useEffect(() => {
    if (!enabled) {
      repairAttempted.current = false;
      return;
    }

    const routes = routeIds ? routeIds.split(',') : [];

    void (async () => {
      const hasSub = await hasActivePushSubscription();
      if (hasSub) {
        await syncSubscribedRoutes(routes);
        return;
      }

      if (repairAttempted.current) return;
      repairAttempted.current = true;

      // Не смикаємо Notification.requestPermission() тут — це не жест
      // користувача. Якщо дозвіл уже колись надавався на цьому пристрої,
      // enableDelayPushSubscription() лише мовчки перевипустить токен
      // і запис у Firestore. Якщо ні — чесно вимикаємо перемикач: людина
      // побачить, що сповіщення вимкнені, і зможе увімкнути їх вручну
      // (тоді запит дозволу відбудеться коректно, у відповідь на клік).
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        setEnabled(false);
        return;
      }

      const ok = await enableDelayPushSubscription(routes);
      if (!ok) setEnabled(false);
    })();
  }, [enabled, routeIds, setEnabled]);
}
