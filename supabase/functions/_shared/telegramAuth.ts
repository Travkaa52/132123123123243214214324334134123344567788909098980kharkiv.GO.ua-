/**
 * supabase/functions/_shared/telegramAuth.ts
 * ---------------------------------------------------------------------------
 * Перевірка Telegram WebApp initData на кожен запит (див.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 *
 * Це і є "авторизація" в цьому бекенді: жодних окремих сесій/JWT/паролів —
 * Telegram сам підписує initData секретом бота, і ми на бекенді перевіряємо
 * підпис HMAC-SHA256 на кожен запит. Це узгоджено з тим, що фронтенд і так
 * шле initData в заголовку X-Telegram-Init-Data (frontend/api/client.ts).
 *
 * Обов'язково перевіряємо і auth_date — прострочений initData (замінений/
 * перехоплений старий) не приймається.
 */

import { ApiError } from './http.ts';

export interface TelegramAuthUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
}

const MAX_INIT_DATA_AGE_SECONDS = 86400; // 24 години — достатньо для сесії Mini App

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Перевіряє підпис initData і повертає розпарсеного користувача.
 * Кидає Error з описовим повідомленням, якщо перевірка не пройшла — виклик
 * має самостійно перетворити це на HTTP 401 (див. requireTelegramUser).
 */
export async function verifyTelegramInitData(initData: string, botToken: string): Promise<TelegramAuthUser> {
  if (!initData) throw new Error('missing_init_data');
  if (!botToken) throw new Error('server_misconfigured');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('missing_hash');
  params.delete('hash');

  const authDate = Number(params.get('auth_date') ?? '0');
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error('expired_init_data');
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));

  if (computedHash !== hash) {
    throw new Error('invalid_signature');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('missing_user');

  let user: TelegramAuthUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error('invalid_user_payload');
  }
  if (!user?.id) throw new Error('invalid_user_payload');

  return user;
}

/** Дістає й перевіряє initData із заголовка запиту. Кидає ApiError(401) при невдачі. */
export async function requireTelegramUser(req: Request): Promise<TelegramAuthUser> {
  const initData = req.headers.get('x-telegram-init-data') ?? '';
  const botToken = Deno.env.get('BOT_TOKEN') ?? '';
  try {
    return await verifyTelegramInitData(initData, botToken);
  } catch (err) {
    throw new ApiError(401, 'unauthorized', `Не вдалося перевірити Telegram-сесію (${(err as Error).message})`);
  }
}
