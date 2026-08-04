import { useEffect, useState } from 'react';
import { isInsideTelegram } from '@/lib/telegram';

export type TelegramEnvironmentStatus = 'checking' | 'inside' | 'outside';

/** Скільки часу чекаємо на асинхронне завантаження telegram-web-app.js, перш ніж вважати, що ми не в Telegram. */
const DETECTION_TIMEOUT_MS = 1200;
const POLL_INTERVAL_MS = 100;

/**
 * Визначає, чи застосунок відкритий усередині Telegram WebApp.
 * Основний інтерфейс НЕ повинен монтуватися, доки статус не стане
 * 'inside' або 'outside' — це навмисно проміжний стан 'checking',
 * бо скрипт telegram-web-app.js вантажиться асинхронно і window.Telegram
 * може зʼявитися на кілька десятків мс пізніше першого рендеру.
 */
export function useTelegramEnvironment(): TelegramEnvironmentStatus {
  const [status, setStatus] = useState<TelegramEnvironmentStatus>(() => (isInsideTelegram() ? 'inside' : 'checking'));

  useEffect(() => {
    if (status === 'inside') return;

    if (isInsideTelegram()) {
      setStatus('inside');
      return;
    }

    let elapsed = 0;
    const poll = window.setInterval(() => {
      elapsed += POLL_INTERVAL_MS;
      if (isInsideTelegram()) {
        setStatus('inside');
        window.clearInterval(poll);
        return;
      }
      if (elapsed >= DETECTION_TIMEOUT_MS) {
        setStatus('outside');
        window.clearInterval(poll);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
