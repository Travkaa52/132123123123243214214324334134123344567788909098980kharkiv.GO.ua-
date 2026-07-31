import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toast: ToastItem | null;
  show: (message: string, tone?: ToastTone) => void;
  dismiss: () => void;
}

let nextId = 1;

/**
 * Єдина точка показу коротких повідомлень у застосунку. Раніше багато дій
 * (очистити кеш, скопіювати посилання, перевірити оновлення тощо)
 * використовували браузерний window.alert() — блокуючий, немодний і не в
 * стилі застосунку. Тепер усі такі підтвердження йдуть через один toast
 * у дизайн-системі (glass-surface), що не блокує UI.
 */
export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (message, tone = 'info') => set({ toast: { id: nextId++, message, tone } }),
  dismiss: () => set({ toast: null })
}));
