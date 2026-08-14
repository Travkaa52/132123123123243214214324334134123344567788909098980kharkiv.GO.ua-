/**
 * supabase/functions/_shared/cors.ts
 * ---------------------------------------------------------------------------
 * Спільні CORS-заголовки для всіх Edge Functions. Frontend — Telegram Mini
 * App на GitHub Pages (статичний домен), тому дозволяємо конкретний origin
 * через змінну середовища ALLOWED_ORIGIN, а не "*" — бо "*" ламає sendBeacon
 * і не дозволяє Authorization/кастомні заголовки для credentialed-запитів.
 * Якщо ALLOWED_ORIGIN не задано, за замовчуванням дозволяємо все (зручно
 * для локальної розробки) — обов'язково задайте його в production.
 */

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN')?.trim();

export function corsHeaders(origin: string | null): HeadersInit {
  // Якщо ALLOWED_ORIGIN задано — завжди відповідаємо саме ним (не відлунюємо
  // довільний Origin запиту). Якщо не задано — відлунюємо Origin запиту
  // (зручно для локальної розробки; задайте ALLOWED_ORIGIN у production).
  const allowOrigin = allowedOrigin && allowedOrigin !== '*' ? allowedOrigin : (origin ?? '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-init-data',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
    'Vary': 'Origin'
  };
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
  }
  return null;
}
