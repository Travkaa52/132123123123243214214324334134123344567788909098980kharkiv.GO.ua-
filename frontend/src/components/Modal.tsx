import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
 * Єдине модальне вікно застосунку.
 *
 * Стиль і поведінка перенесені зі StationInfoCard (розділ "Живе метро") —
 * найбільш відшліфованої картки в застосунку: тягнеться вниз за ручку
 * (реальний drag, не лише анімація), плавно "доїжджає" й закривається з
 * невеликою затримкою замість миттєвого зникнення, кругла кнопка
 * закриття плаває поверх контенту, а не займає окремий рядок шапки.
 */
export function Modal({ open, onClose, title, icon, children }: ModalProps) {
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

  // Ініціює закриття: програє анімацію "з'їжджання" вниз, і лише ПІСЛЯ неї
  // прибирає модалку з DOM і повідомляє батьківський компонент. Раніше тут
  // closing одразу скидався у false ДО виклику onClose — через це модалка
  // встигала "відскочити" назад у відкритий стан і її неможливо було закрити.
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
      // Батько закрив модалку напряму (open=false), минаючи closeAnimated —
      // все одно доганяємо коректне закриття з анімацією замість того, щоб
      // залишити mounted=true назавжди (модалку неможливо було б закрити).
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

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
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
        className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ${
          closing ? 'opacity-0' : 'animate-fade-in opacity-100'
        }`}
        onClick={closeAnimated}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={[
          'glass-surface relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden',
          'rounded-t-[32px] shadow-glass-lg',
          'pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:rounded-[32px] sm:pb-0',
          closing
            ? 'translate-y-full transition-transform duration-200 ease-in sm:translate-y-0 sm:scale-95 sm:opacity-0 sm:transition-all'
            : 'animate-sheet-up sm:animate-in sm:fade-in sm:zoom-in-95 sm:duration-250',
        ].join(' ')}
      >
        {/* Ручка для перетягування вниз — закриває картку жестом, як у метро */}
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1.5 pt-3 active:cursor-grabbing sm:hidden"
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

        {(title || icon) && (
          <div className="flex shrink-0 items-center gap-2.5 px-6 pr-16 pt-4">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/12 text-primary">
                {icon}
              </span>
            )}
            {title && <h2 className="truncate font-display text-lg font-extrabold tracking-tight text-ink-text">{title}</h2>}
          </div>
        )}

        <div className="overflow-y-auto overscroll-contain px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
