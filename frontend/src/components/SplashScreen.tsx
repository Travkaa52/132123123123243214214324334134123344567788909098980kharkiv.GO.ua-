import { Emblem } from '@/components/ui';
import clsx from 'clsx';

interface SplashScreenProps {
  leaving?: boolean;
  onLeaveEnd?: () => void;
}

/**
 * Екран завантаження Kharkiv GO.
 *
 * Продуктивність: анімується виключно `transform` та `opacity` — обидві
 * властивості обробляються композитором на GPU-шарі й не викликають
 * layout/paint на кожному кадрі. Завдяки цьому анімація не прив'язана
 * штучно до 60 кадрів і плавно йде з нативною частотою екрана (90/120Hz
 * на пристроях, що це підтримують) — браузер сам синхронізується з vsync.
 * Жодних анімацій box-shadow/width/filter-blur в циклі — вони змушують
 * браузер перераховувати шари на кожному кадрі й "сажають" fps на слабких
 * телефонах.
 */
export function SplashScreen({ leaving, onLeaveEnd }: SplashScreenProps) {
  return (
    <div
      className={clsx(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-forest-dark',
        leaving && 'pointer-events-none animate-splash-out'
      )}
      style={{ willChange: 'transform, opacity' }}
      onAnimationEnd={(e) => {
        // Спрацьовує і на дочірніх анімаціях (кільця йдуть у нескінченному циклі),
        // тому фільтруємо саме подію виходу з самого кореневого елемента.
        if (leaving && e.target === e.currentTarget) onLeaveEnd?.();
      }}
    >
      {/* Статичний градієнтний фон — без анімації самого градієнта (дорого для GPU) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 20%, rgb(var(--color-forest-light)) 0%, rgb(var(--color-forest-dark)) 55%, #060a08 100%)'
        }}
      />

      {/* Плаваюча пляма світла — рухається лише через transform, дешево для композитора */}
      <div
        className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gold/10 blur-3xl will-change-transform"
        aria-hidden
      />

      <div className="relative flex flex-col items-center">
        {/* Пульсуючі кільця — 3 копії, кожна animate-* з різною затримкою, тільки scale+opacity */}
        <div className="relative flex h-40 w-40 items-center justify-center">
          <span className="absolute h-40 w-40 rounded-full border border-gold/40 will-change-transform animate-splash-ring-1" />
          <span className="absolute h-40 w-40 rounded-full border border-gold/40 will-change-transform animate-splash-ring-2" />
          <span className="absolute h-40 w-40 rounded-full border border-gold/40 will-change-transform animate-splash-ring-3" />

          <div className="animate-splash-emblem-in will-change-transform">
            <Emblem size={76} glow />
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-1 animate-splash-word-in will-change-transform">
          <p className="text-display-md tracking-[0.08em] text-white">KHARKIV GO</p>
          <p className="text-body-sm text-mint/80">транспорт Харкова онлайн</p>
        </div>
      </div>

      {/* Індикатор завантаження — транслюється, а не змінює width, тому не тригерить layout */}
      <div className="absolute bottom-[max(2.5rem,env(safe-area-inset-bottom))] h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 origin-left rounded-full bg-gold will-change-transform animate-progress-indeterminate" />
      </div>
    </div>
  );
}
