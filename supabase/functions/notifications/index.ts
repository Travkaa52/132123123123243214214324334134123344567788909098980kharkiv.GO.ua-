/**
 * supabase/functions/notifications/index.ts
 * ---------------------------------------------------------------------------
 * GET  /notifications        — активні route_alerts (публічні, ті самі, що
 *                               anon міг би прочитати напряму з PostgREST —
 *                               тут лише додає кешування, rate-limit і,
 *                               якщо передано X-Telegram-Init-Data, позначку
 *                               read/unread для конкретного користувача).
 * POST /notifications/read    { notification_id } — позначити прочитаним
 *                               (вимагає авторизації).
 *
 * Примітка: стрічка новин каналів (frontend/api/notifications.ts) лишається
 * окремим статичним data/notifications.json від GitHub Actions — той
 * контент не персоналізований і бекенду не потребує, тут — лише
 * транспортні route_alerts, які й вимагають персонального read-стану.
 */
import { handleOptions } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, readJson, requireString } from '../_shared/http.ts';
import { verifyTelegramInitData } from '../_shared/telegramAuth.ts';
import { requireTelegramUser } from '../_shared/telegramAuth.ts';
import { getServiceClient, checkRateLimit } from '../_shared/db.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);

  try {
    if (req.method === 'GET' && url.pathname.endsWith('/notifications')) {
      const client = getServiceClient();
      const nowSeconds = Date.now() / 1000;

      const { data: alerts, error } = await client
        .from('route_alerts')
        .select('id, kind, route_number, message, created_at, expires_at, source')
        .gt('expires_at', nowSeconds)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      // initData тут опційна: анонімний перегляд стрічки дозволений (це ті
      // самі публічні дані, що й у route_alerts RLS-policy), read-стан
      // додається тільки якщо підпис валідний.
      let readIds = new Set<string>();
      const initData = req.headers.get('x-telegram-init-data');
      if (initData) {
        try {
          const user = await verifyTelegramInitData(initData, Deno.env.get('BOT_TOKEN') ?? '');
          await checkRateLimit(`notifications:${user.id}`, { windowSeconds: 60, maxRequests: 60 });
          const { data: reads } = await client
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', user.id);
          readIds = new Set((reads ?? []).map((r) => r.notification_id));
        } catch {
          // Невалідний initData на публічному GET-і — просто ігноруємо read-стан,
          // не блокуємо перегляд самої стрічки.
        }
      } else {
        await checkRateLimit(`notifications:anon:${req.headers.get('cf-connecting-ip') ?? 'unknown'}`, {
          windowSeconds: 60,
          maxRequests: 30
        });
      }

      const items = (alerts ?? []).map((a) => ({ ...a, read: readIds.has(String(a.id)) }));

      return jsonResponse(
        { notifications: items },
        { origin, headers: { 'Cache-Control': 'public, max-age=20, stale-while-revalidate=40' } }
      );
    }

    if (req.method === 'POST' && url.pathname.endsWith('/notifications/read')) {
      const user = await requireTelegramUser(req);
      await checkRateLimit(`notifications:read:${user.id}`, { windowSeconds: 60, maxRequests: 60 });
      const body = await readJson(req);
      const notificationId = requireString((body as Record<string, unknown>).notification_id, 'notification_id', 64);

      const client = getServiceClient();
      const { error: profileError } = await client
        .from('profiles')
        .upsert({ telegram_id: user.id, last_seen_at: new Date().toISOString() }, { onConflict: 'telegram_id' });
      if (profileError) throw profileError;

      const { error } = await client
        .from('notification_reads')
        .upsert({ user_id: user.id, notification_id: notificationId }, { onConflict: 'user_id,notification_id' });
      if (error) throw error;

      return jsonResponse({ ok: true }, { origin });
    }

    return jsonResponse({ error: 'not_found' }, { status: 404, origin });
  } catch (err) {
    return errorResponse(err, origin);
  }
});
