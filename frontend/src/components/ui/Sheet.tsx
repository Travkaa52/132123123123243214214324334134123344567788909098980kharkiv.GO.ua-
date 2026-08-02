import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Єдина нижня шторка застосунку (StopDetailModal, RouteDetailModal,
 * ReportDelayModal тощо). Стиль і поведінка перенесені зі
 * StationInfoCard з розділу "Живе метро" — реальний drag за ручку,
 * плавне закриття із затримкою замість миттєвого зникнення.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  // Раніше closing скидався в false ДО виклику onClose, а mounted взагалі
  // ніколи не ставав false — шторка "відскакувала" назад відкритою і її
  // неможливо було закрити. Тепер mounted знімається лише після завершення
  // анімації, а закриття завжди доводиться до кінця.
  const closeAnimated = useCallback(() => {
    if (closing) return;
    setClosing(true);
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onClose();
    }, 220);
  }, [closing, clearCloseTimeout, onClose]);

  useEffect(() => {
    if (open) {
      clearCloseTimeout();
      setMounted(true);
      setClosing(false);
    } else if (mounted && !closing) {
      setClosing(true);
      clearCloseTimeout();
      closeTimeoutRef.current = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 220);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => clearCloseTimeout(), [clearCloseTimeout]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAnimated();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, closeAnimated]);

  const onHandlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, currentY: e.clientY, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.currentY = e.clientY;
    const dy = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = 'none';
  };

  const onHandlePointerUp = () => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const dy = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    dragRef.current.dragging = false;
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (dy > 80) closeAnimated();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={clsx(
          'absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300',
          closing ? 'opacity-0' : 'animate-fade-in opacity-100'
        )}
        onClick={closeAnimated}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'glass-surface relative flex w-full max-w-lg flex-col overflow-hidden',
          'rounded-t-[32px] shadow-glass-lg',
          'max-h-[92dvh] pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[85dvh] sm:rounded-[32px]',
          closing
            ? 'translate-y-full transition-transform duration-200 ease-in sm:translate-y-0 sm:scale-95 sm:opacity-0 sm:transition-all'
            : 'animate-sheet-up sm:animate-in sm:fade-in sm:zoom-in-95 sm:duration-250'
        )}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1.5 pt-3 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="h-1.5 w-11 rounded-full bg-ink-muted/30" />
        </div>

        <button
          type="button"
          onClick={closeAnimated}
          aria-label="Закрити"
          className="absolute right-3.5 top-3.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised/90 text-ink-muted shadow-sm ring-1 ring-border/40 backdrop-blur transition-all hover:bg-surface-raised hover:text-ink-text active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>

        {title && <h2 className="shrink-0 px-6 pr-16 pt-1.5 font-display text-lg font-extrabold tracking-tight text-ink-text">{title}</h2>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5 pt-3">{children}</div>
      </div>
    </div>,
    document.body
  );
}
