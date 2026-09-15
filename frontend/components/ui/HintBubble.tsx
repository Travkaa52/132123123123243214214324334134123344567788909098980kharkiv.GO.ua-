import { type ReactNode, useEffect } from 'react';
import clsx from 'clsx';
import { useHint } from '@/hooks/useHint';

interface HintBubbleProps {
  /** Унікальний ключ підказки — визначає, чи вона вже була показана на цьому пристрої. */
  hintKey: string;
  /** Текст-помічник, напр. "Натисніть сюди, щоб наблизити схему". */
  text: string;
  /** З якого боку від кнопки показувати бульбашку. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Через скільки мс сама сховається (0 — не ховати автоматично). */
  autoHideMs?: number;
  className?: string;
  children: ReactNode;
}

const sideClasses: Record<NonNullable<HintBubbleProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2.5 -translate-y-1/2'
};

const tailClasses: Record<NonNullable<HintBubbleProps['side']>, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -mt-[1px] border-t-surface-raised border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-[1px] border-b-surface-raised border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 -ml-[1px] border-l-surface-raised border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 -mr-[1px] border-r-surface-raised border-y-transparent border-l-transparent'
};

/**
 * "Помічник" біля кнопки — маленька спливаюча підказка на кшталт
 * "Натисніть сюди, щоб...", що показується автоматично один раз (поки
 * користувач її не закриє чи не торкнеться самої кнопки), а далі більше
 * не зʼявляється на цьому пристрої.
 *
 * Використання: обгорнути кнопку/іконку —
 *   <HintBubble hintKey="metro-zoom" text="Натисніть, щоб наблизити схему" side="left">
 *     <ZoomButton ... />
 *   </HintBubble>
 */
export function HintBubble({ hintKey, text, side = 'top', autoHideMs = 6000, className, children }: HintBubbleProps) {
  const { visible, dismiss } = useHint(hintKey);

  useEffect(() => {
    if (!visible || autoHideMs <= 0) return;
    const timer = window.setTimeout(dismiss, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [visible, autoHideMs, dismiss]);

  return (
    <div className={clsx('relative inline-flex', className)} onClickCapture={visible ? dismiss : undefined}>
      {children}

      {visible && (
        <div
          role="tooltip"
          className={clsx(
            'pointer-events-none absolute z-30 w-max max-w-[180px] animate-fade-in rounded-xl bg-surface-raised px-3 py-2 text-[11.5px] font-medium leading-snug text-ink-text shadow-2xl',
            sideClasses[side]
          )}
        >
          <span className="mr-1">👉</span>
          {text}
          <span className={clsx('absolute h-0 w-0 border-[6px]', tailClasses[side])} />
        </div>
      )}
    </div>
  );
}
