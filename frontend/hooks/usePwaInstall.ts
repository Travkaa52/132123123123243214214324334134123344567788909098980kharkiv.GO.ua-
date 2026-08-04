import { useCallback, useEffect, useState } from 'react';

/**
 * Chrome/Edge (Android і десктоп) генерують подію `beforeinstallprompt`,
 * яка дає доступ до РІДНОГО системного діалогу встановлення PWA. Це не
 * стандартний DOM-тип, тож оголошуємо форму події самі.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari не підтримує display-mode media query для цього — але має
  // свою окрему ознаку запуску з ярлика на головному екрані.
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

interface UsePwaInstallResult {
  /** Чи можна прямо зараз показати РІДНИЙ діалог встановлення (Chrome/Edge). */
  canInstall: boolean;
  /** Чи застосунок вже запущено як встановлений PWA (з ярлика/докa). */
  isInstalled: boolean;
  /** Показати системний діалог встановлення. true — користувач погодився. */
  promptInstall: () => Promise<boolean>;
}

/**
 * Обгортка над `beforeinstallprompt` — дає змогу встановити застосунок як
 * PWA одним викликом системного діалогу, БЕЗ ручних інструкцій "відкрийте
 * меню браузера і оберіть...". Після встановлення застосунок отримує
 * власну іконку на пристрої й запускається окремим вікном (display:
 * standalone у manifest.webmanifest), а вся логіка — маршрути, карта,
 * обране, історія — вже й так працює локально на пристрої через
 * localStorage/IndexedDB та закешовані сервіс-воркером дані (без бекенду).
 *
 * ВАЖЛИВО: iOS Safari і Firefox цю подію не генерують взагалі — це
 * обмеження самого браузера (Apple/Mozilla не надають веб-сторінці
 * програмного доступу до діалогу встановлення), а не застосунку. Для них
 * лишаються покрокові інструкції — див. HomeScreenShortcutCard.
 */
export function usePwaInstall(): UsePwaInstallResult {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isRunningStandalone);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setDeferredEvent(null);
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return false;
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    // Подію можна використати лише один раз — після цього чекаємо нову.
    setDeferredEvent(null);
    if (choice.outcome === 'accepted') setIsInstalled(true);
    return choice.outcome === 'accepted';
  }, [deferredEvent]);

  return { canInstall: deferredEvent !== null && !isInstalled, isInstalled, promptInstall };
}
