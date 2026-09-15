import { useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import { Sheet, Button } from '@/components/ui';
import { StopSearchField } from '@/components/reminder/StopSearchField';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { buildTripOptions } from '@/data/localData';
import type { StopItem, TripOption } from '@/data/localData';
import { useReminderStore } from '@/store/useReminderStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import { DEFAULT_WALK_SPEED_KMH } from '@/lib/reminderEngine';
import { ensurePushPermission } from '@/lib/pushPermission';

interface ReminderFormSheetProps {
  open: boolean;
  onClose: () => void;
}

const DAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const WALK_SPEED_PRESETS: { label: string; value: number }[] = [
  { label: 'Повільно', value: 3.5 },
  { label: 'Звичайно', value: DEFAULT_WALK_SPEED_KMH },
  { label: 'Швидко', value: 5.5 }
];

export function ReminderFormSheet({ open, onClose }: ReminderFormSheetProps) {
  const addReminder = useReminderStore((s) => s.addReminder);
  const pushEnabled = useSettingsStore((s) => s.pushNotificationsEnabled);
  const togglePush = useSettingsStore((s) => s.togglePushNotifications);
  const showToast = useToastStore((s) => s.show);

  const [title, setTitle] = useState('');
  const [home, setHome] = useState<StopItem | null>(null);
  const [destination, setDestination] = useState<StopItem | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [leadMinutes, setLeadMinutes] = useState(10);
  const [walkSpeedKmh, setWalkSpeedKmh] = useState(DEFAULT_WALK_SPEED_KMH);
  const [activeDays, setActiveDays] = useState<number[]>(WEEKDAYS);
  const [windowStart, setWindowStart] = useState('06:30');
  const [windowEnd, setWindowEnd] = useState('22:00');

  const options: TripOption[] = useMemo(() => {
    if (!home || !destination) return [];
    return buildTripOptions(home.position.lat, home.position.lng, destination.position.lat, destination.position.lng, 4);
  }, [home, destination]);

  function toggleDay(day: number) {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function reset() {
    setTitle('');
    setHome(null);
    setDestination(null);
    setSelectedOptionIndex(0);
    setLeadMinutes(10);
    setWalkSpeedKmh(DEFAULT_WALK_SPEED_KMH);
    setActiveDays(WEEKDAYS);
    setWindowStart('06:30');
    setWindowEnd('22:00');
  }

  async function handleSave() {
    const chosen = options[selectedOptionIndex];
    if (!home || !destination || !chosen) {
      showToast('Оберіть дім, пункт призначення та маршрут', 'error');
      return;
    }

    addReminder({
      title: title.trim() || `${home.name} → ${destination.name}`,
      home: {
        label: home.name,
        position: home.position,
        stopId: chosen.boardStop.id,
        stopName: chosen.boardStop.name,
        walkDistanceM: chosen.boardDistanceM
      },
      destination: {
        label: destination.name,
        position: destination.position,
        stopId: chosen.alightStop.id,
        stopName: chosen.alightStop.name,
        walkDistanceM: chosen.alightDistanceM
      },
      routeId: chosen.route.id,
      leadMinutes,
      walkSpeedKmh,
      activeDays: activeDays.length > 0 ? activeDays : ALL_DAYS,
      windowStart,
      windowEnd
    });

    // Запит дозволу на push — рівно в момент збереження нагадування, у межах
    // жесту користувача (клік по кнопці), інакше браузер діалог не покаже.
    const permission = await ensurePushPermission();
    if (permission === 'granted') {
      if (!pushEnabled) togglePush();
      showToast('Нагадування збережено. Push-сповіщення увімкнено 🔔', 'success');
    } else if (permission === 'denied') {
      showToast('Нагадування збережено. Push заблоковано — покажемо сповіщення в застосунку', 'info');
    } else {
      showToast('Нагадування збережено', 'success');
    }

    reset();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Нове нагадування про вихід"
    >
      <div className="space-y-4 pb-2">
        <div className="space-y-1.5">
          <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Назва</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Напр. «На роботу»"
            className="w-full rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-sm text-ink-text placeholder:text-ink-muted/60 focus:outline-none"
          />
        </div>

        <StopSearchField label="Дім (звідки)" placeholder="Вулиця або зупинка поруч з домом" value={home} onSelect={setHome} />
        <StopSearchField
          label="Куди"
          placeholder="Вулиця або зупинка призначення"
          value={destination}
          onSelect={setDestination}
        />

        {home && destination && options.length === 0 && (
          <p className="rounded-xl bg-surface-soft px-3 py-2.5 text-xs text-ink-muted">
            Прямих маршрутів поруч не знайдено — спробуйте інші точки.
          </p>
        )}

        {options.length > 0 && (
          <div className="space-y-1.5">
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Маршрут</label>
            <div className="space-y-1.5">
              {options.map((option, index) => (
                <button
                  key={`${option.route.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedOptionIndex(index)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    index === selectedOptionIndex
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border/50 bg-surface-soft hover:bg-surface-raised'
                  }`}
                >
                  <span
                    className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white"
                    style={{ backgroundColor: option.route.color }}
                  >
                    {option.route.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-xs font-semibold text-ink-text">
                      <TransportKindIcon kind={option.route.kind} size={13} />
                      {KIND_LABELS_UK[option.route.kind]} · {option.route.headsignForward}
                    </span>
                    <span className="block truncate text-[11px] text-ink-muted">
                      Посадка: {option.boardStop.name} ({Math.round(option.boardDistanceM)} м пішки)
                    </span>
                  </span>
                  {index === selectedOptionIndex && <Repeat size={14} className="shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Попередити за, хв
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={leadMinutes}
              onChange={(e) => setLeadMinutes(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-sm text-ink-text focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Темп ходьби</label>
            <select
              value={walkSpeedKmh}
              onChange={(e) => setWalkSpeedKmh(Number(e.target.value))}
              className="w-full rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-sm text-ink-text focus:outline-none"
            >
              {WALK_SPEED_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Активне з</label>
            <input
              type="time"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-sm text-ink-text focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">до</label>
            <input
              type="time"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-sm text-ink-text focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Дні тижня</label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-9 flex-1 rounded-lg text-xs font-bold transition-colors ${
                  activeDays.includes(day)
                    ? 'bg-primary text-white'
                    : 'bg-surface-soft text-ink-muted hover:bg-surface-raised'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button fullWidth size="lg" onClick={handleSave}>
          Зберегти нагадування
        </Button>
      </div>
    </Sheet>
  );
}
