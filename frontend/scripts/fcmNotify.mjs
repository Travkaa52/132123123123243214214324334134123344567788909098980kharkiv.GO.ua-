/**
 * scripts/fcmNotify.mjs
 * Firebase FCM + Firestore Enterprise
 */

import crypto from 'node:crypto';

const RAW_SERVICE_ACCOUNT =
  (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

function parseServiceAccount(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  try {
    return JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8')
    );
  } catch {
    return null;
  }
}

const serviceAccount = parseServiceAccount(RAW_SERVICE_ACCOUNT);

export const FCM_ENABLED = Boolean(
  serviceAccount?.project_id &&
  serviceAccount?.client_email &&
  serviceAccount?.private_key
);

if (!RAW_SERVICE_ACCOUNT) {
  console.log(
    '[bot] FIREBASE_SERVICE_ACCOUNT_JSON не задано — FCM вимкнено.'
  );
} else if (!FCM_ENABLED) {
  console.warn(
    '[bot] FIREBASE_SERVICE_ACCOUNT_JSON некоректний — FCM вимкнено.'
  );
}

const PROJECT_ID = serviceAccount?.project_id;

const DATABASE_ID = '(default)';

const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

const FCM_SEND_URL =
  `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging'
];

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  if (!FCM_ENABLED) return null;

  if (
    cachedToken &&
    Date.now() < cachedTokenExpiresAt - 60_000
  ) {
    return cachedToken;
  }

  const nowSec = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const claims = {
    iss: serviceAccount.client_email,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };

  const unsigned =
    `${base64url(JSON.stringify(header))}.` +
    `${base64url(JSON.stringify(claims))}`;

  const signer = crypto.createSign('RSA-SHA256');

  signer.update(unsigned);
  signer.end();

  const signature =
    signer.sign(serviceAccount.private_key).toString('base64url');

  const assertion = `${unsigned}.${signature}`;

  try {
    const res = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type:
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion
        })
      }
    );

    if (!res.ok) {
      console.warn(
        '[bot] Google OAuth2 token помилка:',
        res.status,
        (await res.text()).slice(0, 500)
      );

      return null;
    }

    const data = await res.json();

    cachedToken = data.access_token;

    cachedTokenExpiresAt =
      Date.now() +
      (data.expires_in || 3600) * 1000;

    return cachedToken;

  } catch (err) {
    console.warn(
      '[bot] Google OAuth2 мережна помилка:',
      err?.message || err
    );

    return null;
  }
}

function fsValueToPlain(value) {
  if (value == null) return null;

  if ('stringValue' in value)
    return value.stringValue;

  if ('booleanValue' in value)
    return value.booleanValue;

  if ('integerValue' in value)
    return Number(value.integerValue);

  if ('doubleValue' in value)
    return value.doubleValue;

  if ('timestampValue' in value)
    return value.timestampValue;

  if ('arrayValue' in value)
    return (value.arrayValue.values || [])
      .map(fsValueToPlain);

  if ('mapValue' in value)
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {})
        .map(([key, val]) => [
          key,
          fsValueToPlain(val)
        ])
    );

  return null;
}

function fsDocToPlain(doc) {
  const out = {
    id: doc.name.split('/').pop()
  };

  for (const [key, value] of Object.entries(
    doc.fields || {}
  )) {
    out[key] = fsValueToPlain(value);
  }

  return out;
}

async function listPushSubscriptions(token) {
  const docs = [];

  let pageToken;

  for (;;) {
    const url =
      new URL(`${FIRESTORE_BASE}/pushSubscriptions`);

    url.searchParams.set('pageSize', '300');

    if (pageToken) {
      url.searchParams.set(
        'pageToken',
        pageToken
      );
    }

    let res;

    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

    } catch (err) {
      console.warn(
        '[bot] Firestore network error:',
        err?.message || err
      );

      break;
    }

    const text = await res.text();

    if (!res.ok) {
      console.warn(
        '[bot] Firestore listDocuments помилка:',
        res.status,
        text.slice(0, 1000)
      );

      break;
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.warn(
        '[bot] Firestore повернув некоректний JSON.'
      );

      break;
    }

    docs.push(
      ...(data.documents || [])
        .map(fsDocToPlain)
    );

    pageToken = data.nextPageToken;

    if (!pageToken) break;
  }

  return docs;
}

async function disableInvalidSubscription(
  token,
  uid
) {
  try {
    const url =
      new URL(
        `${FIRESTORE_BASE}/pushSubscriptions/${encodeURIComponent(uid)}`
      );

    url.searchParams.append(
      'updateMask.fieldPaths',
      'enabled'
    );

    await fetch(url, {
      method: 'PATCH',

      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        fields: {
          enabled: {
            booleanValue: false
          }
        }
      })
    });

  } catch {}
}

export async function notifyDelaySubscribers(
  routeNumber,
  kind,
  alertMessage
) {
  if (!FCM_ENABLED) {
    return {
      sent: 0,
      skipped: 'disabled'
    };
  }

  console.log(
    `[bot] FCM project: ${PROJECT_ID}`
  );

  console.log(
    `[bot] Firestore database: ${DATABASE_ID}`
  );

  const token = await getAccessToken();

  if (!token) {
    return {
      sent: 0,
      skipped: 'no-token'
    };
  }

  const subs =
    await listPushSubscriptions(token);

  const routeStr =
    String(routeNumber);

  const targets =
    subs.filter((sub) => {
      if (
        !sub.enabled ||
        !sub.fcmToken
      ) {
        return false;
      }

      const routes =
        (sub.routes || [])
          .map(String);

      return (
        routes.includes(routeStr) ||
        (kind &&
          routes.includes(String(kind)))
      );
    });

  if (!targets.length) {
    console.log(
      `[bot] Підписників для маршруту ${routeStr} не знайдено.`
    );

    return {
      sent: 0,
      skipped: 'no-subscribers'
    };
  }

  const title =
    'Kharkiv GO — затримка руху';

  const body =
    alertMessage.length <= 180
      ? alertMessage
      : `${alertMessage.slice(0, 177)}...`;

  let sent = 0;

  for (const sub of targets) {
    const payload = {
      message: {
        token: sub.fcmToken,

        notification: {
          title,
          body
        },

        data: {
          routeNumber: routeStr,
          kind: kind || '',
          url: '/'
        },

        webpush: {
          fcm_options: {
            link: '/'
          }
        }
      }
    };

    let res;

    try {
      res = await fetch(
        FCM_SEND_URL,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${token}`,
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(payload)
        }
      );

    } catch (err) {
      console.warn(
        `[bot] FCM network error ${sub.id}:`,
        err?.message || err
      );

      continue;
    }

    if (res.ok) {
      sent += 1;
      continue;
    }

    let error;

    try {
      error = await res.json();
    } catch {
      error = {};
    }

    const status =
      error?.error?.status;

    const message =
      error?.error?.message;

    if (
      status === 'NOT_FOUND' ||
      status === 'UNREGISTERED' ||
      status === 'INVALID_ARGUMENT'
    ) {
      await disableInvalidSubscription(
        token,
        sub.id
      );
    } else {
      console.warn(
        `[bot] FCM send помилка для ${sub.id}:`,
        status || res.status,
        message || ''
      );
    }
  }

  console.log(
    `[bot] Push про затримку маршруту ${routeStr}: ` +
    `надіслано ${sent}/${targets.length}.`
  );

  return {
    sent,
    total: targets.length
  };
}
