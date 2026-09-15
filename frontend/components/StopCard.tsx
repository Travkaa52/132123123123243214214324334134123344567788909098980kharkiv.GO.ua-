import { useFavoritesStore } from '@/store/useFavoritesStore';
import { TransportKindIcon } from '@/components/TransportKindIcon';
import { FavoriteButton } from '@/components/FavoriteButton';
import type { Stop } from '@/types/transport';

export function StopCard({ stop, etaMinutes, onClick }: { stop: Stop; etaMinutes?: number; onClick?: () => void }) {
  const isFavorite = useFavoritesStore((s) => s.isStopFavorite(stop.id));
  const addStop = useFavoritesStore((s) => s.addStop);
  const removeStop = useFavoritesStore((s) => s.removeStop);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl2 border border-white/60 bg-white/90 p-3 text-left shadow-glass transition hover:shadow-glass-lg active:scale-[0.99]"
    >
      {/* Іконки видів транспорту, що обслуговують зупинку — щоб одразу було
          видно метро/трамвай/тролейбус/автобус, а не тільки буквений код. */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center gap-0.5 rounded-full bg-mint/40 p-1">
        {stop.kinds.slice(0, 2).map((k) => (
          <TransportKindIcon key={k} kind={k} size={stop.kinds.length > 1 ? 15 : 22} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-sm font-semibold text-graphite">{stop.name}</p>
        {typeof etaMinutes === 'number' && (
          <p className="text-xs text-forest">
            {etaMinutes === 0 ? 'прибуває' : `через ${etaMinutes} хв`}
          </p>
        )}
      </div>
      <FavoriteButton
        active={isFavorite}
        onToggle={() => (isFavorite ? removeStop(stop.id) : addStop(stop.id))}
        label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
      />
    </div>
  );
}
