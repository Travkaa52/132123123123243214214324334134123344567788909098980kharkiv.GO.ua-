/**
 * supabase/functions/profile/index.ts
 * ---------------------------------------------------------------------------
 * GET /profile — перевіряє Telegram initData, upsert-ить профіль
 * (created/updated/last_seen_at) і повертає його. Це і є "вхід" у систему:
 * фронтенд викликає це один раз при старті, після чого просто продовжує
 * слати той самий X-Telegram-Init-Data з кожним запитом до інших функцій —
 * жодного окремого токена/сесії зберігати не треба.
 */
import { handleOptions } from '../_shared/cors.ts';
import { jsonResponse, errorResponse } from '../_shared/http.ts';
import { requireTelegramUser } from '../_shared/telegramAuth.ts';
import { getServiceClient, checkRateLimit } from '../_shared/db.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, { status: 405, origin });
    }

    const user = await requireTelegramUser(req);
    await checkRateLimit(`profile:${user.id}`, { windowSeconds: 60, maxRequests: 30 });

    const client = getServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('profiles')
      .upsert(
        {
          telegram_id: user.id,
          username: user.username ?? null,
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          photo_url: user.photo_url ?? null,
          language_code: user.language_code ?? null,
          updated_at: now,
          last_seen_at: now
        },
        { onConflict: 'telegram_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return jsonResponse({ profile: data }, { origin });
  } catch (err) {
    return errorResponse(err, origin);
  }
});
