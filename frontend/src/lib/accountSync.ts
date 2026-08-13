/**
 * -----------------------------------------------------------------------
 * ХМАРНА СИНХРОНІЗАЦІЯ АКАУНТУ (Firestore)
 * -----------------------------------------------------------------------
 * Коли до профілю прив'язано "справжній" акаунт (e-mail+пароль або Google
 * через Firebase Auth), обране/історія/налаштування/нагадування додатково
 * зберігаються в документі `userAccounts/{firebaseUid}` у Firestore — на
 * додачу до звичайного localStorage. Саме це і дає перенесення профілю з
 * Telegram Mini App у встановлену PWA (і назад, і на інший пристрій): при
 * вході в той самий акаунт локальні store'и підтягують і зливають хмарний
 * знімок (див. hooks/useAccountCloudSync.ts).
 *
 * Firestore-документ належить рівно одному uid (правила в firestore.rules
 * дозволяють читати/писати лише request.auth.uid === uid), тож чужі дані
 * недоступні. Все — best-effort: якщо Firebase не налаштовано або запит
 * впав (немає мережі тощо), функції тихо повертають null / нічого не
 * роблять — застосунок і без хмари повністю працює на localStorage.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import type { FavoriteRoute, FavoriteStop } from '@/types/transport';
import type { SearchHistoryEntry } from '@/types/transport';
import type { AppSettings } from '@/types/user';
import type { SmartReminder } from '@/types/reminder';

export interface AccountSnapshot {
  favorites?: { stops: FavoriteStop[]; routes: FavoriteRoute[] };
  history?: SearchHistoryEntry[];
  settings?: Partial<
    Pick<
      AppSettings,
      | 'theme'
      | 'mapStyle'
      | 'units'
      | 'language'
      | 'visibleTransportKinds'
      | 'showStopsOnMap'
      | 'is3DMode'
      | 'delayNotificationsEnabled'
    >
  >;
  reminders?: SmartReminder[];
}

export async function pullAccountSnapshot(uid: string): Promise<AccountSnapshot | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'userAccounts', uid));
    if (!snap.exists()) return null;
    return snap.data() as AccountSnapshot;
  } catch {
    return null;
  }
}

export async function pushAccountSnapshot(uid: string, data: AccountSnapshot): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  try {
    await setDoc(doc(db, 'userAccounts', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    // Синхронізація best-effort — офлайн чи помилка мережі не мають ламати застосунок.
  }
}
