import { useState } from 'react';
import { Smartphone, CheckCircle2, Share, ChevronRight, MoreVertical, PlusSquare, Download, Send, Globe } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useHomeScreenShortcut } from '@/hooks/useHomeScreenShortcut';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { openInExternalBrowser } from '@/lib/telegram';

/** Посилання на сторінку-гайд повного встановлення PWA — відкривається
 *  ЗОВНІШНІМ браузером (не WebView Telegram), інакше Service Worker і
 *  діалог встановлення просто не спрацюють. */
function getInstallGuideUrl(): string {
  return `${window.location.origin}/install-app`;
}

/** Найпростіша евристика платформи для ручних інструкцій поза Telegram. */
function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Блок "Створити ярлик на головному екрані":
 * - Усередині Telegram (Bot API 8.0+) — одна кнопка, яка одразу відкриває
 *   рідний діалог Telegram WebApp.addToHomeScreen(), без ручних кроків.
 * - Усередині Telegram зі старим клієнтом — коротка підказка оновити застосунок.
 * - Поза Telegram, у Chrome/Edge (Android і десктоп) — рідний системний
 *   діалог встановлення PWA через beforeinstallprompt (usePwaInstall) —
 *   так само одна кнопка, застосунок ставиться як окрема програма з
 *   власною іконкою і працює локально на пристрої (офлайн-кеш через
 *   сервіс-воркер, дані — localStorage/IndexedDB, без бекенду).
 * - Поза Telegram в iOS Safari / Firefox — покрокова інструкція під
 *   платформу, бо ці браузери не надають сторінці програмного доступу
 *   до діалогу встановлення (обмеження браузера, не застосунку).
 */
export function HomeScreenShortcutCard() {
  const isTelegramEnv = useAuthStore((s) => s.isTelegramEnv);
  const { isSupported, status, isChecking, createShortcut, justAdded } = useHomeScreenShortcut();
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  const alreadyAdded = status === 'added';

  const handleNativeInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    const accepted = await promptInstall();
    setIsInstalling(false);
    if (accepted) setJustInstalled(true);
  };

  if (isTelegramEnv && isSupported) {
    return (
      <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm divide-y divide-border/40">
        <button
          type="button"
          onClick={createShortcut}
          disabled={alreadyAdded || isChecking}
          className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left disabled:opacity-70"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                alreadyAdded || justAdded
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-surface border-border/40 text-ink-text'
              }`}
            >
              {alreadyAdded || justAdded ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </div>
            <div>
              <span className="block text-xs font-bold text-ink-text">
                {alreadyAdded || justAdded ? 'Ярлик Telegram додано' : 'Ярлик Telegram mini app'}
              </span>
              <span className="text-[11px] text-ink-muted">
                {alreadyAdded || justAdded
                  ? 'Застосунок можна відкрити прямо з домашнього екрана'
                  : isChecking
                    ? 'Перевіряємо стан...'
                    : 'Швидкий доступ без пошуку в Telegram'}
              </span>
            </div>
          </div>
          {!alreadyAdded && !justAdded && <ChevronRight className="h-4 w-4 text-ink-muted" />}
        </button>

        <button
          type="button"
          onClick={() => openInExternalBrowser(getInstallGuideUrl())}
          className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-xs font-bold text-ink-text">Встановити повний застосунок</span>
              <span className="text-[11px] text-ink-muted">
                Окрема іконка поза Telegram, працює офлайн — відкриється гайд у браузері
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        </button>
      </div>
    );
  }

  if (isTelegramEnv && !isSupported) {
    // Старий клієнт Telegram — API addToHomeScreen ще недоступне.
    return (
      <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text shrink-0">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-bold text-ink-text">Ярлик на головному екрані</span>
            <span className="text-[11px] text-ink-muted">
              Оновіть Telegram до останньої версії, щоб додати застосунок на головний екран в один дотик.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Поза Telegram, застосунок уже встановлено як PWA (запущено з ярлика) —
  // пропонувати встановлення вдруге сенсу нема.
  if (isInstalled || justInstalled) {
    return (
      <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-bold text-ink-text">Застосунок встановлено</span>
            <span className="text-[11px] text-ink-muted">Kharkiv GO працює локально на пристрої — карта, маршрути й обране доступні офлайн</span>
          </div>
        </div>
      </div>
    );
  }

  // Chrome/Edge (Android і десктоп) — рідний системний діалог встановлення
  // в один тап, без ручних кроків.
  if (canInstall) {
    return (
      <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm">
        <button
          type="button"
          onClick={handleNativeInstall}
          disabled={isInstalling}
          className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left disabled:opacity-70"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-xs font-bold text-ink-text">
                {isInstalling ? 'Відкриваємо діалог встановлення…' : 'Встановити застосунок'}
              </span>
              <span className="text-[11px] text-ink-muted">
                Окрема іконка на пристрої, запуск без браузера, працює офлайн
              </span>
            </div>
          </div>
          {!isInstalling && <ChevronRight className="h-4 w-4 text-ink-muted" />}
        </button>
      </div>
    );
  }

  // iOS Safari / Firefox — програмного діалогу встановлення в браузері
  // немає (обмеження самого браузера), тож покрокова інструкція під платформу.
  const platform = detectPlatform();

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 backdrop-blur-2xl shadow-sm">
      <button
        type="button"
        onClick={() => setShowManualSteps((v) => !v)}
        className="w-full flex items-center justify-between p-4 transition-colors hover:bg-surface/90 active:bg-muted/50 min-h-[48px] text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border/40 text-ink-text">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-bold text-ink-text">Створити ярлик на головному екрані</span>
            <span className="text-[11px] text-ink-muted">Як додати застосунок на робочий стіл</span>
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-ink-muted transition-transform ${showManualSteps ? 'rotate-90' : ''}`} />
      </button>

      {showManualSteps && (
        <div className="border-t border-border/40 p-4 pt-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {platform === 'ios' && (
            <>
              <Step icon={<Share className="h-3.5 w-3.5" />} text="Натисніть «Поділитися» внизу екрана Safari" />
              <Step icon={<PlusSquare className="h-3.5 w-3.5" />} text="Оберіть «На екран «Домівка»»" />
              <Step icon={<CheckCircle2 className="h-3.5 w-3.5" />} text="Підтвердіть — з'явиться значок застосунку" />
            </>
          )}
          {platform === 'android' && (
            <>
              <Step icon={<MoreVertical className="h-3.5 w-3.5" />} text="Натисніть меню (три крапки) в Chrome" />
              <Step icon={<PlusSquare className="h-3.5 w-3.5" />} text="Оберіть «Додати на головний екран»" />
              <Step icon={<CheckCircle2 className="h-3.5 w-3.5" />} text="Підтвердіть додавання" />
            </>
          )}
          {platform === 'desktop' && (
            <Step
              icon={<PlusSquare className="h-3.5 w-3.5" />}
              text="У адресному рядку браузера натисніть іконку встановлення застосунку (⊕) і підтвердіть"
            />
          )}
          <p className="text-[10px] text-ink-muted/80 pt-1">
            Найзручніше — відкрити Kharkiv GO прямо в Telegram: там ярлик створюється однією кнопкою.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
        {icon}
      </div>
      <p className="text-[11px] font-medium text-ink-text/90 leading-relaxed pt-0.5">{text}</p>
    </div>
  );
}
