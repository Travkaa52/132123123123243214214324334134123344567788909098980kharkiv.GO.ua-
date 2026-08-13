/**
 * scripts/fcmNotify.mjs
 * ---------------------------------------------------------------------------
 * Розсилка push-сповіщень про затримку маршруту підписаним користувачам
 * (колекція Firestore `pushSubscriptions`, див. frontend/src/lib/firebase.ts
 * і frontend/src/lib/pushSubscription.ts).
 *
 * Дзеркало bot/fcm_notify.py (Python-версія для окремого сервера) — та сама
 * модель даних, той самий service account. Викликається з
 * process-telegram-bot.mjs одразу після створення нового route-alert.
 *
 * FIREBASE_SERVICE_ACCOUNT_JSON (секрет репозиторію) — вміст service-account
 * ключа (Firebase Console → Project settings → Service accounts → Generate
 * new private key), як є (JSON) або в base64. Якщо не задано — усі функції
 * нижче тихо нічого не роблять, решта бота працює як і раніше.
 *
 * Без зовнішніх залежностей: підпис JWT для OAuth2 робимо вручну через
 * вбудований node:crypto (RS256), як і для service-account токенів Google.
 */
import crypto from 'node:crypto';

const RAW_SERVICE_ACCOUNT = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

const serviceAccount = parseServiceAccount(RAW_SERVICE_ACCOUNT);

export const FCM_ENABLED = Boolean(serviceAccount && serviceAccount.client_email && serviceAccount.private_key);

if (!RAW_SERVICE_ACCOUNT) {
  console.log('[bot] FIREBASE_SERVICE_ACCOUNT_JSON не задано — push-сповіщення про затримки вимкнені.');
} else if (!FCM_ENABLED) {
  console.warn('[bot] FIREBASE_SERVICE_ACCOUNT_JSON задано, але не вдалося розпарсити — push вимкнені.');
}

const PROJECT_ID = serviceAccount?.project_id;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const SCOPES = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/firebase.messaging'];

let cachedToken = null;
let cachedTokenExpiresAt = 0; // epoch ms

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Отримує OAuth2 access token через JWT Bearer flow (RFC 7523), без залежностей. */
async function getAccessToken() {
  if (!FCM_ENABLED) return null;
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) return cachedToken;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });
    if (!res.ok) {
      console.warn('[bot] Google OAuth2 token помилка:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    cachedToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (err) {
    console.warn('[bot] Google OAuth2 token мережева помилка:', err?.message || err);
    return null;
  }
}

function fsValueToPlain(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fsValueToPlain);
  return null;
}

function fsDocToPlain(doc) {
  const out = { id: doc.name.split('/').pop() };
  for (const [key, value] of Object.entries(doc.fields || {})) {
    out[key] = fsValueToPlain(value);
  }
  return out;
}

async function listPushSubscriptions(token) {
  const docs = [];
  let pageToken;
  for (;;) {
    const url = new URL(`${FIRESTORE_BASE}/pushSubscriptions`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.warn('[bot] Firestore listDocuments мережева помилка:', err?.message || err);
      break;
    }
    if (!res.ok) {
      console.warn('[bot] Firestore listDocuments помилка:', res.status, (await res.text()).slice(0, 300));
      break;
    }
    const data = await res.json();
    docs.push(...(data.documents || []).map(fsDocToPlain));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return docs;
}

async function disableInvalidSubscription(token, uid) {
  try {
    const url = new URL(`${FIRESTORE_BASE}/pushSubscriptions/${uid}`);
    url.searchParams.append('updateMask.fieldPaths', 'enabled');
    await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { enabled: { booleanValue: false } } })
    });
  } catch {
    // безпечно ігноруємо — не критично для основного циклу бота
  }
}

/**
 * Надсилає push про затримку всім підписаним на цей маршрут (або на весь вид
 * транспорту `kind`). Тихо повертає { sent: 0, ... }, якщо FCM вимкнено чи
 * підписників немає — виклик завжди безпечний, навіть без налаштувань.
 */
export async function notifyDelaySubscribers(routeNumber, kind, alertMessage) {
  if (!FCM_ENABLED) return { sent: 0, skipped: 'disabled' };

  const token = await getAccessToken();
  if (!token) return { sent: 0, skipped: 'no-token' };

  const subs = await listPushSubscriptions(token);
  const routeStr = String(routeNumber);
  const targets = subs.filter((s) => {
    if (!s.enabled || !s.fcmToken) return false;
    const routes = (s.routes || []).map(String);
    return routes.includes(routeStr) || (kind && routes.includes(kind));
  });

  if (!targets.length) return { sent: 0, skipped: 'no-subscribers' };

  const title = 'Kharkiv GO — затримка руху';
  const body = alertMessage.length <= 180 ? alertMessage : `${alertMessage.slice(0, 177)}...`;

  let sent = 0;
  for (const sub of targets) {
    const payload = {
      message: {
        token: sub.fcmToken,
        notification: { title, body },
        data: { routeNumber: routeStr, kind: kind || '', url: '/' },
        webpush: { fcm_options: { link: '/' } }
      }
    };
    let res;
    try {
      res = await fetch(FCM_SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn(`[bot] FCM send виняток для ${sub.id}:`, err?.message || err);
      continue;
    }
    if (res.ok) {
      sent += 1;
      continue;
    }
    let status;
    try {
      status = (await res.json())?.error?.status;
    } catch {
      status = undefined;
    }
    if (status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT') {
      await disableInvalidSubscription(token, sub.id);
    } else {
      console.warn(`[bot] FCM send помилка для ${sub.id}:`, status || res.status);
    }
  }

  console.log(`[bot] Push про затримку маршруту ${routeStr}: надіслано ${sent}/${targets.length}.`);
  return { sent, total: targets.length };
}
