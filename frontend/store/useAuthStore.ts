import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import { getTelegramUser, isInsideTelegram } from '@/lib/telegram';
import type { UserProfile } from '@/types/user';

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
      updateProfile: (patch) => {
        const existing = get().profile;
        if (!existing) return;
        set({ profile: { ...existing, ...patch } });
      },
      signOut: () => set({ profile: null, hasCompletedOnboarding: false })
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
