/**
 * scripts/fcmNotify.mjs
 * KharkivGO
 *
 * GitHub Actions
 * Firebase Admin SDK
 * Firestore Enterprise Native
 * Firebase Cloud Messaging
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  } catch {}

  return null;
}

const serviceAccount = parseServiceAccount(RAW_SERVICE_ACCOUNT);

const FCM_ENABLED = Boolean(
  serviceAccount?.project_id &&
  serviceAccount?.client_email &&
  serviceAccount?.private_key
);

let db = null;

if (!FCM_ENABLED) {
  console.log(
    '[bot] FIREBASE_SERVICE_ACCOUNT_JSON не задано — push вимкнені.'
  );
} else {
  try {
    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id
          });

    db = getFirestore(app);

    console.log(
      `[bot] FCM project: ${serviceAccount.project_id}`
    );

    console.log(
      '[bot] Firestore database: (default)'
    );
  } catch (error) {
    console.error(
      '[bot] Firebase Admin initialization error:',
      error?.message || error
    );
  }
}

const PROJECT_ID = serviceAccount?.project_id;

const FCM_SEND_URL =
  `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (!FCM_ENABLED || !serviceAccount) {
    return null;
  }

  if (
    cachedAccessToken &&
    Date.now() < cachedTokenExpiresAt - 60_000
  ) {
    return cachedAccessToken;
  }

  try {
    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id
          });

    const credential =
      app.options.credential;

    const tokenResult =
      await credential.getAccessToken();

    if (!tokenResult?.access_token) {
      console.warn(
        '[bot] Firebase access token не отримано.'
      );

      return null;
    }

    cachedAccessToken =
      tokenResult.access_token;

    cachedTokenExpiresAt =
      Date.now() + 50 * 60 * 1000;

    return cachedAccessToken;
  } catch (error) {
    console.warn(
      '[bot] Firebase access token error:',
      error?.message || error
    );

    return null;
  }
}

function normalizeRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes.map(String);
}

async function listPushSubscriptions() {
  if (!db) {
    return [];
  }

  try {
    const snapshot =
      await db
        .collection('pushSubscriptions')
        .get();

    const subscriptions = [];

    snapshot.forEach((doc) => {
      subscriptions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(
      `[bot] Firestore: знайдено ${subscriptions.length} підписок.`
    );

    return subscriptions;
  } catch (error) {
    console.error(
      '[bot] Firestore read error:',
      error?.message || error
    );

    return [];
  }
}

async function disableInvalidSubscription(uid) {
  if (!db || !uid) {
    return;
  }

  try {
    await db
      .collection('pushSubscriptions')
      .doc(uid)
      .set(
        {
          enabled: false
        },
        {
          merge: true
        }
      );

    console.log(
      `[bot] Підписку ${uid} вимкнено.`
    );
  } catch (error) {
    console.warn(
      `[bot] Не вдалося вимкнути підписку ${uid}:`,
      error?.message || error
    );
  }
}

async function sendPush(
  fcmToken,
  routeNumber,
  kind,
  alertMessage
) {
  const accessToken =
    await getAccessToken();

  if (!accessToken) {
    return {
      ok: false,
      invalid: false
    };
  }

  const routeStr =
    String(routeNumber);

  const body =
    alertMessage.length <= 180
      ? alertMessage
      : `${alertMessage.slice(0, 177)}...`;

  const payload = {
    message: {
      token: fcmToken,

      notification: {
        title: 'Kharkiv GO — затримка руху',
        body
      },

      data: {
        routeNumber: routeStr,
        kind: kind ? String(kind) : '',
        url: '/'
      },

      webpush: {
        fcm_options: {
          link: '/'
        }
      }
    }
  };

  try {
    const response =
      await fetch(
        FCM_SEND_URL,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify(payload)
        }
      );

    if (response.ok) {
      return {
        ok: true,
        invalid: false
      };
    }

    let errorData = null;

    try {
      errorData =
        await response.json();
    } catch {}

    const errorStatus =
      errorData?.error?.status || '';

    const errorMessage =
      errorData?.error?.message || '';

    console.warn(
      `[bot] FCM помилка ${response.status}:`,
      errorStatus || errorMessage || 'unknown'
    );

    const invalid =
      errorStatus === 'NOT_FOUND' ||
      errorStatus === 'UNREGISTERED' ||
      errorStatus === 'INVALID_ARGUMENT';

    return {
      ok: false,
      invalid
    };
  } catch (error) {
    console.warn(
      '[bot] FCM network error:',
      error?.message || error
    );

    return {
      ok: false,
      invalid: false
    };
  }
}

/**
 * Надсилає push усім користувачам,
 * які підписані на конкретний маршрут.
 *
 * routeNumber — номер маршруту
 * kind — bus / trolleybus / tram / metro
 * alertMessage — текст повідомлення
 */
export async function notifyDelaySubscribers(
  routeNumber,
  kind,
  alertMessage
) {
  if (!FCM_ENABLED || !db) {
    return {
      sent: 0,
      total: 0,
      skipped: 'firebase-disabled'
    };
  }

  if (!routeNumber || !alertMessage) {
    return {
      sent: 0,
      total: 0,
      skipped: 'invalid-data'
    };
  }

  const subscriptions =
    await listPushSubscriptions();

  const routeStr =
    String(routeNumber);

  const kindStr =
    kind ? String(kind) : '';

  const targets =
    subscriptions.filter((subscription) => {
      if (
        subscription.enabled !== true ||
        !subscription.fcmToken
      ) {
        return false;
      }

      const routes =
        normalizeRoutes(
          subscription.routes
        );

      return (
        routes.includes(routeStr) ||
        (
          kindStr &&
          routes.includes(kindStr)
        )
      );
    });

  if (!targets.length) {
    console.log(
      `[bot] Підписників для маршруту ${routeStr} не знайдено.`
    );

    return {
      sent: 0,
      total: 0,
      skipped: 'no-subscribers'
    };
  }

  let sent = 0;

  for (const subscription of targets) {
    const result =
      await sendPush(
        subscription.fcmToken,
        routeStr,
        kindStr,
        alertMessage
      );

    if (result.ok) {
      sent++;
      continue;
    }

    if (result.invalid) {
      await disableInvalidSubscription(
        subscription.id
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

export { FCM_ENABLED };
