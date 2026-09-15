import { Navigation2, X } from 'lucide-react';

interface ActiveTripBarProps {
  instruction: string;
  progress: number;
  onCancel: () => void;
  onExpand?: () => void;
}

/**
 * Плаваюча панель "У дорозі" — лишається на екрані карти, поки триває
 * активна поїздка (StartActiveTrip у MapPage), незалежно від того,
 * відкрита шторка варіантів чи ні. Показує поточну підказку (куди йти /
 * на що сідати / де пересадка) і дозволяє завершити поїздку вручну.
 */
export function ActiveTripBar({ instruction, progress, onCancel, onExpand }: ActiveTripBarProps) {
  return (
    <div className="pointer-events-auto overflow-hidden rounded-[22px] glass-surface border border-border/40 shadow-xl shadow-black/10">
      <div className="h-1 w-full bg-surface-soft">
        <div
          className="h-full bg-forest transition-all duration-500 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="flex w-full items-center gap-2.5 px-3.5 py-3">
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/15 text-forest">
            <Navigation2 size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-wide text-ink-muted">У дорозі</p>
            <p className="truncate text-xs font-bold text-ink-text">{instruction}</p>
          </div>
        </button>
        <button
          type="button"
          aria-label="Завершити поїздку"
          onClick={onCancel}
          className="shrink-0 rounded-full p-2 text-ink-muted hover:bg-surface-soft hover:text-ink-text transition-colors active:scale-90"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
