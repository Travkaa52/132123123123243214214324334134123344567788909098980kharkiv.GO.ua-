import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { User, Phone, ArrowRight, Sparkles } from 'lucide-react';
import { Emblem } from '@/components/ui/Emblem';
import { useAuthStore } from '@/store/useAuthStore';

const AVATAR_EMOJIS = ['🚋', '🚇', '🚌', '🚎', '🗺️', '🌇', '⭐', '💚'];

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

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(AVATAR_EMOJIS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
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

        <form onSubmit={handleSubmit} className="glass-surface space-y-4 rounded-[28px] p-5 shadow-glass-lg">
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
      </div>
    </div>,
    document.body
  );
}
