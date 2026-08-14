/**
 * supabase/functions/history/index.ts
 * ---------------------------------------------------------------------------
 * GET    /history           — останні перегляди (найновіші перші, макс. 50)
 * POST   /history             { kind, item_id, label? } — записати перегляд
 * DELETE /history              — очистити всю історію користувача
 *
 * Історія автоматично обрізається до 50 останніх записів на користувача
 * (public.trim_history, migrations/0002) — без окремого cron/TTL.
 */
import { handleOptions } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, readJson, requireString, requireEnum, optionalString } from '../_shared/http.ts';
import { requireTelegramUser } from '../_shared/telegramAuth.ts';
import { getServiceClient, ensureProfile, checkRateLimit } from '../_shared/db.ts';

const KINDS = ['stop', 'route', 'trip'] as const;
const HISTORY_LIMIT = 50;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await requireTelegramUser(req);
    await checkRateLimit(`history:${user.id}`, { windowSeconds: 60, maxRequests: 60 });
    const client = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('history')
        .select('id, kind, item_id, label, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return jsonResponse({ history: data }, { origin, headers: { 'Cache-Control': 'private, max-age=15' } });
    }

    if (req.method === 'POST') {
      await ensureProfile(client, user.id);
      const body = await readJson(req);
      const kind = requireEnum((body as Record<string, unknown>).kind, 'kind', KINDS);
      const itemId = requireString((body as Record<string, unknown>).item_id, 'item_id', 128);
      const label = optionalString((body as Record<string, unknown>).label, 'label', 200);

      const { data, error } = await client
        .from('history')
        .insert({ user_id: user.id, kind, item_id: itemId, label })
        .select()
        .single();
      if (error) throw error;

      const { error: trimError } = await client.rpc('trim_history', { p_user_id: user.id, p_keep: HISTORY_LIMIT });
      if (trimError) console.error('trim_history failed', trimError);

      return jsonResponse({ history: data }, { origin, status: 201 });
    }

    if (req.method === 'DELETE') {
      const { error } = await client.from('history').delete().eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ ok: true }, { origin });
    }

    return jsonResponse({ error: 'method_not_allowed' }, { status: 405, origin });
  } catch (err) {
    return errorResponse(err, origin);
  }
});
