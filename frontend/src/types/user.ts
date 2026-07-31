/**
 * Профіль користувача без бекенду: підтягується напряму з Telegram Web App
 * (initDataUnsafe.user), коли застосунок відкрито як Telegram Mini App.
 * Жодного пароля/токена немає — "автентифікація" це просто наявність
 * telegramId, довіряти їй для серйозних дій (платежі тощо) не можна
 * без серверної перевірки initData.
 */
export interface UserProfile {
  /**
   * Для Telegram-профілів — справжній telegramId. Для користувачів, що
   * зареєструвалися вручну (поза Telegram), генерується локальний
   * псевдо-id (від'ємне число), аби решта коду, що очікує число, не ламалась.
   */
  telegramId: number;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  languageCode?: string;
  createdAt: string;
  /** true, якщо профіль створено вручну через форму реєстрації, а не підтягнуто з Telegram. */
  isLocal?: boolean;
  /** Емодзі-аватар, обраний користувачем при локальній реєстрації (коли фото немає). */
  avatarEmoji?: string;
  /** Телефон/контакт, вказаний користувачем при реєстрації (необов'язково). */
  contact?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'amoled' | 'auto';
  mapStyle: 'day' | 'night';
  units: 'metric' | 'imperial';
  pushNotificationsEnabled: boolean;
  language: 'uk' | 'en';
  /** Які види транспорту показувати на карті (лінії маршрутів + рух метро). */
  visibleTransportKinds: import('./transport').TransportKind[];
  /** Показувати шар зупинок на карті. */
  showStopsOnMap: boolean;
  /** Режим відображення карти: об'ємні будівлі (3D) чи плаский вигляд (2D). */
  is3DMode: boolean;
}
