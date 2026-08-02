import { Clock, MapPin, ChevronRight, Navigation } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { localRoutes } from '@/data/localData';
import type { StopItem } from '@/data/localData';

interface StopDetailModalProps {
  stop: StopItem | null;
  arrivals: { routeId: string; etaMinutes: number }[];
  onClose: () => void;
  onRouteSelect: (routeId: string) => void;
  onUseAsFrom: (stop: StopItem) => void;
  onUseAsTo: (stop: StopItem) => void;
}

/**
 * Єдина нормальна модалка зупинки замість колишньої мішанини з двох
 * окремих плаваючих карток. Показує всі маршрути, що обслуговують
 * зупинку (з живим прогнозом прибуття, якщо є), і дозволяє одразу
 * використати зупинку як точку "Звідки" або "Куди" для побудови поїздки.
 */
export function StopDetailModal({ stop, arrivals, onClose, onRouteSelect, onUseAsFrom, onUseAsTo }: StopDetailModalProps) {
  const isFavorite = useFavoritesStore((s) => s.isStopFavorite(stop?.id ?? ''));
  const addStop = useFavoritesStore((s) => s.addStop);
  const removeStop = useFavoritesStore((s) => s.removeStop);

  if (!stop) return null;

  const sortedArrivals = [...arrivals].sort((a, b) => a.etaMinutes - b.etaMinutes);
  const arrivalByRouteId = new Map(sortedArrivals.map((a) => [a.routeId, a.etaMinutes]));

  const routes = stop.routeIds
    .map((id) => localRoutes.getById(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => (arrivalByRouteId.get(a.id) ?? 999) - (arrivalByRouteId.get(b.id) ?? 999));

  return (
    <Sheet open={!!stop} onClose={onClose} title={stop.name}>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto">
        {/* Види транспорту + обране */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {stop.kinds.map((k) => (
              <span key={k} className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-surface-soft">
                <TransportKindIcon kind={k} size={18} />
              </span>
            ))}
          </div>
          <FavoriteButton
            active={isFavorite}
            onToggle={() => (isFavorite ? removeStop(stop.id) : addStop(stop.id))}
            label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
          />
        </div>

        {/* Швидкі дії побудови маршруту */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onUseAsFrom(stop)}
            className="flex items-center justify-center gap-1.5 rounded-[16px] border border-border/50 bg-surface-soft px-3 py-3 text-sm font-bold text-ink-text transition-colors hover:bg-surface active:scale-[0.98]"
          >
            <Navigation className="h-4 w-4" />
            Звідси
          </button>
          <button
            type="button"
            onClick={() => onUseAsTo(stop)}
            className="flex items-center justify-center gap-1.5 rounded-[16px] border border-border/50 bg-surface-soft px-3 py-3 text-sm font-bold text-ink-text transition-colors hover:bg-surface active:scale-[0.98]"
          >
            <MapPin className="h-4 w-4" />
            Сюди
          </button>
        </div>

        {/* Маршрути, що проходять через зупинку */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            <span>Маршрути на зупинці ({routes.length})</span>
          </div>
          <ul className="flex flex-col gap-2">
            {routes.map((route) => {
              const eta = arrivalByRouteId.get(route.id);
              return (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => onRouteSelect(route.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-border/40 bg-surface-soft/80 px-3.5 py-3 text-sm transition-all hover:bg-surface active:scale-[0.98]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[12px] text-sm font-black text-white shadow-xs"
                        style={{ backgroundColor: route.color }}
                      >
                        {route.number}
                      </span>
                      <div className="flex min-w-0 flex-col text-left">
                        <span className="truncate font-bold text-ink-text">{KIND_LABELS_UK[route.kind]}</span>
                        <span className="truncate text-xs text-ink-muted">{route.headsignForward}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {typeof eta === 'number' ? (
                        <span className={`font-extrabold ${eta === 0 ? 'text-primary animate-pulse' : 'text-primary'}`}>
                          {eta === 0 ? 'Прибуває' : `≈ ${eta} хв`}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-ink-muted" />
                    </div>
                  </button>
                </li>
              );
            })}
            {routes.length === 0 && (
              <li className="rounded-[16px] border border-border/40 bg-surface-soft/60 px-3 py-5 text-center text-sm text-ink-muted">
                Немає даних про маршрути цієї зупинки.
              </li>
            )}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
