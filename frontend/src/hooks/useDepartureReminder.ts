import { useEffect } from 'react';
import { useReminderStore } from '@/store/useReminderStore';
import { useToastStore } from '@/store/useToastStore';
import { computeLeavePlan, formatClock, isReminderInWindow } from '@/lib/reminderEngine';
import { getPushPermissionState } from '@/lib/pushPermission';
import type { LeaveTimePlan } from '@/types/reminder';

const CHECK_INTERVAL_MS = 20_000;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sendNativeNotification(title: string, body: string) {
  if (getPushPermissionState() !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'kharkivgo-departure-reminder', icon: '/icons/kharkiv-metro-logo.png' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Глобальний "будильник" розумних нагадувань про вихід. Живе на рівні App
 * (монтується один раз) і кожні ~20с перераховує для кожного увімкненого
 * нагадування актуальний план поїздки: якщо користувач запізнюється до
 * попереднього рейсу, наступний прохід сам підхопить наступний рейс
 * (computeLeavePlan рахує ETA від "зараз", а не від колись обраного часу).
 *
 * Сам дозвіл на push запитується не тут, а в момент збереження нагадування
 * (ReminderFormSheet) — у межах жесту користувача. Тут лише читаємо
 * поточний стан дозволу.
 */
export function useDepartureReminder() {
  const reminders = useReminderStore((s) => s.reminders);
  const markFired = useReminderStore((s) => s.markFired);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    function tick() {
      const now = new Date();

      for (const reminder of reminders) {
        if (!isReminderInWindow(reminder, now)) continue;

        // Не дублюємо нагадування, якщо воно вже спрацювало сьогодні.
        if (reminder.lastFiredAt && isSameDay(new Date(reminder.lastFiredAt), now)) continue;

        const plan: LeaveTimePlan | null = computeLeavePlan(reminder, now);
        if (!plan) continue;

        // Спрацьовує у вікні [leadMinutes до "виходь", момент "виходь"] —
        // тобто попереджає заздалегідь і не пропускає момент, якщо таймер
        // прокинувся рідше, ніж раз на хвилину.
        if (plan.minutesUntilLeave <= reminder.leadMinutes && plan.minutesUntilLeave >= -1) {
          const body =
            plan.minutesUntilLeave <= 0
              ? `Виходьте зараз — рейс №${reminder.routeId} відправляється о ${formatClock(plan.departure.departsAt)} з «${reminder.home.stopName}»`
              : `Через ${plan.minutesUntilLeave} хв — щоб встигнути на рейс о ${formatClock(plan.departure.departsAt)} з «${reminder.home.stopName}»`;

          const delivered = sendNativeNotification(`⏰ ${reminder.title}: час виходити`, body);
          if (!delivered) showToast(`⏰ ${reminder.title}: ${body}`, 'info');

          markFired(reminder.id, now.toISOString());
        }
      }
    }

    tick();
    const interval = window.setInterval(tick, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [reminders, markFired, showToast]);
}
