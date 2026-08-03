import { useState } from 'react';
import {
  Download,
  Share,
  PlusSquare,
  MoreVertical,
  CheckCircle2,
  WifiOff,
  Zap,
  Smartphone,
  Monitor,
  ChevronRight
} from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'iPhone / iPad (Safari)',
  android: 'Android (Chrome)',
  desktop: 'Комп\u2019ютер (Chrome/Edge)'
};

/**
 * Окрема сторінка-гайд встановлення повноцінного PWA.
 *
 * Навмисно винесена з профілю у власний маршрут (`/install-app`), бо
 * відкривається НЕ у вбудованому WebView Telegram, а у системному браузері
 * пристрою (через `openLink` — див. lib/telegram.ts): лише так Service
 * Worker коректно реєструється і застосунок стає повністю офлайн-доступним
 * зі своєю іконкою на головному екрані, поза Telegram.
 */
export function InstallAppPage() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [isInstalling, setIsInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  const handleInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    const accepted = await promptInstall();
    setIsInstalling(false);
    if (accepted) setJustInstalled(true);
  };

  const done = isInstalled || justInstalled;

  return (
    <div className="min-h-screen bg-bg pb-10">
      <header className="px-5 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Download className="h-7 w-7" />
        </div>
        <h1 className="text-display-lg text-ink-text">Встановити Kharkiv GO</h1>
        <p className="mt-1.5 text-body-sm text-ink-muted">
          Повноцінний застосунок на вашому пристрої — без Telegram, з власною іконкою,
          картою, маршрутами й обраним, що працюють офлайн.
        </p>
      </header>

      <div className="px-4 space-y-3">
        {done ? (
          <div className="rounded-[22px] border border-primary/20 bg-primary/10 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-bold text-ink-text">Застосунок встановлено</p>
            <p className="mt-1 text-xs text-ink-muted">
              Знайдіть іконку Kharkiv GO на головному екрані — застосунок відкриється
              окремим вікном і працюватиме навіть без інтернету.
            </p>
          </div>
        ) : canInstall ? (
          <button
            type="button"
            onClick={handleInstall}
            disabled={isInstalling}
            className="w-full flex items-center justify-between rounded-[22px] border border-border/60 bg-surface/80 p-4 shadow-sm transition-colors hover:bg-surface/90 active:bg-muted/50 disabled:opacity-70"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                <Download className="h-5 w-5" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold text-ink-text">
                  {isInstalling ? 'Відкриваємо діалог встановлення…' : 'Встановити застосунок'}
                </span>
                <span className="text-[11px] text-ink-muted">Один дотик — і все готово</span>
              </div>
            </div>
            {!isInstalling && <ChevronRight className="h-4 w-4 text-ink-muted" />}
          </button>
        ) : (
          <>
            <div className="flex overflow-hidden rounded-[18px] border border-border/60 bg-surface/60 p-1">
              {(['ios', 'android', 'desktop'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`flex-1 rounded-[14px] px-2 py-2 text-[11px] font-semibold transition-colors ${
                    platform === p ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface'
                  }`}
                >
                  {p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'ПК'}
                </button>
              ))}
            </div>

            <div className="rounded-[22px] border border-border/60 bg-surface/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-ink-text">
                {platform === 'desktop' ? (
                  <Monitor className="h-4 w-4" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                <span className="text-xs font-bold">{PLATFORM_LABEL[platform]}</span>
              </div>

              <div className="space-y-3">
                {platform === 'ios' && (
                  <>
                    <Step n={1} icon={<Share className="h-3.5 w-3.5" />} text="Натисніть «Поділитися» внизу екрана Safari" />
                    <Step n={2} icon={<PlusSquare className="h-3.5 w-3.5" />} text="Оберіть «На екран «Домівка»»" />
                    <Step n={3} icon={<CheckCircle2 className="h-3.5 w-3.5" />} text="Підтвердіть — з'явиться значок застосунку" />
                  </>
                )}
                {platform === 'android' && (
                  <>
                    <Step n={1} icon={<MoreVertical className="h-3.5 w-3.5" />} text="Натисніть меню (три крапки) у Chrome" />
                    <Step n={2} icon={<PlusSquare className="h-3.5 w-3.5" />} text="Оберіть «Додати на головний екран» / «Встановити застосунок»" />
                    <Step n={3} icon={<CheckCircle2 className="h-3.5 w-3.5" />} text="Підтвердіть додавання" />
                  </>
                )}
                {platform === 'desktop' && (
                  <Step
                    n={1}
                    icon={<PlusSquare className="h-3.5 w-3.5" />}
                    text="У адресному рядку браузера натисніть іконку встановлення застосунку (⊕ або схожу) і підтвердіть"
                  />
                )}
              </div>
            </div>
          </>
        )}

        <div className="rounded-[22px] border border-border/60 bg-surface/60 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WifiOff className="h-4 w-4" />
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Після встановлення застосунок працює локально: карта, маршрути, обране й
              історія доступні навіть без інтернету — окремі дані оновлюються, коли
              зʼявиться звʼязок.
            </p>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Запускається окремою іконкою на головному екрані — без адресного рядка й
              без Telegram.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
        {icon}
      </div>
      <p className="text-[11px] font-medium text-ink-text/90 leading-relaxed pt-0.5">
        <span className="text-ink-muted mr-1">{n}.</span>
        {text}
      </p>
    </div>
  );
}
