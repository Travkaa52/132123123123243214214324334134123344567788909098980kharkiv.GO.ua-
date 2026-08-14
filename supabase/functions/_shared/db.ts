/**
 * supabase/functions/_shared/db.ts
 * ---------------------------------------------------------------------------
 * Supabase-клієнт на service_role для Edge Functions (той самий підхід, що
 * вже використовує bot/supabase_sync.py — service_role обходить RLS, тому
 * авторизація виконується в коді функції через requireTelegramUser(), а не
 * через Postgres policy).
 *
 * service_role ключ живе ЛИШЕ в secrets Edge Functions (supabase secrets set),
 * ніколи не потрапляє у фронтенд/git.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ApiError } from './http.ts';

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new ApiError(500, 'server_misconfigured', 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY не задані');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Гарантує, що рядок profiles існує для цього telegram_id — favorites/history
 * мають FK на profiles, а фронтенд може викликати /favorites раніше, ніж
 * встигне відпрацювати окремий виклик /profile (наприклад, паралельні
 * запити при старті застосунку). Дешевий upsert без зміни вже наявних полів.
 */
export async function ensureProfile(client: ReturnType<typeof getServiceClient>, telegramId: number): Promise<void> {
  const { error } = await client
    .from('profiles')
    .upsert({ telegram_id: telegramId, last_seen_at: new Date().toISOString() }, { onConflict: 'telegram_id', ignoreDuplicates: false });
  if (error) throw error;
}

/**
 * Fixed-window rate limit через Postgres RPC rate_limit_hit (див. migrations/0002).
 * Один спільний лічильник на всі інстанси функції — на відміну від
 * in-memory-мапи, яка обнулялась би на кожен холодний старт/інстанс.
 */
export async function checkRateLimit(
  bucketKey: string,
  opts: { windowSeconds: number; maxRequests: number }
): Promise<void> {
  const client = getServiceClient();
  const { data, error } = await client.rpc('rate_limit_hit', {
    p_key: bucketKey,
    p_window_seconds: opts.windowSeconds,
    p_max_requests: opts.maxRequests
  });
  if (error) {
    // Rate-limit не повинен класти основну функціональність, якщо RPC впав —
    // логуємо і пропускаємо запит.
    console.error('rate_limit_hit failed', error);
    return;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    throw new ApiError(429, 'rate_limited', 'Забагато запитів, спробуйте, будь ласка, трохи пізніше');
  }
}
