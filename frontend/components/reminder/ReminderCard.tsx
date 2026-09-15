import { useEffect, useState } from 'react';
import { Trash2, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { Card, Switch, IconButton } from '@/components/ui';
import { TransportKindIcon } from '@/components/TransportKindIcon';
import { localRoutes } from '@/data/localData';
import { computeLeavePlan, formatClock, formatMinutesUntil, isReminderInWindow } from '@/lib/reminderEngine';
import { useReminderStore } from '@/store/useReminderStore';
import type { SmartReminder } from '@/types/reminder';

interface ReminderCardProps {
  reminder: SmartReminder;
}

const DAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function ReminderCard({ reminder }: ReminderCardProps) {
  const toggleReminder = useReminderStore((s) => s.toggleReminder);
  const removeReminder = useReminderStore((s) => s.removeReminder);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const route = localRoutes.getById(reminder.routeId);
  const inWindow = isReminderInWindow(reminder, now);
  const plan = reminder.enabled && inWindow ? computeLeavePlan(reminder, now) : null;
  const isLate = plan ? plan.minutesUntilLeave <= reminder.leadMinutes : false;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink-text">{reminder.title}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-muted">
            <MapPin size={11} className="shrink-0" />
            {reminder.home.label} → {reminder.destination.label}
          </p>
        </div>
        <Switch checked={reminder.enabled} onChange={() => toggleReminder(reminder.id)} label="Увімкнути нагадування" />
      </div>

      {route && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2">
          <span
            className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white"
            style={{ backgroundColor: route.color }}
          >
            {route.number}
          </span>
          <TransportKindIcon kind={route.kind} size={14} />
          <span className="truncate text-xs font-medium text-ink-text">{route.headsignForward}</span>
        </div>
      )}

      {reminder.enabled ? (
        plan ? (
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
              isLate ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'
            }`}
          >
            {isLate ? <AlertTriangle size={14} className="shrink-0" /> : <Clock size={14} className="shrink-0" />}
            <span>
              {isLate ? 'Час виходити зараз' : `Виходити через ${formatMinutesUntil(plan.minutesUntilLeave)}`} · рейс о{' '}
              {formatClock(plan.departure.departsAt)}
            </span>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-soft px-3 py-2 text-xs text-ink-muted">
            {inWindow ? 'Найближчого рейсу зараз немає в розкладі' : 'Поза активним вікном часу'}
          </p>
        )
      ) : (
        <p className="rounded-xl bg-surface-soft px-3 py-2 text-xs text-ink-muted">Нагадування вимкнено</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {DAY_LABELS.map((label, day) => (
            <span
              key={day}
              className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                reminder.activeDays.includes(day) ? 'bg-primary/15 text-primary' : 'text-ink-muted/40'
              }`}
            >
              {label[0]}
            </span>
          ))}
        </div>
        <IconButton size="sm" aria-label="Видалити нагадування" onClick={() => removeReminder(reminder.id)}>
          <Trash2 size={16} className="text-red-500" />
        </IconButton>
      </div>
    </Card>
  );
}
