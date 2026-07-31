/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_STYLE_DAY_URL?: string;
  readonly VITE_MAP_STYLE_NIGHT_URL?: string;
  /** Username бота без @, напр. "kharkivgo_bot" — для кнопки на екрані TelegramGate. */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  /** Назва Mini App, задана через BotFather /newapp, напр. "app". */
  readonly VITE_TELEGRAM_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
