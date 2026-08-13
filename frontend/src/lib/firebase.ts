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
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
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
