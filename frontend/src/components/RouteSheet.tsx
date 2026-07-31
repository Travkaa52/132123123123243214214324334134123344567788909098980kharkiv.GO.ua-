import { useState } from 'react';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { FavoriteButton } from '@/components/FavoriteButton';
import { RouteDetailModal } from '@/components/RouteDetailModal';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { localStops } from '@/data/localData';
import type { TransportRoute } from '@/types/transport';

interface RouteSheetProps {
  route: TransportRoute;
  onClose: () => void;
  onStopSelect?: (stopId: string) => void;
}

/**
 * Нижня картка обраного маршруту на карті — альтернатива <StopCard /> (вони
 * взаємовиключні: вибір маршруту знімає вибір зупинки і навпаки, керується
 * в <MapPage />). Показує напрямки, розклад і повний перелік зупинок —
 * тап по зупинці в списку виділяє її на карті так само, як тап по маркеру.
 */
export function RouteSheet({ route, onClose, onStopSelect }: RouteSheetProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const isFavorite = useFavoritesStore((s) => s.isRouteFavorite(route.id));
  const addRoute = useFavoritesStore((s) => s.addRoute);
  const removeRoute = useFavoritesStore((s) => s.removeRoute);

  const stops = route.stopIds.map((id) => localStops.getById(id)).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className="-mx-5 -mt-2 flex max-h-[70vh] flex-col overflow-hidden">
      <div className="flex items-start gap-3 border-b border-graphite/10 px-5 py-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white"
          style={{ backgroundColor: route.color }}
        >
          {route.number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <TransportKindIcon kind={route.kind} size={14} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite/50">
              {KIND_LABELS_UK[route.kind]} №{route.number}
            </p>
          </div>
          <p className="truncate font-body text-sm font-semibold text-graphite">
            {route.headsignForward} ↔ {route.headsignBackward}
          </p>
          <p className="text-xs text-graphite/50">
            {route.firstDeparture}–{route.lastDeparture} · інтервал ≈{route.intervalMinutes} хв · {stops.length} зупинок
          </p>
        </div>
        <FavoriteButton
          active={isFavorite}
          onToggle={() => (isFavorite ? removeRoute(route.id) : addRoute(route.id))}
          label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="shrink-0 rounded-full p-1.5 text-graphite/40 transition hover:bg-graphite/5 hover:text-graphite"
        >
          ✕
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {stops.map((stop, i) => (
          <li key={`${stop.id}-${i}`}>
            <button
              type="button"
              onClick={() => onStopSelect?.(stop.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-mint/20 active:scale-[0.99]"
            >
              <span className="flex flex-col items-center self-stretch">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: route.color }}
                />
                {i < stops.length - 1 && <span className="mt-0.5 w-px flex-1" style={{ backgroundColor: route.color, opacity: 0.35 }} />}
              </span>
              <span className="truncate py-1 font-body text-sm text-graphite">{stop.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="m-2 mt-0 rounded-xl2 bg-forest px-4 py-2.5 text-center font-body text-sm font-semibold text-white transition hover:bg-forest-dark active:scale-[0.99]"
      >
        Детальніше про маршрут
      </button>

      <RouteDetailModal route={route} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
