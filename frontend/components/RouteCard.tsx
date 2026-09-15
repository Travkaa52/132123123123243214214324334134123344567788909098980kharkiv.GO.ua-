import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useRouteAlertsStore } from '@/store/useRouteAlertsStore';
import { findAlertForRoute } from '@/lib/routeAlerts';
import { FavoriteButton } from '@/components/FavoriteButton';
import { RouteDetailModal } from '@/components/RouteDetailModal';
import type { TransportRoute } from '@/types/transport';

export function RouteCard({ route }: { route: TransportRoute }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const isFavorite = useFavoritesStore((s) => s.isRouteFavorite(route.id));
  const addRoute = useFavoritesStore((s) => s.addRoute);
  const removeRoute = useFavoritesStore((s) => s.removeRoute);

  const alerts = useRouteAlertsStore((s) => s.alerts);
  const startPolling = useRouteAlertsStore((s) => s.startPolling);
  useEffect(() => {
    startPolling();
  }, [startPolling]);
  const hasActiveDelay = !!findAlertForRoute(alerts, route.number, route.kind);

  // Раніше картка була <Link> і вела на окрему сторінку /routes/:id на весь
  // застосунок. Тепер один тап по картці одразу відкриває повну інформацію
  // про маршрут (включно з розкладом руху) у модальному вікні — швидше і
  // без втрати контексту списку/фільтрів позаду.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setDetailOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDetailOpen(true);
        }
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-border/40 bg-surface-raised px-2.5 py-2 shadow-sm transition hover:shadow-md hover:border-border/60 active:scale-[0.98]"
    >
      <div className="relative shrink-0">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-extrabold text-white shadow-sm"
          style={{ backgroundColor: route.color }}
        >
          {route.number}
        </div>
        {hasActiveDelay && (
          <span
            title="Можлива затримка руху"
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
          >
            <AlertTriangle size={10} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-sm font-semibold text-ink-text">{route.name}</p>
        <p className="truncate text-[11px] text-ink-muted">
          {route.headsignForward} ↔ {route.headsignBackward}
        </p>
      </div>
      <FavoriteButton
        active={isFavorite}
        onToggle={() => (isFavorite ? removeRoute(route.id) : addRoute(route.id))}
        label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
      />

      <div onClick={(e) => e.stopPropagation()}>
        <RouteDetailModal route={route} open={detailOpen} onClose={() => setDetailOpen(false)} />
      </div>
    </div>
  );
}
