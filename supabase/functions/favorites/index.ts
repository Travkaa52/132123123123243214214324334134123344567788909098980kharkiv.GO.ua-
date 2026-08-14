/**
 * supabase/functions/favorites/index.ts
 * ---------------------------------------------------------------------------
 * GET    /favorites            — список обраного поточного користувача
 * POST   /favorites             { kind, item_id, label? } — додати
 * DELETE /favorites?kind&item_id — прибрати
 *
 * kind: 'stop' | 'route'. item_id — id зупинки/маршруту з локальних даних
 * фронтенда (frontend/data), сервер їх не валідує проти каталогу навмисно —
 * каталог живе лише на фронтенді (offline-first), бекенд лише зберігає
 * посилання по id.
 */
import { handleOptions } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, readJson, requireString, requireEnum, optionalString, ApiError } from '../_shared/http.ts';
import { requireTelegramUser } from '../_shared/telegramAuth.ts';
import { getServiceClient, ensureProfile, checkRateLimit } from '../_shared/db.ts';

const KINDS = ['stop', 'route'] as const;
const MAX_FAVORITES_PER_USER = 200;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const user = await requireTelegramUser(req);
    await checkRateLimit(`favorites:${user.id}`, { windowSeconds: 60, maxRequests: 60 });
    const client = getServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('favorites')
        .select('id, kind, item_id, label, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ favorites: data }, { origin, headers: { 'Cache-Control': 'private, max-age=15' } });
    }

    if (req.method === 'POST') {
      await ensureProfile(client, user.id);
      const body = await readJson(req);
      const kind = requireEnum((body as Record<string, unknown>).kind, 'kind', KINDS);
      const itemId = requireString((body as Record<string, unknown>).item_id, 'item_id', 128);
      const label = optionalString((body as Record<string, unknown>).label, 'label', 200);

      const { count, error: countError } = await client
        .from('favorites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_FAVORITES_PER_USER) {
        throw new ApiError(422, 'limit_reached', `Ліміт обраного — ${MAX_FAVORITES_PER_USER}`);
      }

      const { data, error } = await client
        .from('favorites')
        .upsert({ user_id: user.id, kind, item_id: itemId, label }, { onConflict: 'user_id,kind,item_id' })
        .select()
        .single();
      if (error) throw error;
      return jsonResponse({ favorite: data }, { origin, status: 201 });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const kind = requireEnum(url.searchParams.get('kind'), 'kind', KINDS);
      const itemId = requireString(url.searchParams.get('item_id'), 'item_id', 128);

      const { error } = await client
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('kind', kind)
        .eq('item_id', itemId);
      if (error) throw error;
      return jsonResponse({ ok: true }, { origin });
    }

    return jsonResponse({ error: 'method_not_allowed' }, { status: 405, origin });
  } catch (err) {
    return errorResponse(err, origin);
  }
});
