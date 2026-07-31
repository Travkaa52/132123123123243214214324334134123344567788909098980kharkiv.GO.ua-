/**
 * Мінімальна типізація Telegram Web App SDK (https://core.telegram.org/bots/webapps).
 * Підключається у index.html через <script src="https://telegram.org/js/telegram-web-app.js">.
 * Ми навмисно НЕ довіряємо initDataUnsafe для серверної перевірки (бекенду немає) —
 * профіль використовується лише для відображення (ім'я, фото), без "серйозної" авторизації.
 */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  version: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation?: () => void;
  HapticFeedback?: { impactOccurred: (style: string) => void; notificationOccurred?: (type: string) => void };
  openTelegramLink?: (url: string) => void;
  close: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  /** Показує системний діалог "Додати на головний екран" (Bot API 8.0+, Telegram 7.x+). */
  addToHomeScreen?: () => void;
  /** Просить клієнт Telegram повідомити поточний стан ярлика через подію 'homeScreenChecked'. */
  checkHomeScreenStatus?: (callback?: (status: HomeScreenStatus) => void) => void;
  onEvent: (eventType: TelegramWebAppEvent, callback: (...args: any[]) => void) => void;
  offEvent: (eventType: TelegramWebAppEvent, callback: (...args: any[]) => void) => void;
}

/**
 * Стан ярлика застосунку на головному екрані пристрою:
 * - unsupported — клієнт Telegram/ОС не підтримує цю функцію взагалі
 * - unknown     — клієнт підтримує, але точно сказати не може (частіше на iOS)
 * - added       — ярлик вже створено
 * - missed      — користувач раніше закрив діалог, не додавши ярлик
 */
export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'missed';

type TelegramWebAppEvent = 'homeScreenAdded' | 'homeScreenChecked' | (string & {});

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function isInsideTelegram(): boolean {
  return !!getTelegramWebApp()?.initData;
}

export function getTelegramUser(): TelegramUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

/**
 * Чи підтримує поточний клієнт Telegram створення ярлика на головному екрані.
 * Метод з'явився у Bot API 8.0 — на старих версіях клієнта Telegram
 * (і, відповідно, WebApp.version < "8.0") функції addToHomeScreen /
 * checkHomeScreenStatus в об'єкті просто відсутні.
 */
export function isHomeScreenShortcutSupported(): boolean {
  const tg = getTelegramWebApp();
  if (!tg) return false;
  if (typeof tg.addToHomeScreen !== 'function' || typeof tg.checkHomeScreenStatus !== 'function') return false;
  if (typeof tg.isVersionAtLeast === 'function') return tg.isVersionAtLeast('8.0');
  return true;
}

/** Запитати клієнт Telegram, чи вже додано ярлик, через подію 'homeScreenChecked'. */
export function requestHomeScreenStatus(callback: (status: HomeScreenStatus) => void) {
  const tg = getTelegramWebApp();
  if (!tg || !isHomeScreenShortcutSupported()) {
    callback('unsupported');
    return;
  }
  let settled = false;
  const handleChecked = (status: HomeScreenStatus) => {
    if (settled) return;
    settled = true;
    tg.offEvent('homeScreenChecked', handleChecked);
    callback(status);
  };
  tg.onEvent('homeScreenChecked', handleChecked);
  // Деякі версії клієнта одразу повертають статус і в callback-аргументі
  // checkHomeScreenStatus, і через подію — обробляємо обидва варіанти,
  // але подія прибирається одразу після першого спрацювання (offEvent вище),
  // тож дублю не станеться.
  tg.checkHomeScreenStatus?.((status) => handleChecked(status));
}

/**
 * Показати системний діалог Telegram "Додати ярлик на головний екран".
 * onAdded викликається один раз, якщо користувач підтвердив додавання
 * (подія 'homeScreenAdded'); якщо просто закрив діалог — подія не прийде.
 */
export function addAppToHomeScreen(onAdded?: () => void) {
  const tg = getTelegramWebApp();
  if (!tg?.addToHomeScreen) return;
  if (onAdded) {
    const handleAdded = () => {
      tg.offEvent('homeScreenAdded', handleAdded);
      onAdded();
    };
    tg.onEvent('homeScreenAdded', handleAdded);
  }
  tg.addToHomeScreen();
}

/** Викликати один раз при старті застосунку. */
export function initTelegramApp() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#05522E');
    tg.setBackgroundColor('#F4F7F5');
  } catch {
    // деякі клієнти Telegram не підтримують кастомізацію кольорів — не критично
  }
}
