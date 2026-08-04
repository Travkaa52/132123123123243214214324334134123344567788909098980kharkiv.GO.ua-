import { useCallback, useEffect, useState } from 'react';
import {
  addAppToHomeScreen,
  isHomeScreenShortcutSupported,
  isInsideTelegram,
  requestHomeScreenStatus,
  type HomeScreenStatus
} from '@/lib/telegram';

interface UseHomeScreenShortcutResult {
  /** Чи взагалі варто показувати блок про ярлик (усередині Telegram і клієнт це підтримує). */
  isSupported: boolean;
  /** Поточний відомий стан ярлика (null — ще не встигли перевірити). */
  status: HomeScreenStatus | null;
  /** Чи триває зараз запит статусу до Telegram. */
  isChecking: boolean;
  /** Показати системний діалог створення ярлика. */
  createShortcut: () => void;
  /** Чи щойно (у цій сесії) користувач підтвердив додавання — для короткого success-стану в UI. */
  justAdded: boolean;
}

/**
 * Обгортка над WebApp.addToHomeScreen / checkHomeScreenStatus з Telegram Bot
 * API 8.0+ — дозволяє застосунку самому запропонувати користувачу створити
 * ярлик на головному екрані пристрою (без ручних інструкцій "відкрийте меню
 * браузера і оберіть..."), і показати, чи ярлик вже є.
 */
export function useHomeScreenShortcut(): UseHomeScreenShortcutResult {
  const [isSupported] = useState(() => isHomeScreenShortcutSupported());
  const [status, setStatus] = useState<HomeScreenStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    setIsChecking(true);
    requestHomeScreenStatus((s) => {
      setStatus(s);
      setIsChecking(false);
    });
  }, [isSupported]);

  const createShortcut = useCallback(() => {
    if (!isInsideTelegram() || !isSupported) return;
    addAppToHomeScreen(() => {
      setStatus('added');
      setJustAdded(true);
    });
  }, [isSupported]);

  return { isSupported, status, isChecking, createShortcut, justAdded };
}
