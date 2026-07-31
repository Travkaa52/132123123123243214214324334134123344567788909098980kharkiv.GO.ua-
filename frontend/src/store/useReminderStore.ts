import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import { DEFAULT_WALK_SPEED_KMH } from '@/lib/reminderEngine';
import type { ReminderPoint, SmartReminder } from '@/types/reminder';

interface ReminderState {
  reminders: SmartReminder[];
  addReminder: (input: {
    title: string;
    home: ReminderPoint;
    destination: ReminderPoint;
    routeId: string;
    leadMinutes: number;
    walkSpeedKmh?: number;
    activeDays: number[];
    windowStart: string;
    windowEnd: string;
  }) => string;
  updateReminder: (id: string, patch: Partial<Omit<SmartReminder, 'id' | 'createdAt'>>) => void;
  removeReminder: (id: string) => void;
  toggleReminder: (id: string) => void;
  markFired: (id: string, atIso: string) => void;
}

function makeId(): string {
  return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],

      addReminder: (input) => {
        const id = makeId();
        const reminder: SmartReminder = {
          id,
          title: input.title,
          home: input.home,
          destination: input.destination,
          routeId: input.routeId,
          leadMinutes: input.leadMinutes,
          walkSpeedKmh: input.walkSpeedKmh ?? DEFAULT_WALK_SPEED_KMH,
          activeDays: input.activeDays.length > 0 ? input.activeDays : ALL_DAYS,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          enabled: true,
          createdAt: new Date().toISOString(),
          lastFiredAt: null
        };
        set({ reminders: [reminder, ...get().reminders] });
        return id;
      },

      updateReminder: (id, patch) =>
        set({
          reminders: get().reminders.map((r) => (r.id === id ? { ...r, ...patch } : r))
        }),

      removeReminder: (id) => set({ reminders: get().reminders.filter((r) => r.id !== id) }),

      toggleReminder: (id) =>
        set({
          reminders: get().reminders.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
        }),

      markFired: (id, atIso) =>
        set({
          reminders: get().reminders.map((r) => (r.id === id ? { ...r, lastFiredAt: atIso } : r))
        })
    }),
    { name: 'kharkivgo-smart-reminders', storage: safeStorage, version: 1 }
  )
);
