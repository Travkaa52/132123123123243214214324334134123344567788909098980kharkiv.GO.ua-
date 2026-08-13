/**
 * Ініціалізація Firebase (Anonymous Auth + Firestore) для push-підписок на
 * сповіщення про затримки. Firebase тут використовується виключно для
 * зберігання { uid -> fcmToken + обрані маршрути } в колекції
 * pushSubscriptions — решта застосунку (Telegram-профіль, обране, історія)
 * як і раніше живе в localStorage/Supabase і цим кодом не зачіпається.
 *
 * Якщо змінні VITE_FIREBASE_* не задані (наприклад, локальна розробка без
 * налаштованого проєкту) — isFirebaseConfigured() поверне false, і весь
 * функціонал сповіщень про затримки тихо себе вимикає, нічого не ламаючи.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile as updateFirebaseProfile,
  signOut as firebaseSignOut,
  type Auth,
  type User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  const a = getApp();
  if (!a) return null;
  authInstance = getAuth(a);
  return authInstance;
}

export function getFirebaseDb(): Firestore | null {
  if (dbInstance) return dbInstance;
  const a = getApp();
  if (!a) return null;
  dbInstance = getFirestore(a);
  return dbInstance;
}

let anonymousAuthPromise: Promise<string | null> | null = null;

/**
 * Гарантує наявність анонімного Firebase-користувача і повертає його uid.
 * Безпечно викликати багато разів — реальний signInAnonymously() виконається
 * лише один раз (кешуємо проміс), решта викликів чекають той самий результат.
 */
export function ensureAnonymousAuth(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve(null);

  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);

  if (!anonymousAuthPromise) {
    anonymousAuthPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          unsubscribe();
          resolve(user.uid);
        }
      });
      signInAnonymously(auth).catch(() => {
        unsubscribe();
        anonymousAuthPromise = null;
        resolve(null);
      });
    });
  }
  return anonymousAuthPromise;
}

export function getCurrentUid(): string | null {
  return getFirebaseAuth()?.currentUser?.uid ?? null;
}

/**
 * ---------------------------------------------------------------------------
 * Реєстрація / вхід через e-mail+пароль або Google (Firebase Auth).
 * ---------------------------------------------------------------------------
 * На відміну від ensureAnonymousAuth() (яка тихо створює анонімного
 * користувача для приватної колекції pushSubscriptions), ці функції
 * викликаються явно з вікна реєстрації, коли людина хоче мати "справжній"
 * акаунт (щоб не втратити профіль при видаленні браузерних даних /
 * переустановці застосунку). Вхід у "справжній" акаунт замінює поточного
 * анонімного користувача Firebase Auth (uid зміниться) — це нормально,
 * оскільки в старому анонімному акаунті не було збережено нічого
 * критичного, окрім, можливо, підписки на push, яку хук синхронізації
 * при потребі перестворить під новим uid.
 */

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Цей e-mail вже зареєстровано. Спробуйте увійти.';
    case 'auth/invalid-email':
      return 'Некоректний e-mail.';
    case 'auth/weak-password':
      return 'Пароль занадто простий (мінімум 6 символів).';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Невірний e-mail або пароль.';
    case 'auth/too-many-requests':
      return 'Забагато спроб. Спробуйте пізніше.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Вхід через Google скасовано.';
    case 'auth/network-request-failed':
      return 'Немає з’єднання з мережею.';
    case 'auth/configuration-not-found':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase не налаштовано для цього застосунку.';
    default:
      return 'Щось пішло не так. Спробуйте ще раз.';
  }
}

export interface FirebaseAuthResult {
  ok: boolean;
  user?: FirebaseUser;
  error?: string;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, error: 'Firebase не налаштовано для цього застосунку.' };
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      try {
        await updateFirebaseProfile(cred.user, { displayName });
      } catch {
        // Не критично, якщо ім'я не вдалось записати в сам Firebase-профіль —
        // локальний UserProfile все одно матиме displayName.
      }
    }
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, error: mapAuthError(err) };
  }
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, error: 'Firebase не налаштовано для цього застосунку.' };
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, error: mapAuthError(err) };
  }
}

/**
 * Вхід через Google. Спершу пробуємо popup (кращий UX на десктопі), а якщо
 * popup заблоковано/не підтримується (типово для деяких мобільних
 * WebView, зокрема всередині Telegram) — падаємо назад на redirect-флоу.
 * Результат redirect-флоу треба забрати через consumeGoogleRedirectResult()
 * при старті застосунку.
 */
export async function loginWithGoogle(): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, error: 'Firebase не налаштовано для цього застосунку.' };
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    return { ok: true, user: cred.user };
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        await signInWithRedirect(auth, provider);
        return { ok: true };
      } catch (redirectErr) {
        return { ok: false, error: mapAuthError(redirectErr) };
      }
    }
    return { ok: false, error: mapAuthError(err) };
  }
}

/** Забирає результат signInWithRedirect (Google на мобільних) при старті застосунку. */
export async function consumeGoogleRedirectResult(): Promise<FirebaseAuthResult | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    const cred = await getRedirectResult(auth);
    if (!cred) return null;
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, error: mapAuthError(err) };
  }
}

export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  try {
    await firebaseSignOut(auth);
  } catch {
    // ігноруємо — локальний профіль все одно буде очищено окремо
  }
}
