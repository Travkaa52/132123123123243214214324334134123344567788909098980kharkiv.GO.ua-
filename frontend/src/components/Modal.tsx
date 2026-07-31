import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Єдине модальне вікно застосунку. Як і <Sheet />, завжди виїжджає знизу
 * екрана з плавною анімацією (slide-up + fade), використовується для
 * коротких інформаційних та формних модалок з профілю: "Про програму",
 * "Оцінити застосунок", "Політика конфіденційності", підтримка тощо.
 */
export function Modal({ open, onClose, title, icon, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);

    // Блокуємо скрол фону, поки модалка відкрита.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-in fade-in duration-200 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-surface relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-xl3 shadow-glass-lg animate-sheet-up pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:rounded-xl3 sm:animate-in sm:fade-in sm:zoom-in-95 sm:duration-200 sm:pb-0"
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink-text/20 sm:hidden" />

        {(title || icon) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 py-3 sm:py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {icon && <span className="shrink-0 text-primary/80">{icon}</span>}
              {title && <h2 className="truncate text-title text-ink-text">{title}</h2>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-muted/60 hover:text-ink-text active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
