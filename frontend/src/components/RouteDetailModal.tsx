import { useState } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { RouteDetailContent } from '@/components/RouteDetailContent';
import { TransportKindIcon } from '@/components/TransportKindIcon';
import { ReportDelayModal } from '@/components/ReportDelayModal';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import type { TransportRoute } from '@/types/transport';

interface RouteDetailModalProps {
  route: TransportRoute | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Показує повну картку маршруту (інформація, послідовність зупинок,
 * розклад руху) одним тапом — у модальному вікні поверх поточного
 * екрана, а не окремою сторінкою на весь застосунок.
 */
export function RouteDetailModal({ route, open, onClose }: RouteDetailModalProps) {
  const isFavorite = useFavoritesStore((s) => (route ? s.isRouteFavorite(route.id) : false));
  const addRoute = useFavoritesStore((s) => s.addRoute);
  const removeRoute = useFavoritesStore((s) => s.removeRoute);
  const [isReportOpen, setIsReportOpen] = useState(false);

  if (!route) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={route.name}
    >
      <div className="max-h-[65vh] overflow-y-auto">
        <div className="-mt-1 mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-ink-muted">
            <TransportKindIcon kind={route.kind} size={18} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              aria-label="Повідомити про затримку цього маршруту"
              className="flex h-9 items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-3 text-xs font-bold text-red-600 backdrop-blur-md active:scale-95 transition-all"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Затримка</span>
            </button>
            <button
              type="button"
              onClick={() => (isFavorite ? removeRoute(route.id) : addRoute(route.id))}
              aria-label={isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-surface/80 px-3 text-xs font-bold text-ink-text backdrop-blur-md active:scale-95 transition-all"
            >
              <Star
                className={`h-4 w-4 transition-all ${
                  isFavorite ? 'fill-ink-text text-ink-text scale-110' : 'text-ink-muted'
                }`}
              />
              <span>{isFavorite ? 'В обраному' : 'В обране'}</span>
            </button>
          </div>
        </div>

        <RouteDetailContent route={route} />
      </div>

      <ReportDelayModal
        open={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        initialKind={route.kind}
        initialRouteNumber={route.number}
      />
    </Sheet>
  );
}
