import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';

const AUTO_DISMISS_MS = 2600;

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle
} as const;

/**
 * Глобальний тост у стилі застосунку (glass-surface, ink-палітра),
 * монтується один раз в App.tsx. Замінює всі window.alert() у застосунку.
 */
export function Toast() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const Icon = TONE_ICON[toast.tone];

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        onClick={dismiss}
        className={clsx(
          'glass-surface pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-border/60 px-4 py-3 shadow-glass-lg animate-in fade-in slide-in-from-top-4 duration-200',
          toast.tone === 'success' && 'border-primary/40',
          toast.tone === 'error' && 'border-red-500/40'
        )}
        role="status"
      >
        <Icon
          className={clsx(
            'h-4.5 w-4.5 shrink-0',
            toast.tone === 'success' && 'text-primary',
            toast.tone === 'error' && 'text-red-500',
            toast.tone === 'info' && 'text-ink-text/70'
          )}
        />
        <span className="text-body-sm font-medium text-ink-text">{toast.message}</span>
      </div>
    </div>,
    document.body
  );
}
