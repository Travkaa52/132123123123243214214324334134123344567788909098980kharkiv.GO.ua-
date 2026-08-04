import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'kharkiv-go:hint-seen:';

/**
 * Стан однієї підказки-помічника ("Натисніть сюди, щоб...") — показуємо її
 * лише поки користувач сам не торкнеться кнопки або не закриє підказку,
 * і більше не показуємо на цьому пристрої (localStorage), щоб не набридати
 * після першого разу.
 */
export function useHint(key: string) {
  const storageKey = STORAGE_PREFIX + key;
  const [seen, setSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    setSeen(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* localStorage недоступний (приватний режим тощо) — не критично */
    }
  }, [storageKey]);

  return { visible: !seen, dismiss };
}
