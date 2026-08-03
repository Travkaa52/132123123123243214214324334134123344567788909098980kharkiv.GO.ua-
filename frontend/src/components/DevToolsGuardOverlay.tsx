import { ShieldAlert } from 'lucide-react';
import { useDevToolsGuard } from '@/hooks/useDevToolsGuard';

/**
 * Показує ненав'язливе попередження, коли докований DevTools, ймовірно,
 * відкрито. Це не блокує сторінку і не приховує контент насправді (технічно
 * неможливо) — лише сигнал користувачу. Дивись коментар у useDevToolsGuard.
 */
export function DevToolsGuardOverlay() {
  const suspectedOpen = useDevToolsGuard(true);

  if (!suspectedOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[999] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-surface/95 backdrop-blur-xl px-4 py-2.5 shadow-lg">
        <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
        <span className="text-[11px] font-medium text-ink-text">
          Панель розробника виявлено
        </span>
      </div>
    </div>
  );
}
