/**
 * Єдине місце, звідки застосунок бере username Telegram-бота.
 *
 * Раніше він читався напряму з VITE_TELEGRAM_BOT_USERNAME у трьох різних
 * файлах (reportDelay.ts, support.ts, TelegramGate.tsx) — і якщо цю змінну
 * не налаштували в GitHub Actions (Settings → Secrets and variables →
 * Actions → Variables → TELEGRAM_BOT_USERNAME), збірка виходила без
 * значення, лінк ставав https://t.me/undefined, і Telegram чесно казав
 * "такого акаунта не існує".
 *
 * Тепер тут прописаний реальний бот застосунку як fallback за
 * замовчуванням — працює "з коробки" навіть без жодного налаштування
 * секретів/змінних у репозиторії. Змінна оточення, якщо задана, і далі
 * має пріоритет (зручно для форків/тестових ботів).
 */

// Актуальний бот Kharkiv GO: https://t.me/kharkiv_transpot_go_bot
const DEFAULT_BOT_USERNAME = 'kharkiv_transpot_go_bot';

function normalize(username: string): string {
  return username.trim().replace(/^@/, '');
}

export const BOT_USERNAME: string = normalize(
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME
);

export const BOT_APP_NAME: string | undefined = import.meta.env.VITE_TELEGRAM_APP_NAME;
