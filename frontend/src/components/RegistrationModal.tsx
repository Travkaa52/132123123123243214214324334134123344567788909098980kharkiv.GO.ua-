import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { User, Phone, Mail, Lock, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Emblem } from '@/components/ui/Emblem';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirebaseConfigured } from '@/lib/firebase';

const AVATAR_EMOJIS = ['🚋', '🚇', '🚌', '🚎', '🗺️', '⭐', '💚'];

type AuthMode = 'guest' | 'email' | 'login';

/** Проста Google "G" іконка (без зовнішніх залежностей/іконкових шрифтів). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.98h3.89c2.27-2.09 3.53-5.17 3.53-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.89-2.98c-1.08.72-2.45 1.15-4.04 1.15-3.11 0-5.74-2.1-6.68-4.92H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.32 14.33A7.2 7.2 0 0 1 4.96 12c0-.81.14-1.6.36-2.33V6.58H1.29A11.97 11.97 0 0 0 0 12c0 1.93.46 3.76 1.29 5.42l4.03-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l4.03 3.09C6.26 6.85 8.89 4.75 12 4.75z"
      />
    </svg>
  );
}

/**
 * Вікно "знайомства", що показується один раз при першому запуску
 * застосунку поза Telegram (коли профіль ще не створено ні з Telegram,
 * ні вручну). Введені дані зберігаються в localStorage конкретного
 * пристрою/браузера через zustand persist (`kharkivgo-auth`), тож кожен
 * користувач має свій окремий, повністю локальний профіль — без бекенду
 * і без відправки даних кудись назовні.
 */
export function RegistrationModal() {
  const registerLocalProfile = useAuthStore((s) => s.registerLocalProfile);
  const registerWithEmailAccount = useAuthStore((s) => s.registerWithEmailAccount);
  const loginWithEmailAccount = useAuthStore((s) => s.loginWithEmailAccount);
  const loginWithGoogleAccount = useAuthStore((s) => s.loginWithGoogleAccount);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);

  const firebaseAvailable = isFirebaseConfigured();

  // Гостьовий (локальний, без бекенду) режим лишається доступним завжди —
  // email/Google додаються як альтернатива для тих, хто хоче "справжній"
  // акаунт, що не втратиться при очищенні даних браузера.
  const [mode, setMode] = useState<AuthMode>('guest');

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(AVATAR_EMOJIS[0]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleGuestSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      setError('Введіть імʼя (мінімум 2 символи)');
      return;
    }

    setSubmitting(true);
    setError(null);

    // Дані пишуться синхронно в локальне сховище пристрою — жодного
    // мережевого запиту, тож "надсилання" тут суто візуальне.
    registerLocalProfile({
      displayName: trimmed,
      avatarEmoji,
      contact: contact.trim() || undefined,
      languageCode: 'uk'
    });
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (mode === 'email' && name.trim().length < 2) {
      setError('Введіть імʼя (мінімум 2 символи)');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Введіть коректний e-mail');
      return;
    }
    if (password.length < 6) {
      setError('Пароль має містити мінімум 6 символів');
      return;
    }

    setSubmitting(true);
    const result =
      mode === 'email'
        ? await registerWithEmailAccount({ displayName: name.trim(), email: trimmedEmail, password })
        : await loginWithEmailAccount({ email: trimmedEmail, password });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Не вдалося виконати вхід. Спробуйте ще раз.');
    }
  };

  const handleGoogleClick = async () => {
    setError(null);
    setSubmitting(true);
    const result = await loginWithGoogleAccount();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Не вдалося увійти через Google.');
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-bg px-5 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Реєстрація в Kharkiv GO"
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-bg to-bg" />

      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-6 flex flex-col items-center text-center">
          <Emblem size={68} glow className="mb-4" />
          <h1 className="font-display text-2xl font-black tracking-tight text-ink-text">
            Ласкаво просимо!
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted max-w-[280px]">
            Kharkiv GO — транспортний застосунок Харкова. Створіть локальний профіль, щоб зберігати
            обране, історію та налаштування на цьому пристрої.
          </p>
        </div>

        {firebaseAvailable && (
          <div className="mb-4 flex gap-1 rounded-2xl bg-surface-muted/50 p-1 ring-1 ring-border/40">
            {(
              [
                { key: 'guest', label: 'Гість' },
                { key: 'email', label: 'Реєстрація' },
                { key: 'login', label: 'Вхід' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchMode(tab.key)}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                  mode === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-ink-muted hover:text-ink-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'guest' && (
          <form onSubmit={handleGuestSubmit} className="glass-surface space-y-4 rounded-[28px] p-5 shadow-glass-lg">
            <div>
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                Оберіть аватар
              </span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatarEmoji(emoji)}
                    aria-label={`Аватар ${emoji}`}
                    aria-pressed={avatarEmoji === emoji}
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl transition-all active:scale-95 ${
                      avatarEmoji === emoji
                        ? 'bg-primary/15 ring-2 ring-primary'
                        : 'bg-surface-muted/40 ring-1 ring-border/40 hover:bg-surface-muted/70'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                Ваше імʼя
              </span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted/60" />
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Наприклад, Петро"
                  maxLength={40}
                  autoFocus
                  required
                  className="w-full rounded-2xl border border-border/60 bg-surface-muted/40 py-3 pl-9 pr-3 text-sm font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                Контакт (необовʼязково)
              </span>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted/60" />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Телефон, e-mail або @username"
                  maxLength={60}
                  className="w-full rounded-2xl border border-border/60 bg-surface-muted/40 py-3 pl-9 pr-3 text-sm font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </label>

            {error && <p className="text-xs font-medium text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-extrabold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98 disabled:pointer-events-none disabled:opacity-50"
            >
              <span>Почати користуватися</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <p className="flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-ink-muted/70">
              <Sparkles className="h-3 w-3 shrink-0" />
              Дані зберігаються лише локально на цьому пристрої, без реєстрації на сервері
            </p>
          </form>
        )}

        {(mode === 'email' || mode === 'login') && (
          <form onSubmit={handleEmailSubmit} className="glass-surface space-y-4 rounded-[28px] p-5 shadow-glass-lg">
            {mode === 'email' && (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                  Ваше імʼя
                </span>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted/60" />
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Наприклад, Петро"
                    maxLength={40}
                    required
                    className="w-full rounded-2xl border border-border/60 bg-surface-muted/40 py-3 pl-9 pr-3 text-sm font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                E-mail
              </span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted/60" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-2xl border border-border/60 bg-surface-muted/40 py-3 pl-9 pr-3 text-sm font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
                Пароль
              </span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted/60" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Мінімум 6 символів"
                  autoComplete={mode === 'email' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  className="w-full rounded-2xl border border-border/60 bg-surface-muted/40 py-3 pl-9 pr-3 text-sm font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </label>

            {error && <p className="text-xs font-medium text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={submitting || isAuthLoading}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-extrabold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting || isAuthLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'email' ? 'Зареєструватися' : 'Увійти'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted/60">або</span>
              <span className="h-px flex-1 bg-border/50" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={submitting || isAuthLoading}
              className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border border-border/60 bg-surface-muted/30 px-4 py-3.5 text-sm font-bold text-ink-text transition-all hover:bg-surface-muted/60 active:scale-98 disabled:pointer-events-none disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Продовжити з Google</span>
            </button>

            <p className="flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-ink-muted/70">
              <Sparkles className="h-3 w-3 shrink-0" />
              Профіль зберігається в акаунті — доступний навіть після переустановки
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
