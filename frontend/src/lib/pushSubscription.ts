/**
 * Підписка на push-сповіщення про затримки маршрутів через Firebase Cloud
 * Messaging. Токен пристрою + список обраних маршрутів користувача
 * зберігаються в Firestore: pushSubscriptions/{uid} (uid — анонімний
 * Firebase-користувач, див. lib/firebase.ts). За цим документом бекенд-бот
 * (той самий, що пише route_alerts у Supabase) може розсилати push, коли
 * зʼявляється нове оголошення про затримку по одному з обраних маршрутів.
 *
 * Реєстрація токена спирається на вже наявний власний Service Worker
 * (src/sw.ts, зареєстрований через PwaUpdateBanner/virtual:pwa-register) —
 * окремого firebase-messaging-sw.js не заводимо, обробку фонових push
 * додано прямо в sw.ts.
 */
import { doc, getDoc, setDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb, ensureAnonymousAuth, isFirebaseConfigured } from '@/lib/firebase';
import { getTelegramUser } from '@/lib/telegram';

export function isPushSubscriptionAvailable(): boolean {
  return (
    isFirebaseConfigured() &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    Boolean(import.meta.env.VITE_FIREBASE_VAPID_KEY)
  );
}

async function getFcmToken(): Promise<string | null> {
  if (!isPushSubscriptionAvailable()) {
    console.warn(
      '[push] isPushSubscriptionAvailable() = false — перевірте: VITE_FIREBASE_* + VITE_FIREBASE_VAPID_KEY задані на білді, серфейс підтримує Notification/serviceWorker.'
    );
    return null;
  }
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) {
      console.warn('[push] firebase/messaging isSupported() = false у цьому браузері (типово: Safari/приватний режим/старий браузер).');
      return null;
    }

    const { getFirebaseAuth } = await import('@/lib/firebase');
    const app = getFirebaseAuth()?.app;
    if (!app) {
      console.warn('[push] getFirebaseAuth() не повернув app — Firebase не проініціалізовано.');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) console.warn('[push] getToken() повернув порожній токен.');
    return token;
  } catch (e) {
    // Найчастіші причини: невалідний/відсутній VAPID-ключ, project ID не
    // збігається з тим, під яким видано VAPID-ключ, або messagingSenderId
    // не збігається з sender ID токена (напр. проєкт поміняли, а .env — ні).
    console.error('[push] getFcmToken() впав:', e);
    return null;
  }
}

/**
 * Вмикає сповіщення про затримки: анонімна автентифікація → дозвіл на
 * сповіщення (якщо ще не наданий) → FCM-токен → запис/оновлення документа
 * pushSubscriptions/{uid} з токеном і поточним списком обраних маршрутів.
 * Повертає true, якщо підписку успішно збережено.
 */
export async function enableDelayPushSubscription(routeIds: string[]): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db || !isPushSubscriptionAvailable()) return false;

  const uid = await ensureAnonymousAuth();
  if (!uid) return false;

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return false;
  }

  const token = await getFcmToken();
  if (!token) return false;

  // Якщо Mini App відкрито з Telegram — зберігаємо ще й chat_id користувача,
  // щоб бекенд-бот міг, крім push у застосунок, надіслати особисте
  // повідомлення напряму в Telegram (надійніше за push: не залежить від
  // FCM/Safari/увімкненого застосунку). Поза Telegram (звичайний браузер)
  // getTelegramUser() поверне null — поле просто не пишеться, нічого не
  // ламається, працює як і раніше лише через push.
  const telegramUser = getTelegramUser();

  try {
    await setDoc(
      doc(db, 'pushSubscriptions', uid),
      {
        fcmToken: token,
        routes: routeIds,
        enabled: true,
        updatedAt: serverTimestamp(),
        ...(telegramUser ? { telegramId: telegramUser.id } : {})
      },
      { merge: true }
    );
    return true;
  } catch (e) {
    // Найчастіша причина: firestore.rules не дозволяють запис анонімному
    // uid у pushSubscriptions/{uid} (перевірте, що правило дозволяє
    // request.auth.uid == uid для create/update).
    console.error('[push] setDoc(pushSubscriptions) впав:', e);
    return false;
  }
}

/**
 * Перевіряє, чи існує в Firestore РЕАЛЬНА (з fcmToken і enabled: true)
 * підписка для поточного пристрою. Саме відсутність такого документа при
 * увімкненому локальному перемикачі — головна причина "підписка є, а в
 * Firebase її нема": перемикач delayNotificationsEnabled — це звичайне
 * поле налаштувань, тож він міг стати true без реального виклику
 * enableDelayPushSubscription() (наприклад, підтягнувся з хмарного
 * знімка налаштувань іншого пристрою через useAccountCloudSync — а
 * FCM-токен по своїй суті прив'язаний до конкретного браузера/пристрою
 * і синхронізуватись між пристроями не може).
 */
export async function hasActivePushSubscription(): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;

  const uid = await ensureAnonymousAuth();
  if (!uid) return false;

  try {
    const snapshot = await getDoc(doc(db, 'pushSubscriptions', uid));
    return Boolean(snapshot.exists() && snapshot.data()?.enabled && snapshot.data()?.fcmToken);
  } catch {
    return false;
  }
}

/** Оновлює лише список обраних маршрутів у вже наявній підписці (без зміни токена чи прапорця enabled). */
export async function syncSubscribedRoutes(routeIds: string[]): Promise<void> {
  const db = getFirebaseDb();
  const uid = await ensureAnonymousAuth();
  if (!db || !uid) return;

  try {
    const ref = doc(db, 'pushSubscriptions', uid);
    const snapshot = await getDoc(ref);
    // Нічого не пишемо, якщо користувач ще жодного разу не вмикав
    // сповіщення про затримки — не хочемо створювати "порожні" підписки.
    if (!snapshot.exists() || !snapshot.data()?.fcmToken) return;

    await setDoc(ref, { routes: routeIds, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    // мовчки ігноруємо — це фонова синхронізація, не критична дія користувача
  }
}

/** Вимикає сповіщення про затримки (не видаляє документ повністю — прибирає токен і знімає прапорець). */
export async function disableDelayPushSubscription(): Promise<void> {
  const db = getFirebaseDb();
  const uid = await ensureAnonymousAuth();
  if (!db || !uid) return;

  try {
    await setDoc(
      doc(db, 'pushSubscriptions', uid),
      { enabled: false, fcmToken: deleteField(), updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // ігноруємо — локальний перемикач все одно вимкнеться
  }
}
