/**
 * scripts/supabaseSync.mjs
 * ---------------------------------------------------------------------------
 * Те саме, що bot/supabase_sync.py, але для GitHub Actions-версії бота
 * (process-telegram-bot.mjs). Supabase — основне джерело правди для
 * route_alerts/delay_reports, JSON-файли лишаються резервною копією і
 * пишуться як і раніше незалежно від результату синхронізації.
 *
 * SUPABASE_URL / SUPABASE_SERVICE_KEY беруться зі секретів репозиторію
 * (Settings → Secrets and variables → Actions). Якщо не задані — усі
 * функції нижче тихо повертають false, бот працює тільки на JSON.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

if (!SUPABASE_ENABLED) {
  console.log('[bot] SUPABASE_URL/SUPABASE_SERVICE_KEY не задано — синхронізація вимкнена, працюю тільки з JSON.');
}

async function rest(method, table, { params, body, prefer } = {}) {
  if (!SUPABASE_ENABLED) return null;
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      console.warn(`[bot] Supabase ${method} ${table} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (err) {
    console.warn(`[bot] Supabase ${method} ${table} мережева помилка:`, err?.message || err);
    return null;
  }
}

/** Повністю замінює вміст route_alerts поточним списком активних оголошень. */
export async function replaceRouteAlerts(alerts) {
  if (!SUPABASE_ENABLED) return false;

  const deleted = await rest('DELETE', 'route_alerts', { params: { id: 'gt.0' } });
  if (deleted === null) return false;

  if (!alerts.length) return true;

  const rows = alerts.map((a) => ({
    id: a.id,
    kind: a.kind,
    route_number: a.routeNumber,
    message: a.message,
    created_at: a.createdAt,
    expires_at: a.expiresAt,
    source: a.source || 'manual'
  }));
  const result = await rest('POST', 'route_alerts', { body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
  return result !== null;
}

/** Додає в лог лише нові скарги цього циклу (append-only). */
export async function insertDelayReports(newReports) {
  if (!SUPABASE_ENABLED || !newReports.length) return false;

  const rows = newReports.map((r) => ({
    user_id: r.userId,
    username: r.username || null,
    kind: r.kind,
    route_number: r.routeNumber,
    comment: r.comment || null,
    created_at: r.createdAt
  }));
  const result = await rest('POST', 'delay_reports', { body: rows, prefer: 'return=minimal' });
  return result !== null;
}
