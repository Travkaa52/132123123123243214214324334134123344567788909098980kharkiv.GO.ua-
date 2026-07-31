import { SearchX } from 'lucide-react';
import { TransportKindIcon } from '@/components/TransportKindIcon';
import type { Stop, TransportRoute } from '@/types/transport';

interface MapSearchSuggestionsProps {
  stops: Stop[];
  routes: TransportRoute[];
  onStopSelect: (stopId: string) => void;
  onRouteSelect: (routeId: string) => void;
}

/**
 * Живі підказки пошуку на карті: інтерактивний список маршрутів та зупинок.
 * Використовує onMouseDown (з e.preventDefault()) для запобігання blur інпуту пошуку.
 */
export function MapSearchSuggestions({
  stops,
  routes,
  onStopSelect,
  onRouteSelect
}: MapSearchSuggestionsProps) {
  const hasNoResults = stops.length === 0 && routes.length === 0;

  if (hasNoResults) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-surface/95 p-6 text-center shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
        <SearchX className="h-6 w-6 text-ink-muted/60" />
        <p className="font-body text-sm font-medium text-ink-muted">Нічого не знайдено</p>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Результати пошуку"
      className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border/80 bg-surface/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 scrollbar-thin"
    >
      {/* Секція маршрутів */}
      {routes.length > 0 && (
        <div className="mb-2">
          <p className="px-3 pb-1 pt-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-ink-muted/70">
            Маршрути
          </p>
          <div className="space-y-0.5">
            {routes.map((route) => (
              <button
                key={route.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onRouteSelect(route.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-150 hover:bg-surface-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-black text-white shadow-sm"
                  style={{ backgroundColor: route.color }}
                >
                  {route.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm font-semibold text-ink-text">
                    {route.headsignForward} ↔ {route.headsignBackward}
                  </span>
                </span>
                <div className="shrink-0 text-ink-muted">
                  <TransportKindIcon kind={route.kind} size={18} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Розділювач, якщо є обидві секції */}
      {routes.length > 0 && stops.length > 0 && (
        <div className="my-1 border-t border-border/40" />
      )}

      {/* Секція зупинок */}
      {stops.length > 0 && (
        <div>
          <p className="px-3 pb-1 pt-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-ink-muted/70">
            Зупинки
          </p>
          <div className="space-y-0.5">
            {stops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onStopSelect(stop.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-150 hover:bg-surface-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-surface-soft border border-border/50 p-1">
                  {stop.kinds.slice(0, 2).map((k) => (
                    <TransportKindIcon key={k} kind={k} size={stop.kinds.length > 1 ? 12 : 18} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate font-body text-sm font-medium text-ink-text">
                  {stop.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
