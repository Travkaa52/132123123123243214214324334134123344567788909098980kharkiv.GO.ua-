import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToastStore } from '@/store/useToastStore';
import {
  User,
  Star,
  History,
  Send,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Settings as SettingsIcon,
  Info,
  Trash2,
  Share2,
  FileText,
  Award,
  LifeBuoy,
  Heart,
  MapPin,
  Clock,
  Download
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { assetUrl } from '@/lib/assetUrl';
import { openInExternalBrowser } from '@/lib/telegram';
import { useAuthStore } from '@/store/useAuthStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import {
  AboutAppModal,
  RateAppModal,
  PrivacyPolicyModal,
  SupportModal,
  SupportProjectModal
} from '@/components/ProfileModals';
import { HomeScreenShortcutCard } from '@/components/HomeScreenShortcutCard';

/** Соцмережі проекту — відображаються єдиним блоком у самому низу профілю. */
const SOCIAL_LINKS = [
  {
    name: 'Telegram',
    href: 'https://t.me/kharkiv_transpot_go',
    icon: assetUrl('/icons/iconotelegram.png'),
    hint: 'Канал і новини'
  },
  {
    name: 'Threads',
    href: 'https://www.threads.com/@kharkivgo_official',
    icon: assetUrl('/icons/iconothreads.png'),
    hint: '@kharkivgo_official'
  }
];

export function ProfilePage() {
  const profile = useAuthStore((s) => s.profile);
  const isTelegramEnv = useAuthStore((s) => s.isTelegramEnv);

  const favoriteStops = useFavoritesStore((s) => s.stops);
  const favoriteRoutes = useFavoritesStore((s) => s.routes);
  const favoritesCount = favoriteStops.length + favoriteRoutes.length;

  const historyEntries = useHistoryStore((s) => s.entries);
  const clearHistory = () => {
    useHistoryStore.setState({ entries: [] });
  };

  const showToast = useToastStore((s) => s.show);

  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isRateOpen, setIsRateOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSupportProjectOpen, setIsSupportProjectOpen] = useState(false);

  const handleShareApp = async () => {
    const shareData = {
      title: 'Kharkiv GO',
      text: 'Найкращий додаток для навігації та громадського транспорту у Харкові!',
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('Посилання скопійовано в буфер обміну!', 'success');
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-ink-text selection:bg-primary/20 pb-32">
      <PageHeader
        title="Профіль"
        subtitle="Особистий кабінет та керування"
        action={
          <Link
            to="/settings"
            aria-label="Налаштування"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-surface/80 text-ink-text shadow-xs backdrop-blur-md transition-all hover:bg-surface active:scale-95"
          >
            <SettingsIcon className="h-4.5 w-4.5" />
          </Link>
        }
      />

      <div className="mx-auto max-w-md space-y-6 px-4 pt-2">

        {profile ? (
          <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-surface shadow-xl">
            <div className="relative h-24 bg-gradient-to-br from-primary via-primary/80 to-forest-dark overflow-hidden">
              <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-16 h-36 w-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:16px_16px]" />
            </div>

            <div className="px-5 pb-5 -mt-11">
              <div className="flex items-end justify-between">
                <div className="relative shrink-0">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-20 w-20 rounded-[22px] object-cover ring-4 ring-surface shadow-lg"
                    />
                  ) : profile.avatarEmoji ? (
                    <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-primary/10 text-3xl ring-4 ring-surface shadow-lg">
                      {profile.avatarEmoji}
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-primary/10 text-primary ring-4 ring-surface shadow-lg">
                      <User className="h-9 w-9" />
                    </div>
                  )}

                  <div
                    className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white ring-[3px] ring-surface shadow-xs"
                    title={profile.isLocal ? 'Локальний профіль на цьому пристрої' : 'Авторизовано через Telegram'}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                </div>

                <span className="mb-1 flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary border border-primary/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Активний сеанс
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 mb-1.5">
                  {profile.isLocal ? 'Локальний профіль' : 'Користувач Kharkiv GO'}
                </span>
                <h2 className="text-xl font-extrabold text-ink-text truncate leading-tight">
                  {profile.displayName}
                </h2>
                {profile.username && (
                  <p className="text-xs font-medium text-ink-muted truncate">
                    @{profile.username}
                  </p>
                )}
                {profile.isLocal && profile.contact && (
                  <p className="text-xs font-medium text-ink-muted truncate">
                    {profile.contact}
                  </p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <Link
                  to="/favorites"
                  className="flex items-center gap-3 rounded-2xl bg-surface-soft/70 border border-border/40 p-3 transition-all hover:bg-surface-soft active:scale-[0.98]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Star className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-base font-extrabold text-ink-text leading-none">{favoritesCount}</span>
                    <span className="text-[10px] font-semibold text-ink-muted">В обраному</span>
                  </div>
                </Link>
                <div className="flex items-center gap-3 rounded-2xl bg-surface-soft/70 border border-border/40 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Clock className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-base font-extrabold text-ink-text leading-none">{historyEntries.length}</span>
                    <span className="text-[10px] font-semibold text-ink-muted">Переглядів</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isTelegramEnv ? (
          <div className="relative overflow-hidden rounded-[28px] border border-destructive/30 bg-destructive/5 p-6 text-center backdrop-blur-xl shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3 border border-destructive/20">
              <User className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-ink-text mb-1">Не вдалося завантажити профіль</h3>
            <p className="text-xs text-ink-muted max-w-xs mx-auto">
              Спробуйте перевідкрити застосунок у Telegram.
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-surface p-6 text-center shadow-xl">
            <div className="absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-primary/15 to-transparent pointer-events-none" />
            <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 border border-primary/20 shadow-sm">
              <Sparkles className="h-8 w-8" />
            </div>

            <h3 className="relative text-base font-extrabold text-ink-text mb-2">
              Ви ще не увійшли
            </h3>

            <p className="relative text-xs text-ink-muted leading-relaxed mb-5 max-w-xs mx-auto">
              Авторизуйтеся через Telegram для синхронізації обраного та персональних налаштувань на всіх пристроях.
            </p>

            <div className="relative grid grid-cols-2 gap-3">
              <a
                href="https://t.me"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98"
              >
                <Send className="h-4 w-4" />
                <span>Увійти</span>
              </a>
              <a
                href="https://t.me"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl bg-surface border border-border/80 px-4 py-3 text-xs font-bold text-ink-text shadow-xs transition-all hover:bg-surface/90 active:scale-98"
              >
                <span>Продовжити гостем</span>
              </a>
            </div>
          </div>
        )}

        {!profile && (
          <div className="space-y-2">
            <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
              Збережене
            </span>
            <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm divide-y divide-border/40">
              <Link
                to="/favorites"
                className="flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-soft text-ink-text border border-border/40">
                    <Star className="h-5 w-5 fill-ink-muted/20" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-ink-text">Обране</h4>
                    <p className="text-[11px] text-ink-muted">Маршрути, зупинки та станції</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-xs font-extrabold text-ink-text">
                    {favoritesCount}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-muted" />
                </div>
              </Link>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
              Історія переглядів (до 20)
            </span>
            {historyEntries.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[11px] font-bold text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1 min-h-[32px] px-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Очистити історію</span>
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm p-4">
            {historyEntries.length > 0 ? (
              <div className="space-y-1 max-h-60 overflow-y-auto no-scrollbar">
                {historyEntries.slice(0, 20).map((entry, idx) => {
                  const entryText = (entry as any).title || (entry as any).query || (entry as any).name || `Об'єкт #${entry.id ?? idx}`;
                  return (
                    <div key={idx} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-ink-muted">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-ink-text truncate max-w-[200px]">
                          {entryText}
                        </span>
                      </div>
                      <span className="text-[10px] text-ink-muted font-medium shrink-0">Нещодавно</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center flex flex-col items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted mb-2">
                  <History className="h-6 w-6" />
                </div>
                <h4 className="text-xs font-bold text-ink-text mb-1">Ви ще нічого не переглядали</h4>
                <p className="text-[11px] text-ink-muted max-w-[200px]">
                  Маршрути та зупинки, які ви відкриваєте, з'являться тут.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
            Керування
          </span>
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm divide-y divide-border/40">
            <Link
              to="/settings"
              className="flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <SettingsIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink-text">Налаштування</h4>
                  <p className="text-[11px] text-ink-muted">Тема, карта, мова, сповіщення, кеш</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </Link>

            <button
              type="button"
              onClick={() => openInExternalBrowser(getInstallGuideUrl())}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink-text">Встановити застосунок</h4>
                  <p className="text-[11px] text-ink-muted">Окрема сторінка в браузері — іконка на пристрої, офлайн</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>
          </div>

          <HomeScreenShortcutCard />
        </div>

        <div className="space-y-2">
          <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
            Про додаток
          </span>

          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm divide-y divide-border/40">
            <button
              onClick={() => setIsAboutOpen(true)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
                  <Info className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-ink-text">Про програму</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>

            <button
              onClick={() => setIsRateOpen(true)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
                  <Award className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-ink-text">Оцінити застосунок</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>

            <button
              onClick={handleShareApp}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
                  <Share2 className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-ink-text">Поділитися застосунком</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>

            <button
              onClick={() => setIsPrivacyOpen(true)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-ink-text">Політика конфіденційності</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
            Підтримка
          </span>
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm divide-y divide-border/40">
            <button
              onClick={() => setIsSupportOpen(true)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft text-ink-text border border-border/40">
                  <LifeBuoy className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-ink-text">Зв'язок з підтримкою</span>
                  <span className="text-[11px] text-ink-muted">Напишіть — повідомлення піде адміну</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>

            <button
              onClick={() => setIsSupportProjectOpen(true)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <Heart className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-ink-text">Підтримати проект</span>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
            Ми в соцмережах
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm p-3.5 transition-all hover:bg-surface active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft border border-border/40 overflow-hidden">
                  <img src={social.icon} alt={social.name} className="h-6 w-6 object-contain" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-ink-text">{social.name}</span>
                  <span className="block text-[10px] text-ink-muted truncate">{social.hint}</span>
                </div>
              </a>
            ))}
          </div>
        </div>

      </div>

      <AboutAppModal open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <RateAppModal open={isRateOpen} onClose={() => setIsRateOpen(false)} />
      <PrivacyPolicyModal open={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <SupportModal open={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <SupportProjectModal open={isSupportProjectOpen} onClose={() => setIsSupportProjectOpen(false)} />
    </div>
  );
}
