/**
 * worker/src/index.ts
 * ---------------------------------------------------------------------------
 * Cloudflare Worker для KharkivGO.
 *
 * Робить дві речі:
 *
 *  1) Роздає зібраний фронтенд (frontend/dist) як звичайний статичний сайт
 *     через Workers Assets (env.ASSETS) — SPA fallback на index.html.
 *
 *  2) POST /webhook/telegram — приймає апдейти від Telegram миттєво (пуш
 *     від самого Telegram, БЕЗ жодного polling і БЕЗ cron). Обробляє саме
 *     ту частину, яка критична за часом — скарги користувачів на затримку
 *     транспорту: рахує поріг за вікно часу і одразу, в межах того самого
 *     HTTP-запиту, пише активне оголошення в Supabase (route_alerts). Це і
 *     є "секунди замість годин": Telegram б'є прямо у Worker, Worker прямо
 *     в Supabase, ніякого проміжного стану/черги/git-коміту.
 *
 * Адмін-панель, розсилки, довідка тощо — свідомо НЕ тут. Ця логіка не
 * time-critical і завʼязана на файловий стан (data-runtime/*.json) та git —
 * для цього лишається старий bot/GitHub Actions-скрипт
 * (frontend/scripts/process-telegram-bot.mjs). Обидва боти можуть навіть
 * одночасно ходити в один і той самий Supabase — Worker лише додає
 * миттєвий шлях для найчастішого сценарію (жалоба користувача).
 * ---------------------------------------------------------------------------
 */

export interface Env {
  ASSETS: Fetcher;
  /** KV namespace для антиспаму й дедуплікації апдейтів (створюється wrangler-ом). */
  KV: KVNamespace;

  BOT_TOKEN: string;
  /** Довільний секрет, який ви самі задасте в setWebhook (?secret_token=...) — захищає /webhook/telegram від чужих запитів. */
  TELEGRAM_WEBHOOK_SECRET: string;

  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;

  /**
   * JSON (або base64 від JSON) сервісного акаунта Firebase — той самий, що
   * використовує frontend/scripts/fcmNotify.mjs у старому cron-боті. Потрібен,
   * щоб Worker міг сам розіслати push одразу після створення route_alerts,
   * не чекаючи наступного запуску GitHub Actions (до 30 хв).
   */
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;

  DELAY_REPORT_THRESHOLD?: string;
  DELAY_REPORT_WINDOW_MINUTES?: string;
  DELAY_ALERT_DURATION_HOURS?: string;
  USER_RATE_LIMIT_SECONDS?: string;
}

const KIND_LABELS: Record<string, string> = {
  bus: '🚌 Автобус',
  trolleybus: '🚎 Тролейбус',
  tram: '🚋 Трамвай',
  metro: '🚇 Метро'
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      return handleTelegramWebhook(request, env, ctx);
    }

    // Все інше — статика фронтенда (SPA), Workers Assets сам віддає index.html
    // на 404 для client-side роутингу, якщо в конфігу assets.not_found_handling
    // виставлено "single-page-application" (див. wrangler.jsonc).
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

// --- Telegram webhook ------------------------------------------------------

async function handleTelegramWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Telegram шле цей заголовок з тим самим значенням, яке ви передали в
  // setWebhook (?secret_token=...) — так ми знаємо, що запит справді від
  // Telegram, а не від будь-кого, хто вгадав URL воркера.
  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // Відповідаємо Telegram-у 200 одразу, а всю роботу довершуємо у фоні —
  // так апдейт ніколи не піде в retry через повільний Supabase-запит, і
  // Telegram не почне ретраїти той самий апдейт (webhook чекає відповіді
  // максимум кілька секунд).
  ctx.waitUntil(processUpdate(update, env).catch((err) => console.error('processUpdate failed', err)));

  return new Response('ok', { status: 200 });
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
    from: { id: number; username?: string };
  };
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string };
  text?: string;
}

async function processUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }
  if (update.message?.text) {
    await handleMessage(update.message, env);
  }
}

async function handleMessage(message: TelegramMessage, env: Env): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? '';

  if (text === '/start' || text === '/report') {
    await sendMainMenu(chatId, env);
    return;
  }

  // Чи чекаємо від цього чату номер маршруту (крок 2 репорту затримки)?
  const state = await getChatState(chatId, env);
  if (state?.step === 'awaiting_route_number') {
    await handleRouteNumberReply(chatId, message, state.kind, env);
    return;
  }

  await sendMessage(
    chatId,
    'Не зрозумів. Натисніть /report, щоб повідомити про затримку транспорту.',
    env
  );
}

async function handleCallback(
  cb: NonNullable<TelegramUpdate['callback_query']>,
  env: Env
): Promise<void> {
  const chatId = cb.message?.chat.id;
  if (!chatId) return;
  const data = cb.data ?? '';

  await answerCallbackQuery(cb.id, env);

  if (data === 'user_report_delay') {
    await sendKindKeyboard(chatId, env);
    return;
  }

  if (data.startsWith('user_delay_kind:')) {
    const kind = data.split(':')[1];
    if (kind === 'all') {
      await submitDelayReport(chatId, cb.from, 'all', null, env);
      return;
    }
    await setChatState(chatId, { step: 'awaiting_route_number', kind }, env);
    await sendMessage(chatId, `Введіть номер маршруту (${KIND_LABELS[kind] ?? kind}):`, env, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]] }
    });
    return;
  }

  if (data === 'go_main_menu') {
    await clearChatState(chatId, env);
    await sendMainMenu(chatId, env);
  }
}

async function handleRouteNumberReply(
  chatId: number,
  message: TelegramMessage,
  kind: string,
  env: Env
): Promise<void> {
  const routeNumber = (message.text ?? '').trim();
  if (!routeNumber) {
    await sendMessage(chatId, 'Номер маршруту не може бути порожнім. Спробуйте ще раз:', env);
    return;
  }
  await clearChatState(chatId, env);
  await submitDelayReport(chatId, message.from, kind, routeNumber, env);
}

// --- Основна логіка: скарга -> поріг -> алерт ------------------------------

async function submitDelayReport(
  chatId: number,
  from: { id: number; username?: string } | undefined,
  kind: string,
  routeNumber: string | null,
  env: Env
): Promise<void> {
  const userId = from?.id ?? chatId;

  const rateLimitSeconds = Number(env.USER_RATE_LIMIT_SECONDS || '20');
  const rateLimitKey = `ratelimit:${userId}`;
  if (rateLimitSeconds > 0) {
    const last = await env.KV.get(rateLimitKey);
    if (last) {
      await sendMessage(chatId, '⏳ Дякуємо, ваша попередня скарга ще обробляється. Спробуйте трохи пізніше.', env);
      return;
    }
    await env.KV.put(rateLimitKey, '1', { expirationTtl: rateLimitSeconds });
  }

  const nowSeconds = Date.now() / 1000;
  const normalizedRoute = routeNumber ?? 'all';

  const inserted = await supabaseInsert(env, 'delay_reports', [
    {
      user_id: userId,
      username: from?.username ?? null,
      kind,
      route_number: normalizedRoute,
      comment: null,
      created_at: nowSeconds
    }
  ]);

  if (!inserted) {
    await sendMessage(chatId, '⚠️ Не вдалося зберегти скаргу, спробуйте, будь ласка, ще раз.', env);
    return;
  }

  await sendMessage(
    chatId,
    `✅ Дякуємо! Скаргу на затримку (${KIND_LABELS[kind] ?? 'транспорт'}${
      normalizedRoute !== 'all' ? `, маршрут ${normalizedRoute}` : ''
    }) прийнято.`,
    env
  );

  await maybeRaiseAlert(kind, normalizedRoute, env);
}

async function maybeRaiseAlert(kind: string, routeNumber: string, env: Env): Promise<void> {
  const threshold = Number(env.DELAY_REPORT_THRESHOLD || '5');
  const windowMinutes = Number(env.DELAY_REPORT_WINDOW_MINUTES || '60');
  const alertDurationHours = Number(env.DELAY_ALERT_DURATION_HOURS || '2');

  const sinceSeconds = Date.now() / 1000 - windowMinutes * 60;

  const recent = await supabaseSelect(env, 'delay_reports', {
    select: 'id',
    kind: `eq.${kind}`,
    route_number: `eq.${routeNumber}`,
    created_at: `gte.${sinceSeconds}`
  });

  if (!recent || recent.length < threshold) return;

  // Не дублювати алерт, якщо активний вже є для цієї комбінації kind+route.
  const nowSeconds = Date.now() / 1000;
  const existing = await supabaseSelect(env, 'route_alerts', {
    select: 'id',
    kind: `eq.${kind}`,
    route_number: `eq.${routeNumber}`,
    expires_at: `gt.${nowSeconds}`
  });
  if (existing && existing.length > 0) return;

  const alert = {
    id: Date.now(),
    kind,
    route_number: routeNumber,
    message:
      routeNumber === 'all'
        ? `Багато скарг на затримки: ${KIND_LABELS[kind] ?? kind}`
        : `Маршрут ${routeNumber}: багато скарг на затримку (${KIND_LABELS[kind] ?? kind})`,
    created_at: nowSeconds,
    expires_at: nowSeconds + alertDurationHours * 3600,
    source: 'auto'
  };

  await supabaseInsert(env, 'route_alerts', [alert], 'resolution=merge-duplicates,return=minimal');

  // Push підписникам маршруту — у фоні, той самий HTTP-запит webhook-у на це
  // не чекає (виклик іде з ctx.waitUntil ще на рівні handleTelegramWebhook).
  // Якщо FIREBASE_SERVICE_ACCOUNT_JSON не задано — просто нічого не шлемо
  // (push і далі розішле старий cron-бот раз на 30 хв, як резерв).
  await notifyDelaySubscribers(env, kind, routeNumber, alert.message);
}

// --- FCM push (той самий підхід, що в frontend/scripts/fcmNotify.mjs, але
// на Web Crypto замість Node-only firebase-admin, бо Worker це не Node) -----

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    // fallthrough
  }
  try {
    return JSON.parse(atob(raw)) as ServiceAccount;
  } catch {
    return null;
  }
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };

  const encoder = new TextEncoder();
  const unsigned = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(
    encoder.encode(JSON.stringify(claims))
  )}`;

  try {
    const key = await importPrivateKey(sa.private_key);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
    const jwt = `${unsigned}.${base64url(signature)}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });
    if (!res.ok) {
      console.error(`google token exchange -> ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  } catch (err) {
    console.error('google token exchange error', err);
    return null;
  }
}

interface FirestoreSubscription {
  uid: string;
  fcmToken: string;
  routes: string[];
}

/** Firestore REST API замість Admin SDK (Admin SDK не працює у Workers runtime). */
async function listPushSubscriptions(sa: ServiceAccount, accessToken: string): Promise<FirestoreSubscription[]> {
  const out: FirestoreSubscription[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/pushSubscriptions`
    );
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.error(`firestore list -> ${res.status}: ${await res.text()}`);
      break;
    }
    const data = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, any> }>;
      nextPageToken?: string;
    };

    for (const doc of data.documents ?? []) {
      const fields = doc.fields ?? {};
      const enabled = fields.enabled?.booleanValue;
      const fcmToken = fields.fcmToken?.stringValue;
      if (enabled !== true || !fcmToken) continue;
      const routes = (fields.routes?.arrayValue?.values ?? [])
        .map((v: any) => v.stringValue)
        .filter(Boolean);
      out.push({ uid: doc.name.split('/').pop() ?? '', fcmToken, routes });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}

async function sendFcmPush(
  sa: ServiceAccount,
  accessToken: string,
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<{ ok: boolean; invalid: boolean }> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data,
          webpush: { fcm_options: { link: '/' } }
        }
      })
    });
    if (res.ok) return { ok: true, invalid: false };
    const errData = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    const status = errData?.error?.status ?? '';
    console.warn(`fcm send -> ${res.status}: ${status}`);
    return { ok: false, invalid: status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT' };
  } catch (err) {
    console.warn('fcm send network error', err);
    return { ok: false, invalid: false };
  }
}

async function disableInvalidSubscription(sa: ServiceAccount, accessToken: string, uid: string): Promise<void> {
  try {
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/pushSubscriptions/${uid}?updateMask.fieldPaths=enabled`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { enabled: { booleanValue: false } } })
      }
    );
  } catch {
    // не критично — старий cron-бот теж прибирає невалідні токени
  }
}

async function notifyDelaySubscribers(
  env: Env,
  kind: string,
  routeNumber: string,
  alertMessage: string
): Promise<void> {
  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!sa) return; // push вимкнені — резервний cron-бот все одно розішле пізніше

  const accessToken = await getGoogleAccessToken(sa);
  if (!accessToken) return;

  const subs = await listPushSubscriptions(sa, accessToken);
  const targets = subs.filter((s) => s.routes.includes(routeNumber) || s.routes.includes(kind));
  if (!targets.length) return;

  const body = alertMessage.length <= 180 ? alertMessage : `${alertMessage.slice(0, 177)}...`;

  for (const sub of targets) {
    const result = await sendFcmPush(sa, accessToken, sub.fcmToken, 'Kharkiv GO — затримка руху', body, {
      routeNumber,
      kind,
      url: '/'
    });
    if (result.invalid) await disableInvalidSubscription(sa, accessToken, sub.uid);
  }
}

// --- Chat state у KV (заміна файлового data-runtime/chat-states.json) ------

interface ChatState {
  step: 'awaiting_route_number';
  kind: string;
}

async function getChatState(chatId: number, env: Env): Promise<ChatState | null> {
  const raw = await env.KV.get(`chatstate:${chatId}`);
  return raw ? (JSON.parse(raw) as ChatState) : null;
}

async function setChatState(chatId: number, state: ChatState, env: Env): Promise<void> {
  // TTL 10 хв — якщо користувач кинув діалог на середині, стан сам згасне.
  await env.KV.put(`chatstate:${chatId}`, JSON.stringify(state), { expirationTtl: 600 });
}

async function clearChatState(chatId: number, env: Env): Promise<void> {
  await env.KV.delete(`chatstate:${chatId}`);
}

// --- Telegram API helpers ---------------------------------------------------

async function telegramApi(env: Env, method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.error(`telegram ${method} -> ${res.status}: ${await res.text()}`);
  }
}

async function sendMessage(
  chatId: number,
  text: string,
  env: Env,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await telegramApi(env, 'sendMessage', { chat_id: chatId, text, ...extra });
}

async function answerCallbackQuery(callbackQueryId: string, env: Env): Promise<void> {
  await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
}

async function sendMainMenu(chatId: number, env: Env): Promise<void> {
  await sendMessage(chatId, 'Вітаємо в KharkivGO! Оберіть дію:', env, {
    reply_markup: {
      inline_keyboard: [[{ text: '🚨 Повідомити про затримку', callback_data: 'user_report_delay' }]]
    }
  });
}

async function sendKindKeyboard(chatId: number, env: Env): Promise<void> {
  await sendMessage(chatId, 'Який вид транспорту затримується?', env, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🚌 Автобус', callback_data: 'user_delay_kind:bus' },
          { text: '🚎 Тролейбус', callback_data: 'user_delay_kind:trolleybus' }
        ],
        [
          { text: '🚋 Трамвай', callback_data: 'user_delay_kind:tram' },
          { text: '🚇 Метро', callback_data: 'user_delay_kind:metro' }
        ],
        [{ text: '🌐 Весь транспорт (загальне)', callback_data: 'user_delay_kind:all' }],
        [{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]
      ]
    }
  });
}

// --- Supabase REST helpers (той самий підхід, що в scripts/supabaseSync.mjs) ---

async function supabaseInsert(
  env: Env,
  table: string,
  rows: Record<string, unknown>[],
  prefer = 'return=minimal'
): Promise<boolean> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: prefer
      },
      body: JSON.stringify(rows)
    });
    if (!res.ok) {
      console.error(`supabase insert ${table} -> ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`supabase insert ${table} network error`, err);
    return false;
  }
}

async function supabaseSelect(
  env: Env,
  table: string,
  params: Record<string, string>
): Promise<{ id: number }[] | null> {
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (!res.ok) {
      console.error(`supabase select ${table} -> ${res.status}: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as { id: number }[];
  } catch (err) {
    console.error(`supabase select ${table} network error`, err);
    return null;
  }
}
