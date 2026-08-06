import { useState } from 'react';
import { Clock, Timer, MapPin, Map as MapIcon, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { localStops } from '@/data/localData';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { getStationPhoto } from '@/data/stationPhotos';
import { trolleyTimetables } from '@/data/trolleyTimetables';
import { tramTimetables } from '@/data/tramTimetables';
import { busTimetables } from '@/data/busTimetables';
import { RouteTimetable } from '@/components/RouteTimetable';
import { RouteAlertBanner } from '@/components/RouteAlertBanner';
import type { TransportRoute } from '@/types/transport';

/**
 * Вміст картки маршруту — сама інформація (шапка, напрямки, бейджі,
 * послідовність зупинок і розклад руху, якщо є). Винесено окремо від
 * <RouteDetailPage />, щоб той самий контент можна було показати або
 * повноекранною сторінкою (прямі посилання /routes/:id), або компактно
 * в модальному вікні <RouteDetailModal /> — одним тапом по картці, без
 * переходу на весь застосунок.
 */
export function RouteDetailContent({ route, onNavigate }: { route: TransportRoute; onNavigate?: () => void }) {
  const routeColor = route.color || '#10b981';
  const navigate = useNavigate();

  // "Маршрут руху" (повна послідовність зупинок) за замовчуванням згорнутий —
  // список буває на 40+ пунктів і одразу займає весь екран модалки. Замість
  // цього показуємо компактний прев'ю (перша → остання зупинка) з кнопкою
  // "Розгорнути".
  const [stopsExpanded, setStopsExpanded] = useState(false);

  // Клік на "Показати на карті" (для будь-якого виду — автобус, тролейбус,
  // трамвай, метро) веде на /map?route=<id>: карта одразу підсвічує лінію
  // маршруту, підганяє камеру під його межі (fitBounds) і підсвічує його
  // зупинки. Раніше такої кнопки не існувало — маршрут можна було побачити
  // на карті лише випадково натиснувши точно на тонку лінію.
  const handleShowOnMap = () => {
    onNavigate?.();
    navigate(`/map?route=${route.id}`);
  };

  const handleStopOnMap = (stopId: string) => {
    onNavigate?.();
    navigate(`/map?route=${route.id}&stop=${stopId}`);
  };
  const timetableSource =
    route.kind === 'trolleybus' ? trolleyTimetables : route.kind === 'tram' ? tramTimetables : route.kind === 'bus' ? busTimetables : null;
  const timetable = timetableSource?.getByRouteNumber(route.number) ?? null;
  const timetableInfo = timetableSource?.getInfoByRouteNumber(route.number);
  const hasTimetable = !!timetable && timetable.stations.length > 0;

  const firstStopName = localStops.getById(route.stopIds[0])?.name ?? `Зупинка ${route.stopIds[0]}`;
  const lastStopName =
    localStops.getById(route.stopIds[route.stopIds.length - 1])?.name ?? `Зупинка ${route.stopIds[route.stopIds.length - 1]}`;

  return (
    <div className="space-y-5">
      <RouteAlertBanner routeNumber={route.number} kind={route.kind} />

      {/* Main Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface/60 p-4 backdrop-blur-xl shadow-sm">
        <div
          className="absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: routeColor }}
        />

        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-extrabold text-white shadow-md border border-white/20"
              style={{ backgroundColor: routeColor }}
            >
              {route.number}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-xl border-2 border-surface bg-surface text-ink-text shadow-sm">
              <TransportKindIcon kind={route.kind} size={16} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
              {KIND_LABELS_UK[route.kind]}
            </span>
            <h3 className="text-body-lg font-extrabold text-ink-text leading-snug">{route.name}</h3>
          </div>
        </div>

        <div className="mt-3.5 rounded-xl border border-border/40 bg-surface/80 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2 text-body-sm text-ink-text font-medium">
            <span className="truncate">{route.headsignForward}</span>
            <span className="shrink-0 text-ink-muted">↔</span>
            <span className="truncate">{route.headsignBackward}</span>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2 text-xs">
          {route.firstDeparture && route.lastDeparture && (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-surface/50 px-3 py-1.5 font-semibold text-ink-text backdrop-blur-md">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>{route.firstDeparture}–{route.lastDeparture}</span>
            </div>
          )}

          {route.intervalMinutes != null && (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-surface/50 px-3 py-1.5 font-semibold text-ink-text backdrop-blur-md">
              <Timer className="h-3.5 w-3.5 text-amber-500" />
              <span>інтервал ~{route.intervalMinutes} хв</span>
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-surface/50 px-3 py-1.5 font-semibold text-ink-text backdrop-blur-md">
            <MapPin className="h-3.5 w-3.5 text-ink-muted" />
            <span>{route.stopIds.length} зупинок</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleShowOnMap}
          className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98]"
          style={{ backgroundColor: routeColor }}
        >
          <MapIcon className="h-4 w-4" />
          Показати на карті
        </button>
      </div>

      {/* Route Stops Interactive Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-body font-bold text-ink-text">Маршрут руху</h2>
          <button
            type="button"
            onClick={() => setStopsExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg py-1 pl-2 pr-1 text-caption font-semibold text-ink-muted transition-all active:scale-95 hover:text-ink-text"
          >
            <span>{stopsExpanded ? 'Згорнути' : `Розгорнути · ${route.stopIds.length} зупинок`}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${stopsExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {!stopsExpanded ? (
          <button
            type="button"
            onClick={() => setStopsExpanded(true)}
            className="flex w-full items-center gap-3 rounded-3xl border border-border/60 bg-surface/50 p-4 text-left backdrop-blur-xl shadow-sm transition-all active:scale-[0.99] hover:bg-surface/70"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${routeColor}1f` }}>
              <MapPin className="h-4.5 w-4.5" style={{ color: routeColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-body-sm font-semibold text-ink-text">
                <span className="truncate">{firstStopName}</span>
                <span className="shrink-0 text-ink-muted">→</span>
                <span className="truncate">{lastStopName}</span>
              </div>
              <div className="mt-0.5 text-caption text-ink-muted">
                {route.stopIds.length} зупинок · натисніть, щоб побачити весь маршрут
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-ink-muted" />
          </button>
        ) : (
          <div className="relative rounded-3xl border border-border/60 bg-surface/50 p-4 backdrop-blur-xl shadow-sm">
            <div
              className="absolute left-[1.65rem] top-8 bottom-8 w-0.5 rounded-full opacity-60"
              style={{ backgroundColor: routeColor }}
            />

            <ol className="relative flex flex-col gap-3">
              {route.stopIds.map((stopId, idx) => {
                const photo = getStationPhoto(stopId);
                const stopData = localStops.getById(stopId);
                const stopName = stopData?.name ?? `Зупинка ${stopId}`;
                const isFirst = idx === 0;
                const isLast = idx === route.stopIds.length - 1;

                return (
                  <li
                    key={`${stopId}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleStopOnMap(stopId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleStopOnMap(stopId);
                      }
                    }}
                    className="relative flex cursor-pointer items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface/80 active:scale-[0.99]"
                  >
                    <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center">
                      <div
                        className={`h-3.5 w-3.5 rounded-full border-2 border-surface shadow-2xs transition-transform ${
                          isFirst || isLast ? 'scale-125 ring-2 ring-primary/20' : ''
                        }`}
                        style={{ backgroundColor: routeColor }}
                      />
                    </div>

                    {photo ? (
                      <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-xl border border-border/40 shadow-2xs">
                        <img
                          src={photo}
                          alt={stopName}
                          className="h-full w-full object-cover transition-transform hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-surface/80 text-ink-muted/60">
                        <MapPin className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-body-sm font-semibold text-ink-text">{stopName}</span>
                      </div>

                      {(isFirst || isLast) && (
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.2 rounded-md border ${
                            isFirst
                              ? 'bg-surface-soft text-ink-text border-border/40'
                              : 'bg-surface-soft text-ink-muted border-border/40'
                          }`}
                        >
                          {isFirst ? 'Початкова' : 'Кінцева'}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* Розклад руху — той самий компонент, тепер теж доступний прямо в модалці,
          без переходу на окрему сторінку. */}
      {hasTimetable && (
        <RouteTimetable timetable={timetable!} info={timetableInfo} accentColor={routeColor} />
      )}
    </div>
  );
}
