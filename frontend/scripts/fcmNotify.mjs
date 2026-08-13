/**
 * frontend/scripts/fcmNotify.mjs
 *
 * Firebase Cloud Messaging + Firestore Enterprise Native
 *
 * GitHub Actions:
 * FIREBASE_SERVICE_ACCOUNT_JSON
 *
 * Firestore:
 * databaseId = default
 * collection = pushSubscriptions
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const RAW_SERVICE_ACCOUNT = (
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
).trim();

function parseServiceAccount(raw) {
  if (!raw) return null;

  // Обычный JSON
  try {
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      parsed.project_id &&
      parsed.client_email &&
      parsed.private_key
    ) {
      return parsed;
    }
  } catch {
    // continue
  }

  // Base64 JSON
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (
      parsed &&
      parsed.project_id &&
      parsed.client_email &&
      parsed.private_key
    ) {
      return parsed;
    }
  } catch {
    // continue
  }

  return null;
}

const serviceAccount = parseServiceAccount(RAW_SERVICE_ACCOUNT);

export const FCM_ENABLED = Boolean(
  serviceAccount?.project_id &&
  serviceAccount?.client_email &&
  serviceAccount?.private_key
);

if (!RAW_SERVICE_ACCOUNT) {
  console.log(
    '[bot] FIREBASE_SERVICE_ACCOUNT_JSON не задано — push-сповіщення вимкнені.'
  );
}

if (RAW_SERVICE_ACCOUNT && !FCM_ENABLED) {
  console.warn(
    '[bot] FIREBASE_SERVICE_ACCOUNT_JSON задано, але service account некоректний.'
  );
}

if (!FCM_ENABLED) {
  // Не падаємо — Telegram/Supabase бот продовжує працювати.
  // Усі notify-функції просто повернуть skipped.
}

let app = null;
let db = null;
let messaging = null;

if (FCM_ENABLED) {
  try {
    app = initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
      }),
    });

    /*
     * ВАЖНО:
     *
     * У тебе Firestore Enterprise Native.
     * Имя базы данных в GCP — именно "default" (без скобок).
     */
    db = getFirestore(app, 'default');

    messaging = getMessaging(app);

    console.log(`[bot] FCM project: ${serviceAccount.project_id}`);
    console.log('[bot] Firestore database: default');
    console.log('[bot] Firestore Enterprise Native: Admin SDK');
  } catch (error) {
    console.error(
      '[bot] Firebase initialization error:',
      error?.message || error
    );

    app = null;
    db = null;
    messaging = null;
  }
}

/**
 * Преобразует Firestore document в обычный JS-объект.
 */
function documentToPlain(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

/**
 * Получить все pushSubscriptions.
 *
 * Структура ожидается примерно такая:
 *
 * pushSubscriptions/{uid}
 *
 * {
 *   enabled: true,
 *   fcmToken: "...",
 *   routes: ["1", "20", "Трамвай"]
 * }
 */
async function listPushSubscriptions() {
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('pushSubscriptions')
      .get();

    return snapshot.docs.map(documentToPlain);
  } catch (error) {
    if (error?.code === 5 || error?.code === 'NOT_FOUND') {
      console.warn(
        '[bot] Firestore: Коллекция "pushSubscriptions" не найдена.'
      );
    } else {
      console.error(
        '[bot] Firestore read error:',
        error?.code || '',
        error?.message || error
      );
    }

    return [];
  }
}

/**
 * Отключить недействительный FCM token.
 */
async function disableInvalidSubscription(id) {
  if (!db || !id) return;

  try {
    await db
      .collection('pushSubscriptions')
      .doc(id)
      .update({
        enabled: false,
      });

    console.log(
      `[bot] FCM subscription ${id} отключена.`
    );
  } catch (error) {
    console.warn(
      `[bot] Не удалось отключить subscription ${id}:`,
      error?.message || error
    );
  }
}

/**
 * Проверка соответствия подписки маршруту.
 */
function subscriptionMatchesRoute(subscription, routeNumber, kind) {
  if (!subscription?.enabled) return false;

  if (!subscription?.fcmToken) return false;

  const routes = Array.isArray(subscription.routes)
    ? subscription.routes.map(String)
    : [];

  const route = String(routeNumber ?? '');

  if (route && routes.includes(route)) {
    return true;
  }

  if (kind && routes.includes(String(kind))) {
    return true;
  }

  return false;
}

/**
 * Отправка одного FCM сообщения.
 */
async function sendPush(subscription, routeNumber, kind, alertMessage) {
  if (!messaging) {
    return {
      ok: false,
      reason: 'messaging-disabled',
    };
  }

  const route = String(routeNumber ?? '');

  const title = 'Kharkiv GO — затримка руху';

  const rawBody = String(
    alertMessage || 'Зафіксовано затримку руху.'
  );

  const body =
    rawBody.length <= 180
      ? rawBody
      : `${rawBody.slice(0, 177)}...`;

  try {
    await messaging.send({
      token: subscription.fcmToken,

      notification: {
        title,
        body,
      },

      data: {
        routeNumber: route,
        kind: String(kind || ''),
        url: '/',
      },

      webpush: {
        fcmOptions: {
          link: '/',
        },
      },
    });

    return {
      ok: true,
    };
  } catch (error) {
    const code = error?.code || '';

    /*
     * Эти ошибки означают, что token больше нельзя использовать.
     */
    const invalidToken =
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token';

    if (invalidToken) {
      await disableInvalidSubscription(subscription.id);

      return {
        ok: false,
        invalidToken: true,
        code,
      };
    }

    console.warn(
      `[bot] FCM send error для ${subscription.id}:`,
      code,
      error?.message || error
    );

    return {
      ok: false,
      code,
    };
  }
}

/**
 * Главная функция.
 *
 * Вызывается из process-telegram-bot.mjs:
 *
 * notifyDelaySubscribers(
 *   routeNumber,
 *   kind,
 *   alertMessage
 * );
 */
export async function notifyDelaySubscribers(
  routeNumber,
  kind,
  alertMessage
) {
  if (!FCM_ENABLED || !db || !messaging) {
    return {
      sent: 0,
      total: 0,
      skipped: 'disabled',
    };
  }

  const subscriptions = await listPushSubscriptions();

  if (!subscriptions.length) {
    console.log(
      `[bot] Firestore: pushSubscriptions пуст — подписчиков для маршруту ${routeNumber} не найдено.`
    );

    return {
      sent: 0,
      total: 0,
      skipped: 'no-subscribers',
    };
  }

  const targets = subscriptions.filter(
    (subscription) =>
      subscriptionMatchesRoute(
        subscription,
        routeNumber,
        kind
      )
  );

  if (!targets.length) {
    console.log(
      `[bot] Підписників для маршруту ${String(routeNumber)} не знайдено.`
    );

    return {
      sent: 0,
      total: 0,
      skipped: 'no-matching-subscribers',
    };
  }

  let sent = 0;

  for (const subscription of targets) {
    const result = await sendPush(
      subscription,
      routeNumber,
      kind,
      alertMessage
    );

    if (result.ok) {
      sent += 1;
    }
  }

  console.log(
    `[bot] Push про затримку маршруту ${String(routeNumber)}: надіслано ${sent}/${targets.length}.`
  );

  return {
    sent,
    total: targets.length,
  };
}

export default {
  FCM_ENABLED,
  notifyDelaySubscribers,
};
