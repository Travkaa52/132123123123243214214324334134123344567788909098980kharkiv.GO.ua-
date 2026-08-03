/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_MAP_STYLE_DAY_URL?: string;
  readonly VITE_MAP_STYLE_NIGHT_URL?: string;
  /** Username бота без @, напр. "kharkivgo_bot" — для кнопки на екрані TelegramGate. */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  /** Назва Mini App, задана через BotFather /newapp, напр. "app". */
  readonly VITE_TELEGRAM_APP_NAME?: string;
  /** URL проєкту Supabase (Project Settings → Data API), напр. https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Публічний anon-ключ Supabase (Project Settings → API Keys) — НЕ service_role. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Перевизначення URL резервного статичного route-alerts.json, якщо потрібно. */
  readonly VITE_ROUTE_ALERTS_URL?: string;
  readonly VITE_NOTIFICATIONS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
