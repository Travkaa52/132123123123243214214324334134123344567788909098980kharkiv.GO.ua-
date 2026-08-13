import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import { getTelegramUser, isInsideTelegram } from '@/lib/telegram';
import {
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
  signOutFirebase,
  type FirebaseAuthResult
} from '@/lib/firebase';
import type { UserProfile } from '@/types/user';
import type { User as FirebaseUser } from 'firebase/auth';

export interface LocalRegistrationInput {
  displayName: string;
  avatarEmoji?: string;
  contact?: string;
  languageCode?: string;
}

interface AuthState {
  profile: UserProfile | null;
  isTelegramEnv: boolean;
  /**
   * true, коли користувач вже пройшов вікно реєстрації (або його профіль
   * підтягнуто з Telegram — там окреме "знайомство" не потрібне).
   * Зберігається в localStorage, тож питається лише один раз "на пристрій".
   */
  hasCompletedOnboarding: boolean;
  /** Підтягує профіль з Telegram Web App. Викликається один раз при старті застосунку. */
  hydrateFromTelegram: () => void;
  /** Зберігає профіль, введений вручну у вікні реєстрації (поза Telegram). */
  registerLocalProfile: (input: LocalRegistrationInput) => void;
  /** true під час звернення до Firebase Auth (реєстрація/вхід email або Google). */
  isAuthLoading: boolean;
  /** Реєстрація нового акаунту через e-mail + пароль (Firebase Auth). */
  registerWithEmailAccount: (params: { displayName: string; email: string; password: string }) => Promise<FirebaseAuthResult>;
  /** Вхід в існуючий акаунт через e-mail + пароль (Firebase Auth). */
  loginWithEmailAccount: (params: { email: string; password: string }) => Promise<FirebaseAuthResult>;
  /** Вхід/реєстрація через Google-акаунт (Firebase Auth). */
  loginWithGoogleAccount: () => Promise<FirebaseAuthResult>;
  /** Застосовує профіль з успішного FirebaseUser (спільна логіка email/google/redirect). */
  applyFirebaseUser: (user: FirebaseUser, provider: 'password' | 'google') => void;
  /** Оновлює вже існуючий профіль (локальний або telegram) частковими даними. */
  updateProfile: (patch: Partial<UserProfile>) => void;
  signOut: () => void;
}

/** Стабільний псевдо-id для локальних (не-Telegram) профілів, унікальний на пристрій. */
function generateLocalId(): number {
  return -Math.floor(1000000 + Math.random() * 8999999);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      isTelegramEnv: false,
      hasCompletedOnboarding: false,
      isAuthLoading: false,
      hydrateFromTelegram: () => {
        const inTelegram = isInsideTelegram();
        const tgUser = getTelegramUser();

        if (!tgUser) {
          set({ isTelegramEnv: inTelegram });
          return;
        }

        const profile: UserProfile = {
          telegramId: tgUser.id,
          displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
          username: tgUser.username,
          avatarUrl: tgUser.photo_url,
          languageCode: tgUser.language_code,
          createdAt: new Date().toISOString()
        };

        // Профіль з Telegram вже несе всю потрібну ідентифікацію —
        // окреме вікно реєстрації такому користувачу показувати не треба.
        set({ profile, isTelegramEnv: true, hasCompletedOnboarding: true });
      },
      registerLocalProfile: (input) => {
        const existing = get().profile;
        const profile: UserProfile = {
          telegramId: existing?.telegramId ?? generateLocalId(),
          displayName: input.displayName.trim(),
          avatarEmoji: input.avatarEmoji,
          contact: input.contact?.trim() || undefined,
          languageCode: input.languageCode ?? existing?.languageCode ?? 'uk',
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          isLocal: true
        };
        set({ profile, hasCompletedOnboarding: true });
      },
      applyFirebaseUser: (user, provider) => {
        const existing = get().profile;
        // Профіль з Telegram (реальний, позитивний telegramId, не локальний
        // гість) — це "справжня" ідентичність людини. Прив'язка email/Google
        // акаунту в такому разі не підміняє ім'я/аватар з Telegram, а лише
        // додає firebaseUid — саме цей uid потім використовується як ключ
        // хмарної синхронізації, завдяки якій дані переносяться в PWA поза
        // Telegram. Для локального гостя або першого входу через email/Google
        // — профіль формується з даних Firebase-акаунту.
        const isTelegramProfile = Boolean(existing && existing.telegramId > 0 && !existing.isLocal);

        const profile: UserProfile = isTelegramProfile
          ? { ...(existing as UserProfile), firebaseUid: user.uid, email: user.email ?? existing?.email, authProvider: provider }
          : {
              telegramId: existing?.telegramId ?? generateLocalId(),
              displayName:
                user.displayName?.trim() || existing?.displayName || user.email?.split('@')[0] || 'Користувач',
              avatarUrl: user.photoURL ?? existing?.avatarUrl,
              avatarEmoji: existing?.avatarEmoji,
              languageCode: existing?.languageCode ?? 'uk',
              createdAt: existing?.createdAt ?? new Date().toISOString(),
              isLocal: false,
              firebaseUid: user.uid,
              email: user.email ?? undefined,
              authProvider: provider
            };
        set({ profile, hasCompletedOnboarding: true });
      },
      registerWithEmailAccount: async ({ displayName, email, password }) => {
        set({ isAuthLoading: true });
        const result = await registerWithEmail(email, password, displayName.trim());
        if (result.ok && result.user) {
          get().applyFirebaseUser(result.user, 'password');
        }
        set({ isAuthLoading: false });
        return result;
      },
      loginWithEmailAccount: async ({ email, password }) => {
        set({ isAuthLoading: true });
        const result = await loginWithEmail(email, password);
        if (result.ok && result.user) {
          get().applyFirebaseUser(result.user, 'password');
        }
        set({ isAuthLoading: false });
        return result;
      },
      loginWithGoogleAccount: async () => {
        set({ isAuthLoading: true });
        const result = await loginWithGoogle();
        if (result.ok && result.user) {
          get().applyFirebaseUser(result.user, 'google');
        }
        set({ isAuthLoading: false });
        return result;
      },
      updateProfile: (patch) => {
        const existing = get().profile;
        if (!existing) return;
        set({ profile: { ...existing, ...patch } });
      },
      signOut: () => {
        const wasFirebase = Boolean(get().profile?.firebaseUid);
        set({ profile: null, hasCompletedOnboarding: false });
        if (wasFirebase) void signOutFirebase();
      }
    }),
    {
      name: 'kharkivgo-auth',
      storage: safeStorage,
      partialize: (state) => ({
        profile: state.profile,
        hasCompletedOnboarding: state.hasCompletedOnboarding
      })
    }
  )
);
