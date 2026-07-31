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

  const closeAnimated = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 220);
  }, [onClose]);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

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
          'absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-200',
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
          'relative flex w-full max-w-lg flex-col overflow-hidden',
          'rounded-t-[28px] border-t border-border/10 bg-surface-raised shadow-glass-lg',
          'max-h-[92dvh] pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[85dvh] sm:rounded-[28px]',
          closing
            ? 'translate-y-full transition-transform duration-200 ease-in sm:translate-y-0 sm:opacity-0 sm:transition-opacity'
            : 'animate-sheet-up'
        )}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-ink-muted/25" />
        </div>

        <button
          type="button"
          onClick={closeAnimated}
          aria-label="Закрити"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/80 text-ink-muted shadow-sm backdrop-blur transition-colors hover:bg-surface hover:text-ink-text active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>

        {title && <h2 className="shrink-0 px-5 pr-14 pt-1 text-title text-ink-text">{title}</h2>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">{children}</div>
      </div>
    </div>,
    document.body
  );
}
