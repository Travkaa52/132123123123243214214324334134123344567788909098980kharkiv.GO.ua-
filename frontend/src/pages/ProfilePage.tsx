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
  Heart
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
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

      <div className="mx-auto max-w-md space-y-5 px-4 pt-2">
        
        {profile ? (
          <div className="relative overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 p-6 backdrop-blur-2xl shadow-xl transition-all">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="h-18 w-18 rounded-full object-cover ring-4 ring-primary/20 shadow-md"
                  />
                ) : profile.avatarEmoji ? (
                  <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary/10 text-3xl ring-4 ring-primary/20 shadow-md">
                    {profile.avatarEmoji}
                  </div>
                ) : (
                  <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-primary/20 shadow-md">
                    <User className="h-9 w-9" />
                  </div>
                )}
                
                <div 
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white ring-2 ring-surface shadow-xs"
                  title={profile.isLocal ? 'Локальний профіль на цьому пристрої' : 'Авторизовано через Telegram'}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 mb-1">
                  {profile.isLocal ? 'Локальний профіль' : 'Користувач Kharkiv GO'}
                </span>
                <h2 className="text-lg font-extrabold text-ink-text truncate leading-tight">
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
            </div>

            <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Статус акаунта</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Активний сеанс
              </span>
            </div>
          </div>
        ) : isTelegramEnv ? (
          <div className="relative overflow-hidden rounded-[22px] border border-destructive/30 bg-destructive/5 p-6 text-center backdrop-blur-xl shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3 border border-destructive/20">
              <User className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-ink-text mb-1">Не вдалося завантажити профіль</h3>
            <p className="text-xs text-ink-muted max-w-xs mx-auto">
              Спробуйте перевідкрити застосунок у Telegram.
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 p-6 text-center backdrop-blur-2xl shadow-xl">
            <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 border border-primary/20">
              <Sparkles className="h-7 w-7" />
            </div>

            <h3 className="text-base font-extrabold text-ink-text mb-2">
              Ви ще не увійшли
            </h3>

            <p className="text-xs text-ink-muted leading-relaxed mb-5 max-w-xs mx-auto">
              Авторизуйтеся через Telegram для синхронізації обраного та персональних налаштувань на всіх пристроях.
            </p>

            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {historyEntries.slice(0, 20).map((entry, idx) => {
                  const entryText = (entry as any).title || (entry as any).query || (entry as any).name || `Об'єкт #${entry.id ?? idx}`;
                  return (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <History className="h-4 w-4 text-ink-muted shrink-0" />
                        <span className="text-xs font-semibold text-ink-text truncate max-w-[220px]">
                          {entryText}
                        </span>
                      </div>
                      <span className="text-[10px] text-ink-muted font-medium">Нещодавно</span>
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
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm">
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
          </div>

          <HomeScreenShortcutCard />
        </div>

        <div className="space-y-3">
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

      </div>

      <AboutAppModal open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <RateAppModal open={isRateOpen} onClose={() => setIsRateOpen(false)} />
      <PrivacyPolicyModal open={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <SupportModal open={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <SupportProjectModal open={isSupportProjectOpen} onClose={() => setIsSupportProjectOpen(false)} />
    </div>
  );
}
