import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * -----------------------------------------------------------------------
 * НАДІЙНЕ ЛОКАЛЬНЕ СХОВИЩЕ (для всіх persist-store'ів застосунку)
 * -----------------------------------------------------------------------
 * Усі персональні дані користувача — нагадування про вихід, обране,
 * історія пошуку, налаштування, профіль — зберігаються ЛОКАЛЬНО на
 * пристрої (localStorage), без жодного бекенду. Кожен користувач має
 * власну, повністю ізольовану копію даних у своєму браузері/пристрої.
 *
 * localStorage може бути недоступний або впасти (приватний режим Safari
 * на iOS, вимкнені cookies/сховище, вичерпана квота, storage у деяких
 * WebView Telegram Mini App тощо). Раніше в такому випадку `persist()`
 * просто мовчки нічого не зберігав — і, найгірше, ловив необроблений
 * виняток, що могло зламати рендер сторінки. Тепер:
 *
 *  1. Перед кожним записом перевіряємо доступність localStorage.
 *  2. Якщо він недоступний (або кинув виняток — напр. QuotaExceededError) —
 *     прозоро переключаємось на резервне сховище в пам'яті (Map). Дані
 *     живуть, поки відкрита вкладка, замість повної втрати функціоналу.
 *  3. Жодна помилка збереження ніколи не "вилітає" назовні й не ламає UI.
 */

let cachedAvailability: boolean | null = null;

function isLocalStorageAvailable(): boolean {
  if (cachedAvailability !== null) return cachedAvailability;
  try {
    const testKey = '__kharkivgo_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    cachedAvailability = true;
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

// Резервне сховище в пам'яті — використовується, тільки якщо localStorage
// справді недоступний. Дані в ньому переживають лише поточну сесію вкладки.
const memoryFallback = new Map<string, string>();

const safeStateStorage: StateStorage = {
  getItem: (name) => {
    if (isLocalStorageAvailable()) {
      try {
        return window.localStorage.getItem(name);
      } catch {
        cachedAvailability = false;
      }
    }
    return memoryFallback.get(name) ?? null;
  },
  setItem: (name, value) => {
    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.setItem(name, value);
        return;
      } catch {
        // Квота вичерпана або сховище заблоковане в процесі роботи —
        // не втрачаємо дані, а переносимо їх у резервну пам'ять.
        cachedAvailability = false;
      }
    }
    memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    try {
      if (isLocalStorageAvailable()) window.localStorage.removeItem(name);
    } catch {
      // ігноруємо — головне прибрати з резервного сховища нижче
    }
    memoryFallback.delete(name);
  }
};

/** Готовий JSON-storage для передачі в `persist(..., { storage: safeStorage })`. */
export const safeStorage = createJSONStorage(() => safeStateStorage);
