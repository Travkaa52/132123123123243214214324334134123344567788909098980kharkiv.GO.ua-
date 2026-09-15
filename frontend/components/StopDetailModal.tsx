import { useMemo, useState } from 'react';
import { Clock, MapPin, ChevronRight, Navigation, Search, Copy, Footprints, Radio } from 'lucide-react';
import clsx from 'clsx';
import { Sheet } from '@/components/ui/Sheet';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useToastStore } from '@/store/useToastStore';
import { haversineMeters, walkMinutes, DEFAULT_WALK_SPEED_KMH } from '@/lib/reminderEngine';
import { localRoutes } from '@/data/localData';
import type { StopItem } from '@/data/localData';
import type { GeoPoint } from '@/types/transport';

interface StopDetailModalProps {
  stop: StopItem | null;
  arrivals: { routeId: string; etaMinutes: number }[];
  userPosition?: GeoPoint | null;
  onClose: () => void;
  onRouteSelect: (routeId: string) => void;
  onUseAsFrom: (stop: StopItem) => void;
  onUseAsTo: (stop: StopItem) => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

/**
 * Єдина нормальна модалка зупинки замість колишньої мішанини з двох
 * окремих плаваючих карток. Показує всі маршрути, що обслуговують
 * зупинку (з живим прогнозом прибуття, якщо є), дозволяє одразу
 * використати зупинку як точку "Звідки" або "Куди" для побудови поїздки,
 * а також відфільтрувати/знайти потрібний маршрут і побачити, скільки
 * пішки до зупинки від поточного місця користувача.
 */
export function StopDetailModal({
  stop,
  arrivals,
  userPosition,
  onClose,
  onRouteSelect,
  onUseAsFrom,
  onUseAsTo
}: StopDetailModalProps) {
  const isFavorite = useFavoritesStore((s) => s.isStopFavorite(stop?.id ?? ''));
  const addStop = useFavoritesStore((s) => s.addStop);
  const removeStop = useFavoritesStore((s) => s.removeStop);
  const showToast = useToastStore((s) => s.show);

  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const sortedArrivals = [...arrivals].sort((a, b) => a.etaMinutes - b.etaMinutes);
  const arrivalByRouteId = new Map(sortedArrivals.map((a) => [a.routeId, a.etaMinutes]));

  const allRoutes = useMemo(() => {
    if (!stop) return [];
    return stop.routeIds
      .map((id) => localRoutes.getById(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => (arrivalByRouteId.get(a.id) ?? 999) - (arrivalByRouteId.get(b.id) ?? 999));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  const availableKinds = useMemo(() => Array.from(new Set(allRoutes.map((r) => r.kind))), [allRoutes]);

  const routes = useMemo(() => {
    return allRoutes.filter((r) => {
      if (kindFilter && r.kind !== kindFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.headsignForward.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allRoutes, kindFilter, query]);

  if (!stop) return null;

  const distanceM = userPosition ? haversineMeters(userPosition, stop.position) : null;
  const nextArrival = sortedArrivals[0];
  const nextArrivalRoute = nextArrival ? localRoutes.getById(nextArrival.routeId) : null;

  const handleCopyLocation = () => {
    const coords = `${stop.position.lat.toFixed(6)}, ${stop.position.lng.toFixed(6)}`;
    navigator.clipboard
      ?.writeText(coords)
      .then(() => showToast('Координати скопійовано', 'success'))
      .catch(() => showToast('Не вдалося скопіювати', 'error'));
  };

  return (
    <Sheet open={!!stop} onClose={onClose} title={stop.name}>
      <div className="flex max-h-[70vh] flex-col gap-4">
        {/* Види транспорту, відстань і обране */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {stop.kinds.map((k) => (
              <span
                key={k}
                title={KIND_LABELS_UK[k]}
                className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-surface-soft ring-1 ring-border/50 shadow-xs"
              >
                <TransportKindIcon kind={k} size={19} />
              </span>
            ))}
            {distanceM !== null && (
              <span className="ml-1 flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-xs font-bold text-ink-muted">
                <Footprints className="h-3.5 w-3.5 text-primary" />
                {formatDistance(distanceM)} · {walkMinutes(distanceM, DEFAULT_WALK_SPEED_KMH)} хв
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopyLocation}
              aria-label="Скопіювати координати зупинки"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-text active:scale-90"
            >
              <Copy className="h-4 w-4" />
            </button>
            <FavoriteButton
              active={isFavorite}
              onToggle={() => (isFavorite ? removeStop(stop.id) : addStop(stop.id))}
              label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
            />
          </div>
        </div>

        {/* Найближче прибуття — хіро-картка */}
        {nextArrivalRoute && (
          <button
            type="button"
            onClick={() => onRouteSelect(nextArrivalRoute.id)}
            className="flex items-center justify-between gap-3 rounded-[20px] bg-gradient-to-br from-primary/15 to-primary/5 px-4 py-3.5 text-left ring-1 ring-primary/20 transition-transform active:scale-[0.98]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-10 w-12 shrink-0 items-center justify-center rounded-[13px] text-sm font-black text-white shadow-xs"
                style={{ backgroundColor: nextArrivalRoute.color }}
              >
                {nextArrivalRoute.number}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Найближчий рейс
                </span>
                <span className="truncate text-sm font-bold text-ink-text">{nextArrivalRoute.headsignForward}</span>
              </div>
            </div>
            <span className={clsx('shrink-0 font-display text-lg font-black', nextArrival.etaMinutes === 0 ? 'text-primary' : 'text-ink-text')}>
              {nextArrival.etaMinutes === 0 ? 'Зараз' : `${nextArrival.etaMinutes} хв`}
            </span>
          </button>
        )}

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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            <span>Маршрути на зупинці ({allRoutes.length})</span>
          </div>

          {/* Фільтр за видом транспорту — лише якщо їх реально декілька */}
          {availableKinds.length > 1 && (
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setKindFilter(null)}
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                  kindFilter === null ? 'bg-primary text-white' : 'bg-surface-soft text-ink-muted hover:text-ink-text'
                )}
              >
                Усі
              </button>
              {availableKinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                    kindFilter === k ? 'bg-primary text-white' : 'bg-surface-soft text-ink-muted hover:text-ink-text'
                  )}
                >
                  <TransportKindIcon kind={k} size={14} className={kindFilter === k ? 'ring-2 ring-white' : ''} />
                  {KIND_LABELS_UK[k]}
                </button>
              ))}
            </div>
          )}

          {/* Пошук маршруту — лише коли їх багато й прокручувати незручно */}
          {allRoutes.length > 6 && (
            <div className="relative mb-2.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Знайти маршрут або напрямок"
                className="w-full rounded-[14px] border border-border/50 bg-surface-soft py-2.5 pl-9 pr-3 text-sm font-medium text-ink-text placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}

          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
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
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface">
                        <TransportKindIcon kind={route.kind} size={17} />
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
            {allRoutes.length === 0 && (
              <li className="rounded-[16px] border border-border/40 bg-surface-soft/60 px-3 py-5 text-center text-sm text-ink-muted">
                Немає даних про маршрути цієї зупинки.
              </li>
            )}
            {allRoutes.length > 0 && routes.length === 0 && (
              <li className="flex flex-col items-center gap-1.5 rounded-[16px] border border-border/40 bg-surface-soft/60 px-3 py-6 text-center text-sm text-ink-muted">
                <Search className="h-5 w-5 text-ink-muted/60" />
                Нічого не знайдено за цим фільтром
              </li>
            )}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
